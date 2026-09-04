import { api, tok, record, results, mongoose, server, mongod, istAt, nowIstMinutes,
  User, OutingRequest, LeaveApplication, ScanLog, males, females, T,
  ctF, ctM, wdF, SIG } from './harness.mjs';

if (!/127\.0\.0\.1|localhost/.test(mongoose.connection.host || '')) { console.error('ABORT: not local'); process.exit(1); }

const NOW = nowIstMinutes();
const dep = () => istAt(Math.min(19, Math.floor(NOW / 60) + 2), 0);
const okWindow = NOW >= 6 * 60 && NOW <= 19 * 60 + 59;

// ---------- D1. Female Market: full caretaker-gated chain ----------
{
  const s = females[20], t = tok(s);
  // Market departure window is 6:00-14:30, so submit for tomorrow inside the window.
  const c = await api('/api/outing', { method: 'POST', token: t, body: {
    destination: 'City Market', purpose: 'shopping', outTime: istAt(11, 0, 1), outingType: 'Market' } });
  const id = c.body?._id;
  const pend = await api('/api/outing/pending', { token: T.ctF });
  const inQueue = Array.isArray(pend.body) && pend.body.some(r => String(r._id) === String(id));
  const appr = await api('/api/outing/' + id + '/status', { method: 'PATCH', token: T.ctF, body: { status: 'Approved' } });
  const doc = await OutingRequest.findById(id);
  const sigs = await api('/api/outing/' + id + '/signatures', { token: t });
  record('D1', 'Female Market outing: submit -> caretaker queue -> approve -> signed',
    c.status === 201 && doc.autoApproved === false && inQueue && appr.status === 200 &&
    doc.status === 'Approved' && !!doc.caretakerSignature && !!doc.studentSignature ? 'PASS' : 'FAIL',
    'create=' + c.status + ' inCaretakerQueue=' + inQueue + ' approve=' + appr.status +
    ' stored=' + doc.status + ' decidedByRole=' + doc.decidedByRole +
    ' sigsFetch=' + sigs.status + ' hasCaretakerSig=' + !!doc.caretakerSignature);
}

// ---------- D2. Auto-approval: female Nearby and male General ----------
{
  const f = females[21], m = males[30];
  const a = await api('/api/outing', { method: 'POST', token: tok(f), body: {
    destination: 'Chai stall', purpose: 'snack', outTime: istAt(17, 0), outingType: 'Nearby' } });
  const b = await api('/api/outing', { method: 'POST', token: tok(m), body: {
    destination: 'Market', purpose: 'x', outTime: dep(), outingType: 'General' } });
  record('D2', 'Female Nearby and Male General are auto-approved with no caretaker step',
    a.body?.status === 'Approved' && a.body?.autoApproved === true &&
    b.body?.status === 'Approved' && b.body?.autoApproved === true ? 'PASS' : 'FAIL',
    'femaleNearby=' + a.status + '/' + a.body?.status + '/auto=' + a.body?.autoApproved +
    ' maleGeneral=' + b.status + '/' + b.body?.status + '/auto=' + b.body?.autoApproved +
    ' femaleReturnDeadline=' + new Date(a.body?.inTime).toISOString());
}

// ---------- D3. Forward to warden -> warden decides ----------
{
  const s = females[22], t = tok(s);
  const c = await api('/api/outing', { method: 'POST', token: t, body: {
    destination: 'Market', purpose: 'p', outTime: istAt(11, 0, 1), outingType: 'Market' } });
  const id = c.body._id;
  const fwd = await api('/api/outing/' + id + '/forward', { method: 'PATCH', token: T.ctF, body: { note: 'needs warden ok' } });
  const q = await api('/api/outing/forwarded', { token: T.wdF });
  const inWardenQueue = Array.isArray(q.body) && q.body.some(r => String(r._id) === String(id));
  // while Forwarded, a second request must be blocked
  const second = await api('/api/outing', { method: 'POST', token: t, body: {
    destination: 'Other', purpose: 'p', outTime: istAt(11, 0, 1), outingType: 'Market' } });
  const dec = await api('/api/outing/' + id + '/warden-status', { method: 'PATCH', token: T.wdF, body: { status: 'Approved' } });
  const doc = await OutingRequest.findById(id);
  record('D3', 'Caretaker forwards -> warden queue -> warden approves (and Forwarded blocks a 2nd request)',
    fwd.status === 200 && inWardenQueue && second.status === 409 && dec.status === 200 &&
    doc.status === 'Approved' && !!doc.wardenSignature && doc.decidedByRole === 'Warden' ? 'PASS' : 'FAIL',
    'forward=' + fwd.status + ' inWardenQueue=' + inWardenQueue + ' secondReq=' + second.status +
    ' wardenDecide=' + dec.status + ' stored=' + doc.status + ' hasWardenSig=' + !!doc.wardenSignature +
    ' decidedByRole=' + doc.decidedByRole);
}

