'use strict';
// Test-only process; runs the real server with an ephemeral loopback port/DB.
const { createVNextServer } = require('../server');
const app = createVNextServer({ profileDatabasePath: process.env.VNEXT_TEST_DATABASE });
app.wss.on('connection', socket => {
  socket.once('close', () => process.send?.({
    type: 'peerClosed', matchId: socket.matchId, clientId: socket.clientId,
    messageListeners: socket.listenerCount('message')
  }));
});
app.start({ host: '127.0.0.1', port: 0 }).then(address => {
  process.send({ type: 'ready', port: address.port });
}).catch(error => { console.error(error); process.exit(1); });
process.on('SIGTERM', () => app.close().then(() => process.exit(0)));
