// The last two middlewares in the stack.
//
// Without these, two common failures reach the client as Express's built-in HTML error
// page: a malformed JSON body (express.json() throws a SyntaxError) and a request to a
// path that matches no route. The frontend's apiFetch does `res.json()` on every
// response, so an HTML body surfaces as "Unexpected token '<'" — a parse error that
// tells the student nothing and the on-call nobody. Every failure leaves here as JSON.

// Unmatched path. Registered with a bare app.use() rather than a wildcard path, because
// Express 5's path-to-regexp rejects the old '*' form.
const notFound = (req, res) => {
  res.status(404).json({ message: `Cannot ${req.method} ${req.originalUrl}` });
};

// Anything a handler threw or passed to next(). Four arguments — Express identifies error
// middleware by arity, so none of them may be removed even if unused.
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  // Mid-stream failures (an SSE connection dying, a response already flushed) cannot be
  // answered with a status line that has already gone out. Hand back to Express, which
  // closes the socket — anything else throws ERR_HTTP_HEADERS_SENT on top of the original.
  if (res.headersSent) return next(err);

  // Body the JSON parser could not read. `err.body` holds the offending bytes; it is
  // deliberately not echoed back.
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'Request body is not valid JSON.' });
  }

  // Past express.json()'s 2mb ceiling — most likely an oversized face photo.
  if (err.type === 'entity.too.large') {
    return res.status(413).json({
      message: 'That upload is too large. Please use a smaller image and try again.',
    });
  }

  // A cast error on a route param: /api/outing/not-an-objectid. A client mistake, not ours.
  if (err.name === 'CastError') {
    return res.status(400).json({ message: `Malformed ${err.path || 'identifier'}.` });
  }

  const status = Number.isInteger(err.status) || Number.isInteger(err.statusCode)
    ? err.status || err.statusCode
    : 500;

  // A 500 is our bug: log it with the stack and the route, and tell the client nothing
  // about internals. Client errors (4xx) carry their own message safely.
  if (status >= 500) {
    console.error(`[error] ${req.method} ${req.originalUrl}:`, err.stack || err.message);
    return res.status(status).json({ message: 'Something went wrong on our end.' });
  }

  return res.status(status).json({ message: err.message || 'Request could not be processed.' });
};

module.exports = { notFound, errorHandler };
