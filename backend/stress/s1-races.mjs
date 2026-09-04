import { api, tok, record, results, mongoose, server, mongod, istAt, nowIstMinutes,
  User, OutingRequest, LeaveApplication, ScanLog, males, females, T, guard } from './harness.mjs';

// Safety: prove we are NOT talking to Atlas.
if (!/127\.0\.0\.1|localhost/.test(mongoose.connection.host || '')) {
  console.error('ABORT: not connected to a local mongo. host=', mongoose.connection.host);
  process.exit(1);
}
console.log('DB host =', mongoose.connection.host, '(local, safe)\n');

const NOW = nowIstMinutes();
const futureMaleDeparture = () => istAt(Math.min(19, Math.floor(NOW / 60) + 2), 0);
const okWindow = NOW >= 6 * 60 && NOW <= 19 * 60 + 59;

// ---------- A1. concurrent outing creation ----------
{
  const s = males[0], t = tok(s);
  const N = 25;
  const res = await Promise.all(Array.from({ length: N }, () =>
    api('/api/outing', { method: 'POST', token: t, body: {
      destination: 'Market', purpose: 'x', outTime: futureMaleDeparture(), outingType: 'General' } })));
  const created = res.filter(r => r.status === 201).length;
  const conflict = res.filter(r => r.status === 409).length;
  const other = res.filter(r => r.status !== 201 && r.status !== 409);
  const live = await OutingRequest.countDocuments({ student: s._id, status: { $in: ['Pending','Approved','Forwarded','Out'] } });
  record('A1', N + ' concurrent POST /api/outing (same student)',
    created === 1 && live === 1 ? 'PASS' : 'FAIL',
    '201=' + created + ' 409=' + conflict + ' other=' + other.map(o => o.status + ':' + String(o.body?.message).slice(0, 60)).join('|') + ' liveInDb=' + live);
}

// ---------- A2. concurrent leave creation ----------
{
  const s = males[1], t = tok(s);
  const N = 25;
  const body = { destination: 'Home', reason: 'family', leaveDate: istAt(9, 0, 2), returnDate: istAt(9, 0, 5), acknowledgement: true };
  const res = await Promise.all(Array.from({ length: N }, () => api('/api/leave', { method: 'POST', token: t, body })));
  const created = res.filter(r => r.status === 201).length;
  const other = res.filter(r => r.status !== 201 && r.status !== 409);
  const live = await LeaveApplication.countDocuments({ student: s._id, status: { $in: ['Pending','Approved','Forwarded','Out'] } });
  record('A2', N + ' concurrent POST /api/leave (same student)',
    created === 1 && live === 1 ? 'PASS' : 'FAIL',
    '201=' + created + ' other=' + other.map(o => o.status + ':' + String(o.body?.message).slice(0, 60)).join('|') + ' liveInDb=' + live);
}

// ---------- A3. cross-collection stacking ----------
{
  const s = males[2], t = tok(s);
  const o = await api('/api/outing', { method: 'POST', token: t, body: {
    destination: 'Market', purpose: 'x', outTime: futureMaleDeparture(), outingType: 'General' } });
  const l = await api('/api/leave', { method: 'POST', token: t, body: {
    destination: 'Home', reason: 'family', leaveDate: istAt(9, 0, 2), returnDate: istAt(9, 0, 5), acknowledgement: true } });
  const liveO = await OutingRequest.countDocuments({ student: s._id, status: { $in: ['Pending','Approved','Forwarded','Out'] } });
  const liveL = await LeaveApplication.countDocuments({ student: s._id, status: { $in: ['Pending','Approved','Forwarded','Out'] } });
  record('A3', 'One student holding an active outing AND an active leave at once',
    (liveO && liveL) ? 'FAIL' : 'PASS',
    'outing=' + o.status + ' leave=' + l.status + ' -> liveOutings=' + liveO + ' liveLeaves=' + liveL);
}

// ---------- A4/A5. concurrent gate scans ----------
if (okWindow) {
  const s = males[3], t = tok(s);
  const c = await api('/api/outing', { method: 'POST', token: t, body: {
    destination: 'Market', purpose: 'x', outTime: futureMaleDeparture(), outingType: 'General' } });
  const N = 20;
  const res = await Promise.all(Array.from({ length: N }, () =>
    api('/api/scan', { method: 'POST', token: T.guard, body: { student: s._id.toString(), direction: 'OUT' } })));
  const ok = res.filter(r => r.status === 201).length;
  const c409 = res.filter(r => r.status === 409).length;
  const bad = res.filter(r => ![201, 409].includes(r.status));
  const after = await User.findById(s._id).select('campusStatus');
  const logs = await ScanLog.countDocuments({ student: s._id, direction: 'OUT' });
  record('A4', N + ' concurrent gate scans OUT (same student)',
    ok === 1 && logs === 1 && after.campusStatus === 'Outside' ? 'PASS' : 'FAIL',
    '201=' + ok + ' 409=' + c409 + ' bad=' + bad.map(b => b.status + ':' + String(b.body?.message).slice(0, 50)).join('|') + ' outLogs=' + logs + ' campus=' + after.campusStatus + ' create=' + c.status);

  const res2 = await Promise.all(Array.from({ length: N }, () =>
    api('/api/scan', { method: 'POST', token: T.guard, body: { student: s._id.toString(), direction: 'IN' } })));
  const ok2 = res2.filter(r => r.status === 201).length;
  const inLogs = await ScanLog.countDocuments({ student: s._id, direction: 'IN' });
  const after2 = await User.findById(s._id).select('campusStatus');
  const pass = await OutingRequest.findOne({ student: s._id }).sort({ createdAt: -1 });
  record('A5', N + ' concurrent gate scans IN (same student)',
    ok2 === 1 && inLogs === 1 && after2.campusStatus === 'Inside' && pass.status === 'Returned' ? 'PASS' : 'FAIL',
    '201=' + ok2 + ' inLogs=' + inLogs + ' campus=' + after2.campusStatus + ' passStatus=' + pass.status + ' punctuality=' + pass.returnPunctuality);
} else {
  record('A4', 'concurrent gate scans OUT', 'SKIP', 'outside campus departure window (now ' + NOW + ' min IST)');
}

