const test = require('node:test');
const assert = require('node:assert/strict');

const { readPageParams, sendPage, PAGE_HEADERS } = require('../src/utils/pagination');

const recorder = () => {
  const res = { body: null, headers: {} };
  res.set = (headers) => {
    Object.assign(res.headers, headers);
    return res;
  };
  res.json = (body) => {
    res.body = body;
    return res;
  };
  return res;
};

const withEnv = async (vars, fn) => {
  const saved = {};
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
};

test('readPageParams applies the default window when nothing is asked for', () => {
  assert.deepEqual(readPageParams({ query: {} }), { limit: 200, skip: 0 });
  // A handler with no query object at all must not throw.
  assert.deepEqual(readPageParams({}), { limit: 200, skip: 0 });
});

test('readPageParams honours a smaller window and a skip', () => {
  assert.deepEqual(readPageParams({ query: { limit: '25', skip: '50' } }), { limit: 25, skip: 50 });
});

test('readPageParams clamps to the hard ceiling', async () => {
  await withEnv({ PAGE_MAX_LIMIT: '1000' }, () => {
    // The whole point of the ceiling: a caller cannot ask for the unbounded response back.
    assert.equal(readPageParams({ query: { limit: '999999' } }).limit, 1000);
  });
});

test('readPageParams falls back rather than 400ing on garbage', () => {
  // A dashboard carrying a stale or hand-edited query string should still render.
  assert.deepEqual(readPageParams({ query: { limit: 'abc' } }), { limit: 200, skip: 0 });
  assert.deepEqual(readPageParams({ query: { limit: '-5' } }), { limit: 200, skip: 0 });
  assert.deepEqual(readPageParams({ query: { limit: '0' } }), { limit: 200, skip: 0 });
  assert.deepEqual(readPageParams({ query: { skip: '-1' } }), { limit: 200, skip: 0 });
});

test('readPageParams does not let parseInt salvage a window out of non-numbers', () => {
  // Each of these is a case bare parseInt accepts, and each yields a window nobody asked
  // for. Because a short window suppresses the count query, the response would then also
  // report itself complete — the exact silent-truncation failure this module prevents.
  assert.equal(readPageParams({ query: { limit: '12abc' } }).limit, 200); // parseInt: 12
  assert.equal(readPageParams({ query: { limit: '1e9' } }).limit, 200); //   parseInt: 1
  assert.equal(readPageParams({ query: { limit: '2.7' } }).limit, 200); //   parseInt: 2
  // Express 5 hands over an array for a repeated param; it stringifies to '1,2'.
  assert.equal(readPageParams({ query: { limit: ['1', '2'] } }).limit, 200);
  assert.equal(readPageParams({ query: { skip: ['5', '9'] } }).skip, 0);
  // An object (?limit[a]=1) must not throw or coerce either.
  assert.equal(readPageParams({ query: { limit: { a: '1' } } }).limit, 200);
  // Leading/trailing whitespace around a real number is still a real number.
  assert.equal(readPageParams({ query: { limit: ' 25 ' } }).limit, 25);
});

test('readPageParams lets a handler lower the default without touching the ceiling', () => {
  assert.equal(readPageParams({ query: {} }, 20).limit, 20);
  // An explicit ask still wins over the handler's default.
  assert.equal(readPageParams({ query: { limit: '75' } }, 20).limit, 75);
});

test('readPageParams reads the env-configured window', async () => {
  await withEnv({ PAGE_DEFAULT_LIMIT: '10', PAGE_MAX_LIMIT: '15' }, () => {
    assert.equal(readPageParams({ query: {} }).limit, 10);
    assert.equal(readPageParams({ query: { limit: '500' } }).limit, 15);
  });
});

test('sendPage keeps the body a plain array', async () => {
  const res = recorder();
  await sendPage(res, [{ _id: 'a' }, { _id: 'b' }], {
    limit: 200,
    skip: 0,
    label: 'test/short',
    count: async () => { throw new Error('count() must not run for a short window'); },
  });

  // Existing callers do `data.map(...)` — an envelope object would break every one of them.
  assert.ok(Array.isArray(res.body));
  assert.equal(res.body.length, 2);
});

test('sendPage skips the count query when the window came back short', async () => {
  let counted = 0;
  const res = recorder();
  await sendPage(res, [{}, {}, {}], {
    limit: 200,
    skip: 0,
    label: 'test/short',
    count: async () => { counted += 1; return 3; },
  });

  // 3 rows out of a 200 window proves there is no fourth: the extra countDocuments would
  // double the queries on every list endpoint for no new information.
  assert.equal(counted, 0);
  assert.equal(res.headers['X-Total-Count'], '3');
  assert.equal(res.headers['X-Truncated'], 'false');
});

test('sendPage counts and flags truncation on a full window', async () => {
  const rows = Array.from({ length: 5 }, (_, i) => ({ _id: i }));
  const res = recorder();
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (msg) => warnings.push(msg);

  try {
    await sendPage(res, rows, { limit: 5, skip: 0, label: 'test/full', count: async () => 42 });
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(res.headers['X-Total-Count'], '42');
  assert.equal(res.headers['X-Page-Limit'], '5');
  assert.equal(res.headers['X-Truncated'], 'true');
  // A silently short list is the failure mode this whole module exists to avoid: staff
  // would work a queue they believe is complete. It has to reach the operator's logs.
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /test\/full: sent 5 of 42 rows/);
});

test('sendPage reports the last page as not truncated', async () => {
  const rows = Array.from({ length: 5 }, (_, i) => ({ _id: i }));
  const res = recorder();
  // skip 40 + a full window of 5 == 45 total: this is exactly the end of the list.
  await sendPage(res, rows, { limit: 5, skip: 40, label: 'test/last', count: async () => 45 });

  assert.equal(res.headers['X-Page-Skip'], '40');
  assert.equal(res.headers['X-Truncated'], 'false');
});

test('sendPage judges truncation on the window, not on what survived a post-fetch filter', async () => {
  const res = recorder();
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (msg) => warnings.push(msg);

  try {
    // The handlers that drop rows after fetching (expired passes, non-overdue trips) pass
    // `fetched`. Judging on rows.length would call a full window of 10 "short" because 2
    // survived, and report a complete list when 90 rows were never looked at.
    await sendPage(res, [{}, {}], {
      limit: 10,
      skip: 0,
      label: 'test/filtered',
      count: async () => 100,
      fetched: 10,
    });
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(res.headers['X-Total-Count'], '100');
  assert.equal(res.headers['X-Truncated'], 'true');
  assert.equal(res.body.length, 2);
  assert.equal(warnings.length, 1);
});

test('PAGE_HEADERS lists exactly the headers sendPage writes', async () => {
  const res = recorder();
  await sendPage(res, [], { limit: 200, skip: 0, label: 'test/empty', count: async () => 0 });

  // app.js feeds this list to CORS `exposedHeaders`. A header written but not listed is
  // invisible to fetch() in the browser, which is a silent failure.
  assert.deepEqual(Object.keys(res.headers).sort(), [...PAGE_HEADERS].sort());
});
