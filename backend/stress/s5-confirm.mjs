import { api, tok, record, results, mongoose, server, mongod, istAt, nowIstMinutes,
  User, OutingRequest, LeaveApplication, males, females, T, SIG } from './harness.mjs';

if (!/127\.0\.0\.1|localhost/.test(mongoose.connection.host || '')) { console.error('ABORT'); process.exit(1); }
const NOW = nowIstMinutes();
const hh = Math.floor(NOW / 60) + ':' + String(NOW % 60).padStart(2, '0');

// ---------- E1. Is the pass's own outTime enforced at the gate? ----------
// Design intent (scanController isOutingExitOpen): "Outing outTime is a deadline only".
// So a pass whose outTime has passed should NOT open the gate.
{
  const s = males[40];
  await OutingRequest.create({ student: s._id, destination: 'M', purpose: 'p', outingType: 'General',
    outTime: istAt(7, 0), inTime: istAt(20, 0), status: 'Approved', studentSignature: SIG });
  const prev = await api('/api/scan/preview?studentId=' + s.studentId, { token: T.guard });
  const r = await api('/api/scan', { method: 'POST', token: T.guard, body: { student: s._id.toString(), direction: 'OUT' } });
  const after = await User.findById(s._id).select('campusStatus');
  record('E1', 'Outing pass stamped for 07:00 still opens the gate at ' + hh + ' (outTime deadline NOT enforced)',
    r.status === 201 ? 'FAIL' : 'PASS',
    'previewAllowed=' + prev.body?.exit?.allowed + ' scan=' + r.status + ' campusNow=' + after.campusStatus +
    ' | the only gate check is the generic 06:00-19:59 gender window');
}

// ---------- E2. How wide is that? approve at 07:00, walk out at 19:58 ----------
{
  const s = males[41];
  await OutingRequest.create({ student: s._id, destination: 'M', purpose: 'p', outingType: 'General',
    outTime: istAt(6, 0), inTime: istAt(20, 0), status: 'Approved', studentSignature: SIG });
  const r = await api('/api/scan', { method: 'POST', token: T.guard, body: { student: s._id.toString(), direction: 'OUT' } });
  record('E2', 'A 06:00 pass is usable for the whole 14-hour male window',
    r.status === 201 ? 'FAIL' : 'PASS', 'scan=' + r.status);
}

// ---------- E3. Female Market pass outside its 14:30 cutoff ----------
{
  const s = females[30];
  await OutingRequest.create({ student: s._id, destination: 'M', purpose: 'p', outingType: 'Market',
    outTime: istAt(11, 0), inTime: istAt(17, 30), status: 'Approved', studentSignature: SIG });
  const r = await api('/api/scan', { method: 'POST', token: T.guard, body: { student: s._id.toString(), direction: 'OUT' } });
  const doc = await OutingRequest.findOne({ student: s._id }).sort({ createdAt: -1 });
  const past = NOW > 14 * 60 + 30;
  record('E3', 'Female Market pass IS correctly fenced by its 06:00-14:30 window at ' + hh,
    past ? (r.status === 403 && doc.status === 'Expired' ? 'PASS' : 'FAIL') : (r.status === 201 ? 'PASS' : 'FAIL'),
    'pastMarketWindow=' + past + ' scan=' + r.status + ' stored=' + doc.status);
}

// ---------- E4. Guard escalation chain, end to end ----------
{
  // A guard with no signature sets one on themselves, then approves a stranger's request.
  const guardUser = await User.findOne({ role: 'Guard' });
  await User.findByIdAndUpdate(guardUser._id, { $unset: { signature: 1 } });
  const gt = T.guard;
  const s = females[31];
  const req = await OutingRequest.create({ student: s._id, destination: 'M', purpose: 'p',
    outingType: 'Market', outTime: istAt(11, 0, 1), inTime: istAt(17, 30, 1), status: 'Pending',
    studentSignature: SIG });
  const blocked = await api('/api/outing/' + req._id + '/status', { method: 'PATCH', token: gt, body: { status: 'Approved' } });
  const setSig = await api('/api/auth/profile', { method: 'PATCH', token: gt, body: { signature: SIG } });
  const approved = await api('/api/outing/' + req._id + '/status', { method: 'PATCH', token: gt, body: { status: 'Approved' } });
  const doc = await OutingRequest.findById(req._id).populate('approvedBy', 'role name');
  record('E4', 'Guard self-serves a signature then approves a stranger request end-to-end',
    approved.status === 200 ? 'FAIL' : 'PASS',
    'withoutSig=' + blocked.status + ' setOwnSignature=' + setSig.status + ' thenApprove=' + approved.status +
    ' stored=' + doc.status + ' approvedByRole=' + doc.approvedBy?.role);
}

// ---------- E5. Guard can also REJECT any student's request ----------
{
  const s = females[32];
  const req = await OutingRequest.create({ student: s._id, destination: 'M', purpose: 'p',
    outingType: 'Market', outTime: istAt(11, 0, 1), inTime: istAt(17, 30, 1), status: 'Pending', studentSignature: SIG });
  const r = await api('/api/outing/' + req._id + '/status', { method: 'PATCH', token: T.guard, body: { status: 'Rejected', remarks: 'no' } });
  const doc = await OutingRequest.findById(req._id);
  record('E5', 'Guard can reject any student outing request campus-wide',
    r.status === 200 ? 'FAIL' : 'PASS', 'reject=' + r.status + ' stored=' + doc.status);
}

// ---------- E6. error.message leakage on a 500 ----------
{
  const t = tok(males[42]);
  const r = await api('/api/outing/%7B%22%24ne%22%3Anull%7D/signatures', { token: t });
  const leaks = typeof r.body?.message === 'string' && /Cast to ObjectId|ObjectId|Mongo|model/i.test(r.body.message);
  record('E6', 'Internal Mongoose error text is returned to the client on a 500',
    leaks ? 'FAIL' : 'PASS', 'status=' + r.status + ' body=' + JSON.stringify(r.body).slice(0, 140));
}

// ---------- E7. JWT lifetime / revocation ----------
{
  const jwt = (await import('jsonwebtoken')).default;
  const t = jwt.sign({ id: males[43]._id.toString() }, process.env.JWT_SECRET, { expiresIn: '30d' });
  const d = jwt.decode(t);
  const days = ((d.exp - d.iat) / 86400).toFixed(0);
  const r = await api('/api/outing/myrequests', { token: t });
  // logout only clears the cookie; a captured Bearer token stays valid
  const lo = await api('/api/auth/logout', { method: 'POST', token: t });
  const after = await api('/api/outing/myrequests', { token: t });
  record('E7', 'A Bearer token stays valid for ' + days + ' days and logout does not revoke it',
    after.status === 200 ? 'FAIL' : 'PASS',
    'lifetimeDays=' + days + ' beforeLogout=' + r.status + ' logout=' + lo.status + ' afterLogout=' + after.status);
}

console.log('\n--- s5 summary (nowIST=' + hh + ') ---');
for (const r of results) console.log(r.status.padEnd(4), r.id, '-', r.title, '::', r.detail);
await mongoose.disconnect(); server.close(); await mongod.stop(); process.exit(0);
