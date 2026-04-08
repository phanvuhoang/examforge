const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');

const hostname = process.env.HOSTNAME || '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({
  dir: __dirname,
  hostname,
  port,
  customServer: true,
});
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer(async (req, res) => {
    try {
      // Decode percent-encoded parens so Next.js can serve chunks like
      // /_next/static/chunks/app/(dashboard)/layout-xxx.js correctly.
      // Browsers request %28dashboard%29 but standalone server only matches ().
      if (req.url) {
        req.url = decodeURIComponent(req.url);
      }
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('internal server error');
    }
  }).listen(port, hostname, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});
