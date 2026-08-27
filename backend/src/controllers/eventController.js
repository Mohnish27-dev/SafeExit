const sseHub = require('../utils/sseHub');

// GET /api/events — private (staff), SSE
//
// Every domain currently publishes into the same in-memory hub, so a single
// staff connection can carry outing, leave, SOS and delay events.
// Keeping one connection per dashboard tab avoids exhausting the browser's
// HTTP/1.1 per-origin connection pool and blocking ordinary API requests.
const streamStaffEvents = (req, res) => {
  sseHub.attach(req, res);
};

module.exports = { streamStaffEvents };
