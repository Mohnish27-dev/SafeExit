const sseHub = require('../utils/sseHub');

// GET /api/events — private (staff), SSE
//
// Every domain currently publishes into the same in-memory hub, so a single
// staff connection can carry outing, leave, SOS and delay events.
// Keeping one connection per dashboard tab avoids exhausting the browser's
// HTTP/1.1 per-origin connection pool and blocking ordinary API requests.
const streamStaffEvents = (req, res) => {
  req.socket.setTimeout(0);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 3000\n\n');

  sseHub.addClient(res);

  const heartbeat = setInterval(() => res.write(': ping\n\n'), 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseHub.removeClient(res);
  });
};

module.exports = { streamStaffEvents };