// ---------- A6. AUTO direction ----------
if (okWindow) {
  const s = males[4], t = tok(s);
  await api('/api/outing', { method: 'POST', token: t, body: {
    destination: 'Market', purpose: 'x', outTime: futureMaleDeparture(), outingType: 'General' } });
  const out = await api('/api/scan', { method: 'POST', token: T.guard, body: { studentId: s.studentId, direction: 'AUTO' } });
  const mid = await User.findById(s._id).select('campusStatus');
  const back = await api('/api/scan', { method: 'POST', token: T.guard, body: { studentId: s.studentId, direction: 'AUTO' } });
  const end = await User.findById(s._id).select('campusStatus');
  record('A6', 'AUTO direction single-scanner round trip (roll-number QR)',
    out.status === 201 && mid.campusStatus === 'Outside' && back.status === 201 && end.campusStatus === 'Inside' ? 'PASS' : 'FAIL',
    'out=' + out.status + '/' + out.body?.direction + ' mid=' + mid.campusStatus + ' in=' + back.status + '/' + back.body?.direction + ' end=' + end.campusStatus);
}

// ---------- A7. exit with NO approved pass ----------
{
  const s = males[5];
  const r = await api('/api/scan', { method: 'POST', token: T.guard, body: { student: s._id.toString(), direction: 'OUT' } });
  const st = await User.findById(s._id).select('campusStatus');
  record('A7', 'Gate refuses exit with no approved pass', r.status === 403 && st.campusStatus === 'Inside' ? 'PASS' : 'FAIL', 'status=' + r.status + ' campus=' + st.campusStatus);
}

// ---------- A8. permissive re-entry ----------
{
  const s = males[6];
  await User.findByIdAndUpdate(s._id, { campusStatus: 'Outside' });
  const r = await api('/api/scan', { method: 'POST', token: T.guard, body: { student: s._id.toString(), direction: 'IN' } });
  const st = await User.findById(s._id).select('campusStatus');
  record('A8', 'Gate allows re-entry with no pass (permissive IN, by design)',
    r.status === 201 && st.campusStatus === 'Inside' ? 'PASS' : 'FAIL', 'status=' + r.status + ' campus=' + st.campusStatus);
}

// ---------- A9. past departure time accepted at create ----------
{
  const s = males[7], t = tok(s);
  const c = await api('/api/outing', { method: 'POST', token: t, body: {
    destination: 'Market', purpose: 'x', outTime: istAt(6, 30), outingType: 'General' } });
  const r = await api('/api/scan', { method: 'POST', token: T.guard, body: { student: s._id.toString(), direction: 'OUT' } });
  const doc = c.body?._id ? await OutingRequest.findById(c.body._id) : null;
  record('A9', 'Outing with a PAST departure time (06:30 today) is accepted at create time',
    c.status === 201 ? 'FAIL' : 'PASS',
    'create=' + c.status + ' gateThenSaid=' + r.status + ' storedStatus=' + doc?.status);
}

// ---------- A10. leave pass double-use across collections at the gate ----------
{
  const s = males[8], t = tok(s);
  // approved leave for today, plus an approved outing -> which one does the gate burn?
  const lv = await LeaveApplication.create({ student: s._id, destination: 'Home', reason: 'r',
    leaveDate: istAt(Math.max(6, Math.floor(NOW / 60)), 0), returnDate: istAt(9, 0, 3), status: 'Approved', studentSignature: 'x' });
  const ou = await OutingRequest.create({ student: s._id, destination: 'M', purpose: 'p',
    outTime: futureMaleDeparture(), inTime: istAt(20, 0), status: 'Approved', outingType: 'General', studentSignature: 'x' });
  const out = await api('/api/scan', { method: 'POST', token: T.guard, body: { student: s._id.toString(), direction: 'OUT' } });
  const inn = await api('/api/scan', { method: 'POST', token: T.guard, body: { student: s._id.toString(), direction: 'IN' } });
  const lv2 = await LeaveApplication.findById(lv._id);
  const ou2 = await OutingRequest.findById(ou._id);
  const out2 = await api('/api/scan', { method: 'POST', token: T.guard, body: { student: s._id.toString(), direction: 'OUT' } });
  record('A10', 'Student with BOTH an approved outing and an approved leave can exit twice',
    out2.status === 201 ? 'FAIL' : 'PASS',
    'exit1=' + out.status + ' entry=' + inn.status + ' outing=' + ou2.status + ' leave=' + lv2.status + ' secondExit=' + out2.status);
}

console.log('\n--- s1 summary ---');
for (const r of results) console.log(r.status.padEnd(4), r.id, '-', r.title);
await mongoose.disconnect(); server.close(); await mongod.stop(); process.exit(0);
