// Local dev server: serves ./public and runs ./api/check.js. No Vercel account needed.
const http = require('http'), fs = require('fs'), path = require('path');
const check = require('./api/check.js');
const PORT = process.env.PORT || 3000, ROOT = path.join(__dirname, 'public');
const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.csv': 'text/csv',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png'
};

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  if (u.pathname === '/api/check') {
    req.query = Object.fromEntries(u.searchParams);
    res.status = c => (res.statusCode = c, res);
    res.json = o => (res.setHeader('Content-Type', 'application/json'), res.end(JSON.stringify(o)));
    return check(req, res);
  }
  const file = path.join(ROOT, path.normalize(u.pathname === '/' ? '/index.html' : u.pathname));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.statusCode = 404; return res.end('Not found'); }
  res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-cache');
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log('Running at http://localhost:' + PORT));
