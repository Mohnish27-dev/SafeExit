import { api, tok, record, results, mongoose, server, mongod, istAt, nowIstMinutes,
  User, OutingRequest, LeaveApplication, SOSAlert, males, females, T,
  guard, admin, chief, ctF, ctM, wdF, SIG } from './harness.mjs';

if (!/127\.0\.0\.1|localhost/.test(mongoose.connection.host || '')) { console.error('ABORT: not local'); process.exit(1); }

const NOW = nowIstMinutes();
const dep = () => istAt(Math.min(19, Math.floor(NOW / 60) + 2), 0);

// A pending, caretaker-gated request from a FEMALE student (Market requires caretaker).
const makeFemaleMarketPending = async (s) => OutingRequest.create({
  student: s._id, destination: 'Market', purpose: 'p', outingType: 'Market',
  outTime: istAt(14, 0, 1), inTime: istAt(17, 30, 1), status: 'Pending',
  studentSignature: SIG, targetCaretaker: ctF._id,
});

// ---------- B1. Guard approving outing requests ----------
{
  const s = females[0];
  const r0 = await makeFemaleMarketPending(s);
  const r = await api('/api/outing/' + r0._id + '/status', { method: 'PATCH', token: T.guard, body: { status: 'Approved' } });
  const after = await OutingRequest.findById(r0._id);
  record('B1', 'A GATE GUARD can approve/mint an outing pass for any student',
    r.status === 201 || r.status === 200 ? 'FAIL' : 'PASS',
    'PATCH /outing/:id/status as Guard -> ' + r.status + ' storedStatus=' + after.status + ' approvedBy=' + (after.approvedBy ? 'guard' : 'none'));
}

// ---------- B2. Guard reading the pending queue campus-wide ----------
{
  const r = await api('/api/outing/pending', { token: T.guard });
  record('B2', 'Guard can read the campus-wide pending approval queue',
    r.status === 200 ? 'FAIL' : 'PASS', 'GET /outing/pending as Guard -> ' + r.status + ' rows=' + (Array.isArray(r.body) ? r.body.length : 'n/a'));
}

// ---------- B3. Cross-hostel caretaker decision ----------
{
  const s = females[1];
  const r0 = await makeFemaleMarketPending(s);
  const r = await api('/api/outing/' + r0._id + '/status', { method: 'PATCH', token: T.ctM, body: { status: 'Approved' } });
  const after = await OutingRequest.findById(r0._id);
  record('B3', 'Caretaker of another hostel cannot decide this request',
    r.status === 403 && after.status === 'Pending' ? 'PASS' : 'FAIL', 'status=' + r.status + ' stored=' + after.status);
}

// ---------- B4. Warden deciding a request never forwarded to them ----------
{
  const s = females[2];
  const r0 = await makeFemaleMarketPending(s);
  const r = await api('/api/outing/' + r0._id + '/warden-status', { method: 'PATCH', token: T.wdF, body: { status: 'Approved' } });
  const after = await OutingRequest.findById(r0._id);
  record('B4', 'Warden cannot decide a request not forwarded to them',
    r.status !== 200 && after.status === 'Pending' ? 'PASS' : 'FAIL', 'status=' + r.status + ' stored=' + after.status);
}

// ---------- B5. Student reading another student's signatures (IDOR) ----------
{
  const victim = females[3];
  const r0 = await makeFemaleMarketPending(victim);
  const attacker = tok(males[10]);
  const r = await api('/api/outing/' + r0._id + '/signatures', { token: attacker });
  record('B5', 'Student cannot read another student signature bytes (IDOR)',
    r.status === 403 ? 'PASS' : 'FAIL', 'status=' + r.status + ' body=' + JSON.stringify(r.body).slice(0, 80));
}

// ---------- B6. Student hitting staff endpoints ----------
{
  const t = tok(males[11]);
  const paths = [['/api/outing/pending','GET'], ['/api/outing/all','GET'], ['/api/scan','GET'],
    ['/api/sos','GET'], ['/api/admin/users','GET'], ['/api/outing/overdue','GET'], ['/api/events','GET']];
  const bad = [];
  for (const [p, m] of paths) {
    const r = await api(p, { method: m, token: t });
    if (r.status !== 403 && r.status !== 401) bad.push(p + '=' + r.status);
  }
  record('B6', 'Student is refused on every staff endpoint', bad.length === 0 ? 'PASS' : 'FAIL', bad.join(' ') || 'all 401/403');
}

// ---------- B7. Student POSTing a gate scan ----------
{
  const t = tok(males[12]);
  const r = await api('/api/scan', { method: 'POST', token: t, body: { student: males[12]._id.toString(), direction: 'OUT' } });
  record('B7', 'Student cannot self-log a gate scan', r.status === 403 ? 'PASS' : 'FAIL', 'status=' + r.status);
}

