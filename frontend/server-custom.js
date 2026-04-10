// Load URL decode patch BEFORE server.js loads
const path = require('path');
require(path.join(__dirname, 'server-patch.js'));
require(path.join(__dirname, 'server.js'));