// ---------- D4. Leave: full chain incl. gate ----------
{
  const s = males[31], t = tok(s);
  const c = await api('/api/leave', { method: 'POST', token: t, body: {
    destination: 'Home', reason: 'family function', leaveDate: istAt(10, 0, 1),
    returnDate: istAt(10, 0, 4), acknowledgement: true } });
  const id = c.body?._id;
  const q = await api('/api/leave/pending', { token: T.ctM });
  const inQueue = Array.isArray(q.body) && q.body.some(r => String(r._id) === String(id));
  const appr = await api('/api/leave/' + id + '/status', { method: 'PATCH', token: T.ctM, body: { status: 'Approved' } });
  const doc = await LeaveApplication.findById(id);
  // Departure is tomorrow -> the gate must refuse it today
  const early = await api('/api/scan', { method: 'POST', token: T.guard, body: { student: s._id.toString(), direction: 'OUT' } });
  record('D4', 'Leave: submit -> caretaker approve -> gate refuses exit before the leave date',
    c.status === 201 && inQueue && appr.status === 200 && doc.status === 'Approved' &&
    early.status === 403 ? 'PASS' : 'FAIL',
    'create=' + c.status + ' inQueue=' + inQueue + ' approve=' + appr.status + ' stored=' + doc.status +
    ' gateBeforeDate=' + early.status + ' msg=' + String(early.body?.message).slice(0, 60));
}

// ---------- D5. Leave curfew: 5:30 PM on the departure day ----------
{
  const s = males[32];
  const lv = await LeaveApplication.create({ student: s._id, destination: 'Home', reason: 'r',
    leaveDate: istAt(9, 0), returnDate: istAt(9, 0, 3), status: 'Approved', studentSignature: SIG });
  const r = await api('/api/scan', { method: 'POST', token: T.guard, body: { student: s._id.toString(), direction: 'OUT' } });
  const after = await LeaveApplication.findById(lv._id);
  const pastCurfew = NOW > 17 * 60 + 30;
  record('D5', 'Leave pass past the 5:30 PM curfew is refused AND persisted as Expired',
    pastCurfew ? (r.status === 403 && after.status === 'Expired' ? 'PASS' : 'FAIL')
               : (r.status === 201 ? 'PASS' : 'FAIL'),
    'nowIST=' + Math.floor(NOW / 60) + ':' + String(NOW % 60).padStart(2, '0') +
    ' pastCurfew=' + pastCurfew + ' gate=' + r.status + ' stored=' + after.status);
}

// ---------- D6. Female leave must be filed before departure DAY ----------
{
  const s = females[23], t = tok(s);
  const sameDay = await api('/api/leave', { method: 'POST', token: t, body: {
    destination: 'Home', reason: 'r', leaveDate: istAt(23, 0), returnDate: istAt(9, 0, 3), acknowledgement: true } });
  const nextDay = await api('/api/leave', { method: 'POST', token: t, body: {
    destination: 'Home', reason: 'r', leaveDate: istAt(10, 0, 1), returnDate: istAt(10, 0, 3), acknowledgement: true } });
  record('D6', 'Female same-day leave is refused; next-day is accepted',
    sameDay.status === 400 && nextDay.status === 201 ? 'PASS' : 'FAIL',
    'sameDay=' + sameDay.status + ' nextDay=' + nextDay.status);
}

