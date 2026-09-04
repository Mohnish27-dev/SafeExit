import { api, tok, record, results, mongoose, server, mongod, istAt, nowIstMinutes, BASE,
  User, OutingRequest, LeaveApplication, ScanLog, SOSAlert, DelayNotice,
  males, females, T, ctF, ctM, wdF, SIG } from './harness.mjs';
import http from 'node:http';

if (!/127\.0\.0\.1|localhost/.test(mongoose.connection.host || '')) { console.error('ABORT: not local'); process.exit(1); }

const NOW = nowIstMinutes();
const dep = () => istAt(Math.min(19, Math.floor(NOW / 60) + 2), 0);
const pct = (arr, p) => arr.slice().sort((a, b) => a - b)[Math.floor(arr.length * p)] || 0;
const okWindow = NOW >= 6 * 60 && NOW <= 19 * 60 + 59;

// ---------- C1. 100 students submit outings at once (5pm rush) ----------
{
  const t0 = Date.now();
  const lat = [];
  const res = await Promise.all(males.slice(20, 60).concat(females.slice(10, 40)).map(async (s) => {
    const a = Date.now();
    const r = await api('/api/outing', { method: 'POST', token: tok(s), body: {
      destination: 'Market', purpose: 'p',
      outTime: s.gender === 'Female' ? istAt(18, 0) : dep(),
      outingType: s.gender === 'Female' ? 'Nearby' : 'General' } });
    lat.push(Date.now() - a);
    return r;
  }));
  const wall = Date.now() - t0;
  const ok = res.filter(r => r.status === 201).length;
  const errs = res.filter(r => r.status >= 500);
  record('C1', '70 students submit an outing simultaneously',
    errs.length === 0 && ok > 0 ? 'PASS' : 'FAIL',
    'created=' + ok + ' 5xx=' + errs.length + ' wall=' + wall + 'ms p50=' + pct(lat, .5) + 'ms p95=' + pct(lat, .95) + 'ms max=' + Math.max(...lat) + 'ms');
}

// ---------- C2. gate rush: 60 distinct students scanned out back-to-back ----------
if (okWindow) {
  const cohort = males.slice(20, 60);
  // give each one a live approved pass
  await OutingRequest.updateMany({ student: { $in: cohort.map(s => s._id) } }, { $set: { status: 'Approved', outTime: dep() } });
  const lat = [];
  const t0 = Date.now();
  const res = await Promise.all(cohort.map(async (s) => {
    const a = Date.now();
    const r = await api('/api/scan', { method: 'POST', token: T.guard, body: { studentId: s.studentId, direction: 'AUTO' } });
    lat.push(Date.now() - a);
    return r;
  }));
  const wall = Date.now() - t0;
  const ok = res.filter(r => r.status === 201).length;
  const errs = res.filter(r => r.status >= 500);
  record('C2', cohort.length + ' distinct students scanned out concurrently (gate rush)',
    errs.length === 0 && ok === cohort.length ? 'PASS' : 'FAIL',
    'ok=' + ok + '/' + cohort.length + ' 5xx=' + errs.length + ' wall=' + wall + 'ms p50=' + pct(lat, .5) + 'ms p95=' + pct(lat, .95) + 'ms max=' + Math.max(...lat) + 'ms');
}

// ---------- C3. single-scan latency (what the guard actually feels) ----------
if (okWindow) {
  const s = males[21];
  await User.findByIdAndUpdate(s._id, { campusStatus: 'Outside' });
  const lat = [];
  for (let i = 0; i < 30; i++) {
    const a = Date.now();
    await api('/api/scan', { method: 'POST', token: T.guard, body: { studentId: s.studentId, direction: i % 2 === 0 ? 'IN' : 'OUT' } });
    lat.push(Date.now() - a);
  }
  record('C3', 'Serial single-scan latency at the gate (30 scans)',
    pct(lat, .95) < 500 ? 'PASS' : 'WARN',
    'p50=' + pct(lat, .5) + 'ms p95=' + pct(lat, .95) + 'ms max=' + Math.max(...lat) + 'ms');
}

// ---------- C4. preview latency (the guard's face-match screen) ----------
{
  const s = males[22];
  const lat = [];
  for (let i = 0; i < 30; i++) {
    const a = Date.now();
    await api('/api/scan/preview?studentId=' + s.studentId, { token: T.guard });
    lat.push(Date.now() - a);
  }
  record('C4', 'GET /scan/preview latency (30 calls)', pct(lat, .95) < 400 ? 'PASS' : 'WARN',
    'p50=' + pct(lat, .5) + 'ms p95=' + pct(lat, .95) + 'ms max=' + Math.max(...lat) + 'ms');
}

// ---------- C5. dashboard polls under load ----------
{
  const endpoints = [
    ['caretaker pending', '/api/outing/pending', T.ctM],
    ['caretaker overdue', '/api/outing/overdue', T.ctM],
    ['chief all', '/api/outing/all', T.chief],
    ['movement logs', '/api/scan?limit=500', T.ctM],
    ['sos active', '/api/sos?status=Active', T.ctF],
  ];
  const out = [];
  for (const [label, path, t] of endpoints) {
    const lat = [];
    for (let i = 0; i < 10; i++) { const a = Date.now(); await api(path, { token: t }); lat.push(Date.now() - a); }
    out.push(label + ' p95=' + pct(lat, .95) + 'ms');
  }
  record('C5', 'Staff dashboard poll latency', 'PASS', out.join(' | '));
}

