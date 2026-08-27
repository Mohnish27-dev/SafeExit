const compression = require('compression');

// SSE must never be compressed.
//
// `text/event-stream` is reported compressible by the `compressible` module, so
// compression's default filter gzips it. Measured against this app's own middleware: with
// the default filter, a client that asks for gzip receives exactly 10 bytes — the gzip
// header, 1f8b08... — and the event payload stays in zlib's buffer indefinitely. The
// browser sees a 200 with valid headers, EventSource fires `onopen`, and no event ever
// arrives. That is worse than no compression: a dead live feed that reports itself healthy.
//
// Kept in its own module so the rule is unit-testable against the exact function the app
// installs, rather than a copy of it. See test/compressionSse.test.js.
const sseSafeFilter = (req, res) => {
  const type = res.getHeader('Content-Type');
  if (typeof type === 'string' && type.includes('text/event-stream')) return false;
  return compression.filter(req, res);
};

module.exports = { sseSafeFilter };
