// Patch Node.js http server to decode %28/%29 in URLs
const http = require('http');
const https = require('https');

function patchServer(module) {
  const originalCreateServer = module.createServer;
  module.createServer = function(...args) {
    const server = originalCreateServer.apply(module, args);
    
    // Intercept at the request event level
    const originalOn = server.on.bind(server);
    server.on = function(event, listener) {
      if (event === 'request') {
        return originalOn(event, function(req, res) {
          // Decode URL before passing to handler
          if (req.url && (req.url.includes('%28') || req.url.includes('%29'))) {
            const decoded = req.url.replace(/%28/g, '(').replace(/%29/g, ')');
            console.log(`[URL Decode] ${req.url} → ${decoded}`);
            req.url = decoded;
          }
          return listener(req, res);
        });
      }
      return originalOn(event, listener);
    };
    
    return server;
  };
}

// Patch both http and https
patchServer(http);
patchServer(https);
