// Compression must never touch an SSE stream.
//
// This is the failure that hides: gzip buffers until its window fills, so a compressed
// event stream stays open, reports "connected", and delivers nothing. The dashboards
// would look fine and be dead. These tests pin the rule against the exact filter
// function app.js installs.

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const zlib = require('node:zlib');
const express = require('express');
const compression = require('compression');
const { sseSafeFilter } = require('../src/middlewares/compressionConfig');

// A response object with just enough surface for a compression filter.
const fakeRes = (contentType) => ({
  getHeader: (name) =>
    name.toLowerCase() === 'content-type' ? contentType : undefined,
});

test('sseSafeFilter refuses text/event-stream', () => {
  assert.equal(sseSafeFilter({}, fakeRes('text/event-stream')), false);
  assert.equal(sseSafeFilter({}, fakeRes('text/event-stream; charset=utf-8')), false);
});

test('sseSafeFilter still compresses ordinary API responses', () => {
  assert.equal(sseSafeFilter({}, fakeRes('application/json; charset=utf-8')), true);
  assert.equal(sseSafeFilter({}, fakeRes('text/html; charset=utf-8')), true);
});

test('sseSafeFilter tolerates a response with no Content-Type yet', () => {
  // compression.filter() defaults to compressing when it cannot tell the type; the point
  // here is that a missing header must not throw before the stream even starts.
  assert.doesNotThrow(() => sseSafeFilter({}, fakeRes(undefined)));
});

// The behavioural test: an event written now must arrive now, not when the stream closes.
test('an SSE event reaches the client before the stream ends', async () => {
  const app = express();
  app.use(compression({ filter: sseSafeFilter, threshold: 0 }));
  app.get('/stream', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write('event: hello\ndata: {"n":1}\n\n');
    // Deliberately left open — a client that has to wait for the end has already lost.
  });

  const server = await new Promise((resolve) => {
    const s = http.createServer(app).listen(0, '127.0.0.1', () => resolve(s));
  });

  try {
    const firstChunk = await new Promise((resolve, reject) => {
      const req = http.get(
        {
          port: server.address().port,
          host: '127.0.0.1',
          path: '/stream',
          headers: { 'Accept-Encoding': 'gzip, deflate' },
        },
        (res) => {
          assert.equal(
            res.headers['content-encoding'],
            undefined,
            'SSE response must not be content-encoded'
          );
          res.once('data', (chunk) => resolve(chunk.toString()));
          res.once('error', reject);
        }
      );
      req.once('error', reject);
      // If compression buffered the event, nothing arrives and this is the real result.
      setTimeout(() => reject(new Error('no event within 2s — the stream is buffered')), 2000).unref();
    });

    assert.match(firstChunk, /event: hello/);
    assert.match(firstChunk, /data: \{"n":1\}/);
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
});

// The other half: ordinary JSON should still be compressed, or the middleware is pointless.
test('a JSON response is still gzipped', async () => {
  const app = express();
  app.use(compression({ filter: sseSafeFilter, threshold: 0 }));
  app.get('/json', (req, res) => res.json({ rows: Array.from({ length: 200 }, (_, i) => i) }));

  const server = await new Promise((resolve) => {
    const s = http.createServer(app).listen(0, '127.0.0.1', () => resolve(s));
  });

  try {
    const { encoding, body } = await new Promise((resolve, reject) => {
      http
        .get(
          {
            port: server.address().port,
            host: '127.0.0.1',
            path: '/json',
            headers: { 'Accept-Encoding': 'gzip' },
          },
          (res) => {
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () =>
              resolve({ encoding: res.headers['content-encoding'], body: Buffer.concat(chunks) })
            );
            res.on('error', reject);
          }
        )
        .on('error', reject);
    });

    assert.equal(encoding, 'gzip');
    const parsed = JSON.parse(zlib.gunzipSync(body).toString());
    assert.equal(parsed.rows.length, 200);
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
});
