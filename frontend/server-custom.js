// Custom Next.js server with URL decode for route-group chunks
const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer(async (req, res) => {
    try {
      let decodedUrl = req.url;
      if (decodedUrl && decodedUrl.includes('%28')) {
        decodedUrl = decodedUrl.replace(/%28/g, '(').replace(/%29/g, ')');
        console.log(`[URL Decode] ${req.url} → ${decodedUrl}`);
        req.url = decodedUrl;
      }
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Server error:', err);
      res.statusCode = 500;
      res.end('Internal server error');
    }
  }).listen(port, (err) => {
    if (err) throw err;
    console.log(`✓ Ready in ${Date.now()}ms`);
    console.log(`- Network:      http://${hostname}:${port}`);
  });
});
