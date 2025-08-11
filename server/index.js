// Wayfarian Server Entry Point
const app = require('./app');
const http = require('http');

const PORT = process.env.PORT || 3001;
const server = http.createServer(app);

server.listen(PORT, () => {
  console.log(`🚀 Wayfarian API Server running on port ${PORT}`);
});

module.exports = { app, server };
