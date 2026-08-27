// In-memory pub/sub for Server-Sent Events.
//
// Every domain (outing, leave, SOS, delay notices) publishes into this one hub, so a single
// staff dashboard connection carries all of them. That is deliberate: one connection per
// tab avoids exhausting the browser's HTTP/1.1 per-origin pool and starving ordinary API
// requests.
//
// ---- Why this file is defensive ----
//
// broadcast() used to be a bare `res.write()` loop over the client set. Three ways that
// bites on a real gate:
//
//   1. A response whose socket has already gone throws on write. Inside a for-loop with no
//      try/catch, the first dead client aborts the broadcast for every client after it —
//      and the throw propagates out of whatever request triggered it.
//   2. res.write() returns false when the kernel buffer is full. Ignoring that return value
//      means a slow consumer (a caretaker on bad hostel wifi, a laptop that slept) buffers
//      events in this process's heap without limit.
//   3. A dead-but-not-yet-removed response emits an 'error' event. With no listener, that
//      is an unhandled 'error' — process-fatal.
//
// None of these show up in testing, because in testing clients disconnect cleanly.

const clients = new Set();

const num = (value, fallback) => Number(value) || fallback;

// Hard ceiling on concurrent streams. Staff dashboards number in the tens, so this is far
// above normal and exists only to stop an unbounded fan-out from a reconnect storm.
const MAX_CLIENTS = () => num(process.env.SSE_MAX_CLIENTS, 200);

// A client that has let this much unflushed data pile up is not reading. Dropping it is
// kinder than growing the heap forever — the browser's EventSource reconnects on its own
// (the `retry: 3000` below tells it to), so a transient stall self-heals.
const MAX_BUFFERED_BYTES = () => num(process.env.SSE_MAX_BUFFERED_BYTES, 1024 * 1024);

// 25s, and this number is load-bearing: the Next rewrite kills any proxied request at a
// hard 30s (proxyTimeout defaults to 30000 in next/dist/server/lib/router-utils). A
// heartbeat above 30s would let the proxy tear down every idle stream on a timer. Do not
// "tidy" this to 30s or 60s.
const HEARTBEAT_MS = 25000;

const drop = (res) => {
  clients.delete(res);
  try {
    if (!res.writableEnded) res.end();
  } catch {
    // Already torn down; nothing to do.
  }
};

const addClient = (res) => {
  if (clients.size >= MAX_CLIENTS()) {
    console.warn(`[sse] refusing new client: at cap (${MAX_CLIENTS()})`);
    return false;
  }
  clients.add(res);
  return true;
};

const removeClient = (res) => {
  clients.delete(res);
};

const broadcast = (event, data) => {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

  // Snapshot: drop() mutates the set, and mutating a Set mid-iteration is how you skip
  // clients.
  for (const res of [...clients]) {
    if (res.writableEnded || res.destroyed) {
      clients.delete(res);
      continue;
    }
    try {
      const flushed = res.write(payload);
      if (!flushed && res.writableLength > MAX_BUFFERED_BYTES()) {
        console.warn(`[sse] dropping a client: ${res.writableLength} bytes unflushed`);
        drop(res);
      }
    } catch (err) {
      // One unwritable client must never stop the others from getting the event.
      clients.delete(res);
    }
  }
};

// Everything an SSE endpoint needs: headers, registration, heartbeat, teardown.
//
// This was copy-pasted into five controllers, each with its own unguarded
// `setInterval(() => res.write(': ping'))` — a write to a dead socket throws from inside a
// timer callback, where there is no request to catch it. Fixing it in one place is the
// point.
//
// Returns false when the hub is at capacity and the response has been closed.
const attach = (req, res) => {
  // No socket-level idle timeout: this connection is meant to stay open.
  req.socket.setTimeout(0);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // nginx buffers proxied responses by default, which would hold events back until the
    // buffer fills. This turns that off for the stream.
    'X-Accel-Buffering': 'no',
  });
  // Tells the browser's EventSource how soon to reconnect after a drop.
  res.write('retry: 3000\n\n');

  if (!addClient(res)) {
    res.end();
    return false;
  }

  // Without this listener a dead response's 'error' event is unhandled and takes the
  // process down.
  res.on('error', () => drop(res));

  const heartbeat = setInterval(() => {
    if (res.writableEnded || res.destroyed) {
      clearInterval(heartbeat);
      clients.delete(res);
      return;
    }
    try {
      res.write(': ping\n\n');
    } catch {
      clearInterval(heartbeat);
      drop(res);
    }
  }, HEARTBEAT_MS);

  const teardown = () => {
    clearInterval(heartbeat);
    removeClient(res);
  };
  req.on('close', teardown);
  res.on('close', teardown);

  return true;
};

// Used by the graceful shutdown in server.js: an open SSE response keeps the HTTP server
// from ever finishing server.close(), so the streams have to be ended explicitly.
const closeAll = () => {
  const count = clients.size;
  for (const res of [...clients]) drop(res);
  return count;
};

const clientCount = () => clients.size;

module.exports = { addClient, removeClient, broadcast, attach, closeAll, clientCount };