// ---------- D7. Cancel frees the student to request again ----------
{
  const s = males[33], t = tok(s);
  const c = await api('/api/outing', { method: 'POST', token: t, body: {
    destination: 'M', purpose: 'p', outTime: dep(), outingType: 'General' } });
  const blocked = await api('/api/outing', { method: 'POST', token: t, body: {
    destination: 'M2', purpose: 'p', outTime: dep(), outingType: 'General' } });
  const can = await api('/api/outing/' + c.body._id + '/cancel', { method: 'PATCH', token: t });
  const again = await api('/api/outing', { method: 'POST', token: t, body: {
    destination: 'M3', purpose: 'p', outTime: dep(), outingType: 'General' } });
  record('D7', 'Cancel releases the one-active-pass lock',
    c.status === 201 && blocked.status === 409 && can.status === 200 && again.status === 201 ? 'PASS' : 'FAIL',
    'create=' + c.status + ' blocked=' + blocked.status + ' cancel=' + can.status + ' recreate=' + again.status);
}

// ---------- D8. Signature gate (428) ----------
{
  const s = males[34];
  await User.findByIdAndUpdate(s._id, { $unset: { signature: 1 } });
  const t = tok(s);
  const r = await api('/api/outing', { method: 'POST', token: t, body: {
    destination: 'M', purpose: 'p', outTime: dep(), outingType: 'General' } });
  const created = await OutingRequest.countDocuments({ student: s._id });
  const l = await api('/api/leave', { method: 'POST', token: t, body: {
    destination: 'H', reason: 'r', leaveDate: istAt(10, 0, 1), returnDate: istAt(10, 0, 3), acknowledgement: true } });
  record('D8', 'No profile signature -> 428 SIGNATURE_REQUIRED and nothing is written',
    r.status === 428 && r.body?.code === 'SIGNATURE_REQUIRED' && created === 0 && l.status === 428 ? 'PASS' : 'FAIL',
    'outing=' + r.status + '/' + r.body?.code + ' leave=' + l.status + ' rowsWritten=' + created);
}

// ---------- D9. Caretaker without a signature cannot approve ----------
{
  const s = females[24], t = tok(s);
  const c = await api('/api/outing', { method: 'POST', token: t, body: {
    destination: 'M', purpose: 'p', outTime: istAt(11, 0, 1), outingType: 'Market' } });
  await User.findByIdAndUpdate(ctF._id, { $unset: { signature: 1 } });
  const appr = await api('/api/outing/' + c.body._id + '/status', { method: 'PATCH', token: T.ctF, body: { status: 'Approved' } });
  const rej = await api('/api/outing/' + c.body._id + '/status', { method: 'PATCH', token: T.ctF, body: { status: 'Rejected' } });
  await User.findByIdAndUpdate(ctF._id, { signature: SIG });
  record('D9', 'Caretaker with no signature is blocked from approving but may still reject',
    appr.status === 428 && rej.status === 200 ? 'PASS' : 'FAIL', 'approve=' + appr.status + ' reject=' + rej.status);
}

// ---------- D10. Approving after the departure window closed ----------
{
  const s = females[25];
  const r0 = await OutingRequest.create({ student: s._id, destination: 'M', purpose: 'p',
    outingType: 'Market', outTime: istAt(6, 30), inTime: istAt(17, 30), status: 'Pending',
    studentSignature: SIG, targetCaretaker: ctF._id });
  const appr = await api('/api/outing/' + r0._id + '/status', { method: 'PATCH', token: T.ctF, body: { status: 'Approved' } });
  const after = await OutingRequest.findById(r0._id);
  record('D10', 'Caretaker cannot approve a request whose departure time already passed',
    appr.status === 409 && after.status === 'Expired' ? 'PASS' : 'FAIL',
    'approve=' + appr.status + ' stored=' + after.status);
}