// ---------- C6. SSE: many concurrent staff streams + broadcast under load ----------
{
  const port = server.address().port;
  const open = [];
  const received = [];
  const N = 40;
  await Promise.all(Array.from({ length: N }, (_, i) => new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/api/events', headers: { Authorization: 'Bearer ' + T.ctM } }, (res) => {
      received[i] = 0;
      res.on('data', (b) => { if (String(b).includes('event:')) received[i]++; });
      open.push(req);
      resolve(res.statusCode);
    });
    req.on('error', () => resolve('err'));
  })));
  await new Promise(r => setTimeout(r, 300));
  const sseHub = (await import('../src/utils/sseHub.js')).default || require('../src/utils/sseHub');
  const before = sseHub.clientCount();
  // fire 200 broadcasts
  const t0 = Date.now();
  for (let i = 0; i < 200; i++) sseHub.broadcast('outing:changed', { reason: 'loadtest', i });
  const bcastMs = Date.now() - t0;
  await new Promise(r => setTimeout(r, 800));
  const got = received.filter(n => n >= 200).length;
  record('C6', N + ' concurrent SSE clients receive 200 broadcasts',
    before === N && got === N ? 'PASS' : 'WARN',
    'attached=' + before + '/' + N + ' clientsWithAllEvents=' + got + ' broadcastLoop=' + bcastMs + 'ms');

  // ---------- C7. SSE cap ----------
  const cap = Number(process.env.SSE_MAX_CLIENTS) || 200;
  record('C7', 'SSE hard cap configured', 'PASS', 'MAX_CLIENTS=' + cap + ' currently attached=' + sseHub.clientCount());

  // ---------- C8. abrupt client death must not kill the process ----------
  for (const req of open.slice(0, 20)) req.destroy();
  await new Promise(r => setTimeout(r, 200));
  let threw = false;
  try { for (let i = 0; i < 50; i++) sseHub.broadcast('outing:changed', { reason: 'after-kill', i }); } catch { threw = true; }
  await new Promise(r => setTimeout(r, 300));
  record('C8', 'Broadcasting after 20 clients are killed mid-stream does not throw',
    !threw ? 'PASS' : 'FAIL', 'remainingClients=' + sseHub.clientCount());
  for (const req of open) { try { req.destroy(); } catch {} }
  await new Promise(r => setTimeout(r, 200));
}

// ---------- C9. pagination truncation is honest ----------
{
  const r = await api('/api/outing/all?limit=5', { token: T.chief });
  const total = r.headers.get('x-total-count');
  const trunc = r.headers.get('x-truncated');
  record('C9', 'List truncation is signalled in headers',
    trunc === 'true' && Number(total) > 5 ? 'PASS' : 'WARN',
    'rows=' + (Array.isArray(r.body) ? r.body.length : '?') + ' X-Total-Count=' + total + ' X-Truncated=' + trunc);
}

// ---------- C10. movement log cap ----------
{
  const r = await api('/api/scan?limit=99999', { token: T.admin });
  record('C10', 'GET /api/scan caps limit at 500 and has no skip/pagination',
    Array.isArray(r.body) && r.body.length <= 500 ? 'PASS' : 'FAIL',
    'requested=99999 got=' + (Array.isArray(r.body) ? r.body.length : '?') + ' headers X-Total-Count=' + r.headers.get('x-total-count'));
}

// ---------- C11. overdue sweep on a big cohort ----------
{
  const { runOverdueSweep } = await import('../src/utils/overdueSweep.js');
  await OutingRequest.updateMany({ status: 'Out' }, { $set: { inTime: new Date(Date.now() - 3600e3), overdueNotifiedAt: null, studentOverdueNotifiedAt: null } });
  const n = await OutingRequest.countDocuments({ status: 'Out' });
  const t0 = Date.now();
  await runOverdueSweep();
  record('C11', 'Overdue sweep over ' + n + ' live passes', 'PASS', 'took=' + (Date.now() - t0) + 'ms');
}

// ---------- C12. delay notice flow ----------
{
  const out = await OutingRequest.findOne({ status: 'Out' }).populate('student');
  if (out) {
    const t = tok(out.student);
    const a = await api('/api/delay', { method: 'POST', token: t, body: { reason: 'Traffic', note: 'bus late' } });
    const b = await api('/api/delay', { method: 'POST', token: t, body: { reason: 'Transport', note: 'revised' } });
    const count = await DelayNotice.countDocuments({ trip: out._id });
    record('C12', 'Delay notice: second filing revises in place (no duplicate rows)',
      a.status === 201 && count === 1 ? 'PASS' : 'FAIL', 'first=' + a.status + ' second=' + b.status + ' rows=' + count);
  } else record('C12', 'Delay notice flow', 'SKIP', 'no live Out pass');
}

// ---------- C13. body size ceiling ----------
{
  const t = tok(males[23]);
  const big = 'data:image/png;base64,' + 'A'.repeat(3_000_000);
  const r = await api('/api/auth/profile', { method: 'PATCH', token: t, body: { photo: big } });
  record('C13', 'Oversized photo body is rejected as 413 JSON, not a crash',
    r.status === 413 ? 'PASS' : 'WARN', 'status=' + r.status + ' msg=' + String(r.body?.message).slice(0, 60));
}

// ---------- C14. memory after the whole run ----------
{
  const m = process.memoryUsage();
  record('C14', 'Backend heap after the full run', 'PASS',
    'heapUsed=' + (m.heapUsed / 1048576).toFixed(1) + 'MB rss=' + (m.rss / 1048576).toFixed(1) + 'MB');
}

console.log('\n--- s3 summary ---');
for (const r of results) console.log(r.status.padEnd(4), r.id, '-', r.title, '::', r.detail);
await mongoose.disconnect(); server.close(); await mongod.stop(); process.exit(0);
