// Inject URL decode patch into Next.js standalone server
// Must run BEFORE require('next/dist/server/lib/start-server') in server.js
const http = require('http');
const https = require('https');

// Patch both http and https createServer
['http', 'https'].forEach(mod => {
  const m = require(mod);
  const orig = m.createServer.bind(m);
  m.createServer = function(opts, handler) {
    const isHandler = typeof opts === 'function';
    const realHandler = isHandler ? opts : handler;
    const realOpts = isHandler ? undefined : opts;

    function patchedHandler(req, res) {
      if (req.url && req.url.includes('%28')) {
        req.url = req.url.replace(/%28/gi, '(').replace(/%29/gi, ')');
      }
      return realHandler.call(this, req, res);
    }

    if (realOpts !== undefined) {
      return orig(realOpts, patchedHandler);
    }
    return orig(patchedHandler);
  };
});

// Load the actual standalone server
require('./server.js');
