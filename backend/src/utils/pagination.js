// Bounded list responses.
//
// Every list endpoint here was `res.json(await Model.find(filter))` with no ceiling.
// That is fine for a hostel's pending queue (tens of rows) and ruinous for the
// campus-wide and history views, which grow for as long as the deployment lives: one
// request materialises every matching document into memory, serialises the lot, and
// holds it there until the socket drains. Two staff tabs refreshing during the 5 PM
// rush is enough to make that the whole event loop's problem.
//
// The response body stays a plain JSON array, so no existing caller breaks. What a
// caller *can* now learn, if it looks, is in the headers:
//
//   X-Total-Count  rows matching the filter, ignoring the window
//   X-Page-Limit   the window applied (never above the hard max)
//   X-Page-Skip    where the window started
//   X-Truncated    'true' when rows were withheld
//
// Truncation is also logged. A silently short list is worse than a slow one: staff
// would work a queue they believe is complete. See app.js for the CORS
// `exposedHeaders` that make these readable from the browser.

// parseInt is too forgiving to use directly on query input. It salvages a number out of
// things that are not numbers — parseInt('12abc') is 12, parseInt('1e9') is 1, and Express
// hands over an array for a repeated param, which stringifies so that ?limit=1&limit=2
// becomes parseInt('1,2') === 1. Each of those quietly returns a window nobody asked for,
// and a short window suppresses the count, so the response also claims to be complete.
// Reject anything that is not exactly an integer and let the caller's default stand.
const toInt = (value) => {
  if (typeof value === 'number') return Number.isInteger(value) ? value : NaN;
  if (typeof value !== 'string') return NaN;
  const trimmed = value.trim();
  return /^-?\d+$/.test(trimmed) ? Number.parseInt(trimmed, 10) : NaN;
};

const positive = (value, fallback) => {
  const n = toInt(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const nonNegative = (value, fallback) => {
  const n = toInt(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

const DEFAULT_LIMIT = () => positive(process.env.PAGE_DEFAULT_LIMIT, 200);
const MAX_LIMIT = () => positive(process.env.PAGE_MAX_LIMIT, 1000);

// A caller may ask for fewer rows, or for more up to the hard ceiling. Garbage
// (?limit=abc, ?limit=-5, ?limit=1&limit=2) falls back to the default instead of
// 400ing — a dashboard carrying a stale query string should still render.
const readPageParams = (req, defaultLimit) => {
  const fallback = positive(defaultLimit, DEFAULT_LIMIT());
  return {
    limit: Math.min(positive(req.query?.limit, fallback), MAX_LIMIT()),
    skip: nonNegative(req.query?.skip, 0),
  };
};

// `fetched` is how many rows the query returned, which is not always `rows.length`:
// several handlers drop rows after the fetch (expired passes, non-overdue trips), and
// truncation has to be judged on the window, not on what survived the filter.
//
// `count` is a thunk, not a number — a window that came back short proves there is
// nothing beyond it, so the extra countDocuments is skipped entirely for the common
// case of a queue smaller than the ceiling.
const sendPage = async (res, rows, { limit, skip, label, count, fetched }) => {
  const window = Number.isInteger(fetched) ? fetched : rows.length;
  const total = window < limit ? skip + window : await count();
  const truncated = skip + window < total;

  res.set({
    'X-Total-Count': String(total),
    'X-Page-Limit': String(limit),
    'X-Page-Skip': String(skip),
    'X-Truncated': truncated ? 'true' : 'false',
  });

  if (truncated) {
    console.warn(
      `[page] ${label}: sent ${window} of ${total} rows (skip=${skip}, limit=${limit}). ` +
        'Narrow the query or raise PAGE_DEFAULT_LIMIT — the caller is not seeing everything.'
    );
  }

  return res.json(rows);
};

// The header names, in one place, for app.js's CORS config to expose.
const PAGE_HEADERS = ['X-Total-Count', 'X-Page-Limit', 'X-Page-Skip', 'X-Truncated'];

module.exports = { readPageParams, sendPage, PAGE_HEADERS };
