// Wrapper around Next.js standalone server.js
// Patches HTTP request URL to decode %28/%29 → () for route-group chunks
const http = require('http');
const { parse } = require('url');

// Monkey-patch http.createServer to intercept all requests
const _createServer = http.createServer.bind(http);
http.createServer = function(opts, handler) {
  const wrappedHandler = typeof opts === 'function' ? opts : handler;
  const wrappedOpts = typeof opts === 'function' ? undefined : opts;

  const patchedHandler = function(req, res) {
    if (req.url) {
      req.url = req.url.replace(/%28/g, '(').replace(/%29/g, ')');
    }
    return wrappedHandler(req, res);
  };

  return wrappedOpts
    ? _createServer(wrappedOpts, patchedHandler)
    : _createServer(patchedHandler);
};

// Now load the real standalone server
require('./server.js');
