// Tells the browser whether a page may be shown inside an iframe.
// Looks at X-Frame-Options and CSP frame-ancestors on the final URL.
const dns = require('dns').promises, net = require('net');

const isPrivate = ip => {
  if (net.isIPv6(ip)) return /^(::1$|::$|f[cd]|fe80|::ffff:(10|127|169\.254|192\.168|172\.(1[6-9]|2\d|3[01]))\.)/i.test(ip);
  const [a, b] = ip.split('.').map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
         (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
};
const assertPublic = async u => {
  const x = new URL(u);
  if (!/^https?:$/.test(x.protocol)) throw new Error('bad protocol');
  const addrs = await dns.lookup(x.hostname, { all: true });
  if (addrs.some(a => isPrivate(a.address))) throw new Error('private address');
};

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
  const target = String(req.query.url || '');
  if (!target || target.length > 2000) return res.status(400).json({ ok: false, reason: 'bad url' });
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 6000);
  try {
    let url = target, r;
    for (let hop = 0; hop < 5; hop++) {
      await assertPublic(url);
      r = await fetch(url, { redirect: 'manual', signal: ac.signal,
        headers: { 'user-agent': 'Mozilla/5.0 (compatible; SitesBoard/1.0)', accept: 'text/html,*/*' } });
      const loc = r.headers.get('location');
      if (r.status >= 300 && r.status < 400 && loc) { url = new URL(loc, url).href; continue; }
      break;
    }
    clearTimeout(timer);
    r.body && r.body.cancel && r.body.cancel().catch(() => {});
    if (new URL(url).protocol === 'http:') return res.json({ ok: false, reason: 'http page cannot be framed on https' });
    const xfo = (r.headers.get('x-frame-options') || '').toLowerCase();
    if (/deny|sameorigin|allow-from/.test(xfo)) return res.json({ ok: false, reason: 'x-frame-options: ' + xfo });
    const fa = (r.headers.get('content-security-policy') || '').split(/[;,]/).map(s => s.trim())
      .find(s => /^frame-ancestors\s/i.test(s));
    if (fa) {
      const v = fa.split(/\s+/).slice(1);
      if (!v.includes('*') && !v.includes('https:')) return res.json({ ok: false, reason: 'csp: ' + fa });
    }
    res.json({ ok: true, status: r.status });
  } catch (e) {
    clearTimeout(timer);
    res.json({ ok: true, reason: 'unchecked' }); // unreachable from server: let the browser try
  }
};