// ---------- B8. Valid JWT for a DELETED user ----------
{
  const ghost = await User.create({ name: 'Ghost', role: 'Student', gender: 'Male', hostelName: 'Kautilya', studentId: '299999', loginId: 'ghost' });
  const gt = tok(ghost);
  await User.findByIdAndDelete(ghost._id);
  const prof = await api('/api/auth/profile', { token: gt });
  const outing = await api('/api/outing/myrequests', { token: gt });
  const patch = await api('/api/auth/profile', { method: 'PATCH', token: gt, body: { signature: SIG } });
  record('B8', 'Valid JWT for a deleted user is rejected cleanly (not a 500)',
    [401, 404].includes(prof.status) && [401, 403].includes(outing.status) && [401, 404].includes(patch.status) ? 'PASS' : 'FAIL',
    'GET /auth/profile=' + prof.status + ' /outing/myrequests=' + outing.status + ' PATCH /auth/profile=' + patch.status);
}

// ---------- B9. Forged / tampered tokens ----------
{
  const cases = {
    'no token': undefined,
    'garbage': 'not.a.jwt',
    'alg-none': Buffer.from(JSON.stringify({alg:'none',typ:'JWT'})).toString('base64url') + '.' + Buffer.from(JSON.stringify({id: males[0]._id})).toString('base64url') + '.',
    'wrong secret': (await import('jsonwebtoken')).default.sign({ id: males[0]._id.toString() }, 'wrong-secret'),
  };
  const bad = [];
  for (const [label, t] of Object.entries(cases)) {
    const r = await api('/api/outing/myrequests', { token: t });
    if (r.status !== 401) bad.push(label + '=' + r.status);
  }
  record('B9', 'Forged/alg-none/wrong-secret tokens all rejected 401', bad.length === 0 ? 'PASS' : 'FAIL', bad.join(' ') || 'all 401');
}

// ---------- B10. SOS cross-gender scope ----------
{
  const s = females[4];
  const a = await SOSAlert.create({ student: s._id, type: 'medical' });
  const r = await api('/api/sos/' + a._id + '/status', { method: 'PATCH', token: T.ctM, body: { status: 'Resolved' } });
  record('B10', 'Male-scope caretaker cannot resolve a female student SOS',
    r.status === 403 ? 'PASS' : 'FAIL', 'status=' + r.status);
}

// ---------- B11. SOS PII exposure to a Guard ----------
{
  const s = females[5];
  await User.findByIdAndUpdate(s._id, { closeContacts: [{ name: 'Mom', mobileNumber: '9876543210', roomNumber: 'X' }] });
  await SOSAlert.create({ student: s._id, type: 'unsafe' });
  const g = await api('/api/sos?status=Active', { token: T.guard });
  const c = await api('/api/sos?status=Active', { token: T.ctF });
  const guardLeak = JSON.stringify(g.body).includes('guardianPhoneNumber') || JSON.stringify(g.body).includes('9876543210');
  const staffHas = JSON.stringify(c.body).includes('guardianPhoneNumber');
  record('B11', 'Guard SOS list withholds guardian/close-contact PII; staff keeps it',
    !guardLeak && staffHas ? 'PASS' : 'FAIL', 'guardLeak=' + guardLeak + ' staffHasContacts=' + staffHas);
}

// ---------- B12. Student cannot escalate role or campusStatus via profile ----------
{
  const s = males[13], t = tok(s);
  const r = await api('/api/auth/profile', { method: 'PATCH', token: t, body: { role: 'Admin', campusStatus: 'Inside', managedHostel: 'Kautilya', signature: SIG } });
  const after = await User.findById(s._id);
  record('B12', 'Mass-assignment: role/managedHostel are not writable from profile PATCH',
    after.role === 'Student' && !after.managedHostel ? 'PASS' : 'FAIL', 'status=' + r.status + ' role=' + after.role + ' managedHostel=' + after.managedHostel);
}

// ---------- B13. Registration cannot mint staff ----------
{
  const r = await api('/api/auth/register', { method: 'POST', body: {
    name: 'X', email: 'evil@nitp.ac.in', password: 'secret123', role: 'Admin',
    studentId: '888888', hostelName: 'Kautilya' } });
  record('B13', 'Self-registration cannot mint an Admin', r.status === 403 ? 'PASS' : 'FAIL', 'status=' + r.status + ' msg=' + String(r.body?.message).slice(0, 70));
}

// ---------- B14. Cancel someone else's outing ----------
{
  const victim = females[6];
  const r0 = await makeFemaleMarketPending(victim);
  const r = await api('/api/outing/' + r0._id + '/cancel', { method: 'PATCH', token: tok(males[14]) });
  const after = await OutingRequest.findById(r0._id);
  record('B14', 'Student cannot cancel another student outing',
    after.status === 'Pending' ? 'PASS' : 'FAIL', 'status=' + r.status + ' stored=' + after.status);
}