// ---------- D11. Overdue is derived, stored status stays Out ----------
if (okWindow) {
  const s = males[35], t = tok(s);
  await api('/api/outing', { method: 'POST', token: t, body: {
    destination: 'M', purpose: 'p', outTime: dep(), outingType: 'General' } });
  await api('/api/scan', { method: 'POST', token: T.guard, body: { student: s._id.toString(), direction: 'OUT' } });
  await OutingRequest.updateMany({ student: s._id, status: 'Out' }, { $set: { inTime: new Date(Date.now() - 7200e3) } });
  const mine = await api('/api/outing/myrequests', { token: t });
  const row = Array.isArray(mine.body) ? mine.body.find(r => r.status === 'Out') : null;
  const staffOverdue = await api('/api/outing/overdue', { token: T.ctM });
  const seen = Array.isArray(staffOverdue.body) && staffOverdue.body.some(o => String(o.student?._id) === String(s._id));
  const back = await api('/api/scan', { method: 'POST', token: T.guard, body: { student: s._id.toString(), direction: 'IN' } });
  const doc = await OutingRequest.findOne({ student: s._id }).sort({ createdAt: -1 });
  record('D11', 'Overdue is a derived flag; stored status stays Out; return stamps Overdue punctuality',
    row?.isOverdue === true && row?.status === 'Out' && seen && back.status === 201 &&
    doc.returnPunctuality === 'Overdue' && doc.status === 'Returned' ? 'PASS' : 'FAIL',
    'isOverdue=' + row?.isOverdue + ' storedStatus=' + row?.status + ' inStaffOverdueList=' + seen +
    ' return=' + back.status + ' punctuality=' + doc.returnPunctuality);
}

// ---------- D12. preview agrees with the real scan verdict ----------
{
  const s = males[36], t = tok(s);
  await api('/api/outing', { method: 'POST', token: t, body: {
    destination: 'M', purpose: 'p', outTime: dep(), outingType: 'General' } });
  const p1 = await api('/api/scan/preview?studentId=' + s.studentId, { token: T.guard });
  const scan = await api('/api/scan', { method: 'POST', token: T.guard, body: { studentId: s.studentId, direction: 'AUTO' } });
  const p2 = await api('/api/scan/preview?studentId=' + s.studentId, { token: T.guard });
  record('D12', 'preview.exit.allowed matches what POST /api/scan actually does',
    p1.body?.exit?.allowed === true && scan.status === 201 && p2.body?.student?.campusStatus === 'Outside' ? 'PASS' : 'FAIL',
    'previewBefore=' + JSON.stringify(p1.body?.exit) + ' scan=' + scan.status + ' previewAfterCampus=' + p2.body?.student?.campusStatus);
}

// ---------- D13. a stale/never-scanned pass blocks the student forever? ----------
{
  const s = males[37], t = tok(s);
  // approved pass whose departure passed and which was never used
  await OutingRequest.create({ student: s._id, destination: 'M', purpose: 'p', outingType: 'General',
    outTime: istAt(6, 0), inTime: istAt(20, 0), status: 'Approved', studentSignature: SIG });
  const again = await api('/api/outing', { method: 'POST', token: t, body: {
    destination: 'M2', purpose: 'p', outTime: dep(), outingType: 'General' } });
  record('D13', 'A stale unused Approved pass auto-expires and does not lock the student out',
    again.status === 201 ? 'PASS' : 'FAIL', 'newRequest=' + again.status + ' msg=' + String(again.body?.message).slice(0, 70));
}

// ---------- D14. student stuck Outside cannot request, and recovery path ----------
{
  const s = males[38], t = tok(s);
  await User.findByIdAndUpdate(s._id, { campusStatus: 'Outside' });
  const r = await api('/api/outing', { method: 'POST', token: t, body: {
    destination: 'M', purpose: 'p', outTime: dep(), outingType: 'General' } });
  await api('/api/scan', { method: 'POST', token: T.guard, body: { student: s._id.toString(), direction: 'IN' } });
  const r2 = await api('/api/outing', { method: 'POST', token: t, body: {
    destination: 'M', purpose: 'p', outTime: dep(), outingType: 'General' } });
  record('D14', 'Student marked Outside is blocked from requesting until scanned back in',
    r.status === 409 && r2.status === 201 ? 'PASS' : 'FAIL', 'whileOutside=' + r.status + ' afterEntryScan=' + r2.status);
}

console.log('\n--- s4 summary ---');
for (const r of results) console.log(r.status.padEnd(4), r.id, '-', r.title, '::', r.detail);
await mongoose.disconnect(); server.close(); await mongod.stop(); process.exit(0);