// ---------- B15. Malformed / hostile input ----------
{
  const t = tok(males[15]);
  const cases = [
    ['bad json', '/api/outing', 'POST', '{"broken":'],
    ['nosql operator in id', '/api/outing/' + encodeURIComponent('{"$ne":null}') + '/signatures', 'GET', undefined],
  ];
  const bad = [];
  const r1 = await fetch('http://127.0.0.1:' + server.address().port + '/api/outing', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t }, body: '{"broken":' });
  if (r1.status !== 400) bad.push('badjson=' + r1.status);
  const ct = (r1.headers.get('content-type') || '');
  if (!ct.includes('json')) bad.push('badjson-not-json');
  const r2 = await api('/api/outing/%7B%22%24ne%22%3Anull%7D/signatures', { token: t });
  if (r2.status !== 400 && r2.status !== 404) bad.push('nosqlid=' + r2.status);
  // NoSQL operator injection through the scan body
  const r3 = await api('/api/scan', { method: 'POST', token: T.guard, body: { studentId: { $ne: null }, direction: 'OUT' } });
  if (r3.status >= 500) bad.push('scan-nosql=' + r3.status);
  // Login with an operator object as the identifier
  const r4 = await api('/api/auth/login', { method: 'POST', body: { loginId: { $ne: null }, password: { $ne: null } } });
  if (r4.status === 200) bad.push('LOGIN-BYPASS');
  record('B15', 'Malformed JSON / NoSQL-operator injection handled as 4xx JSON',
    bad.length === 0 ? 'PASS' : 'FAIL', bad.join(' ') || 'badjson=400 nosqlid ok scan ok login=' + r4.status);
}

// ---------- B16. Unknown route returns JSON not HTML ----------
{
  const r = await api('/api/nope/nothing');
  record('B16', '404 on an unknown API path is JSON, not an HTML error page',
    r.status === 404 && r.body && r.body.message ? 'PASS' : 'FAIL', 'status=' + r.status + ' body=' + JSON.stringify(r.body).slice(0, 60));
}

// ---------- B17. diag route gated ----------
{
  const r = await api('/api/_diag/ip', { token: T.admin });
  record('B17', '/api/_diag is 404 unless DIAG_TOOLS=1', r.status === 404 ? 'PASS' : 'FAIL', 'status=' + r.status);
}

// ---------- B18. SOS with a missing / unexpected type ----------
{
  const t = tok(males[16]);
  const noType = await api('/api/sos', { method: 'POST', token: t, body: { note: 'help me' } });
  const badType = await api('/api/sos', { method: 'POST', token: tok(males[17]), body: { type: 'Medical', note: 'help' } });
  const goodType = await api('/api/sos', { method: 'POST', token: tok(males[18]), body: { type: 'medical', note: 'help' } });
  record('B18', 'SOS with a missing or wrong-case type is rejected as 4xx (not a 500)',
    noType.status < 500 && badType.status < 500 && goodType.status === 201 ? 'PASS' : 'FAIL',
    'noType=' + noType.status + ' wrongCase=' + badType.status + ' valid=' + goodType.status +
    ' | noTypeMsg=' + String(noType.body?.message).slice(0, 70));
}

// ---------- B19. SOS survives hostile optional fields ----------
{
  const t = tok(males[19]);
  const r = await api('/api/sos', { method: 'POST', token: t, body: {
    type: 'unsafe', note: 'x'.repeat(50000), location: 'y'.repeat(10000),
    coords: { lat: 'NaN', lng: 999, accuracy: 'abc' } } });
  record('B19', 'SOS still fires with junk coords and an oversized note',
    r.status === 201 ? 'PASS' : 'FAIL', 'status=' + r.status + ' coordsStored=' + JSON.stringify(r.body?.coords));
}

// ---------- B20. SOS rate limit vs a real emergency ----------
{
  const t = tok(males[20]);
  const res = [];
  for (let i = 0; i < 9; i++) res.push((await api('/api/sos', { method: 'POST', token: t, body: { type: 'unsafe' } })).status);
  record('B20', 'SOS limiter caps a single student at 5/min',
    res.filter(s => s === 201).length === 5 && res.filter(s => s === 429).length === 4 ? 'PASS' : 'WARN',
    'statuses=' + res.join(','));
}

console.log('\n--- s2 summary ---');
for (const r of results) console.log(r.status.padEnd(4), r.id, '-', r.title, '::', r.detail);
await mongoose.disconnect(); server.close(); await mongod.stop(); process.exit(0);
