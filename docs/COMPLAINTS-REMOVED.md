# Complaints Feature — Removed, Not Deleted

The complaints feature and the `Department` staff role were removed from `main` in
commit **`ed76867`** (Aug 2026). This document is how you bring them back.

## Why it was removed

The authorities reviewing the project asked to launch with a smaller surface:
outings, leave, SOS and delay notices. Their reasoning was operational, not
technical — a complaints inbox with no triage policy behind it generates noise
(their example: a 5–10 minute WiFi outage producing a complaint from every
student). They intend to add complaints later, once the rest is running.

Nothing about the feature was considered broken. It was working when removed.

## How to bring it back

The removal is one self-contained commit, so git can reconstruct the feature:

```bash
git revert ed76867
```

That replays the inverse of the removal. Expect conflicts only in the shared
files listed below, and only where they have changed since. Resolve those, then
run `next build` and the backend load check.

To read individual files without reverting, the pre-removal state is tagged:

```bash
git show complaints-v1:backend/src/models/Complaint.js
git checkout complaints-v1 -- safeexit/src/app/dashboard/student/complaint/
```

`complaints-v1` is an annotated tag on commit `d3a5cd7` and is pushed to origin.
It does not move. Do not delete it.

## ⚠️ The one trap: two different "department"s

This bit costs the most time if you forget it. The codebase uses that word for
two unrelated things:

| Thing | What it is | Status |
|---|---|---|
| `role: 'Department'` + `User.managedDepartment` (enum: Electrical, Plumbing, Cleaning, Wifi, Furniture) | Complaint-routing staff accounts | **Removed** — comes back with the revert |
| `User.department` (String, e.g. "CSE") | A student's *academic* department | **Never removed — must stay** |

`User.department` is read by outings, leave, scans, SOS, delay notices, movement
logs, the QR ID-card parser, and admin analytics — around 22 files. If a future
cleanup greps for "department" and deletes indiscriminately, it takes down
exactly the features this removal was meant to protect.

## What was deleted outright

These files came back wholesale; nothing else referenced them.

```
backend/src/models/Complaint.js
backend/src/controllers/complaintController.js
backend/src/routes/complaintRoutes.js
safeexit/src/app/dashboard/student/complaint/page.jsx
safeexit/src/app/dashboard/caretaker/components/ComplaintsView.jsx
safeexit/src/app/dashboard/chief-warden/components/ComplaintsView.jsx
safeexit/src/app/dashboard/department/page.js
safeexit/src/app/login/department/page.js
```

## Shared files that were pruned — where conflicts will land

These files kept their other responsibilities and only had complaint code
removed. They are the ones that will conflict on a revert, because they are also
the files most likely to keep changing.

**Backend**

| File | What was removed |
|---|---|
| `src/app.js` | `complaintRoutes` require + `/api/complaint` mount |
| `src/models/User.js` | `'Department'` from role enum; `managedDepartment` field |
| `src/controllers/adminController.js` | `openComplaints` count; `DEPARTMENT_CATEGORIES`; `findDepartmentForCategory`; Department branches in `createStaff` / `resetStaffPin` / `updateStaffScope` / `removeStaff`; `managedDepartment` from the `getUsers` field list |
| `src/controllers/chiefWardenController.js` | `openComplaints` per-hostel and campus-wide |
| `src/controllers/adminAnalyticsController.js` | the whole `Complaint.aggregate` facet and the `complaints` response block |
| `src/controllers/authController.js` | `managedDepartment` from 3 auth responses |
| `src/utils/pushService.js` | `notifyDepartment` |
| `src/routes/eventRoutes.js` | `'Department'` from the SSE `authorizeRoles` list |
| `src/controllers/eventController.js` | comment only |

**Frontend**

| File | What was removed |
|---|---|
| `lib/auth.js` | `department` role config, slug mapping, label, `managedDepartment` passthrough |
| `login/page.js` | the Complaint Department role card, its `RoleVisual` branch, PIN key, login path, dashboard route, `Wrench` import; staff count 4 → 3 |
| `dashboard/student/page.js` | complaint tile + bottom-nav entry |
| `dashboard/caretaker/page.js` | `complaintTone`, `statusToneFor`, `mapReport`, reports state, `loadReports`, SSE + polling, attention row, recent-reports card, two nav buttons, the dead `activePanel === 'alerts'` block |
| `dashboard/warden/page.js` | same shape as caretaker, plus the Open Complaints stat tile |
| `dashboard/chief-warden/page.js` | Complaints tab, `openComplaints` stat + hostel-card line |
| `dashboard/admin/page.js` | Open Complaints stat tile |
| `admin/components/AnalyticsView.jsx` | `ComplaintCategoryChart`, the complaints series in `TrendChart`, metric card, category panel, insight card; grids 4 → 3 cols |
| `admin/components/PeopleView.jsx` | Departments tab, `DEPARTMENT_OPTIONS`, `takenDepartments`, account creation + scope modal branches |
| `lib/translations/en.js`, `hi.js` | caretaker complaint strings and the entire `department:` section |
| `globals.css` | `.sf-icon-complaint`, `.sd-action-icon--complaint`, `.sf-hero-strip--complaint`, `.wd-attn--complaints` |
| `components/student/FeatureHeroStrip.jsx`, `StudentFeatureShell.jsx` | `complaint` variant entries |
| `components/Simulator.js` | the landing-page misconduct-complaint demo (mock state, not the real API) |

## Deliberately left in place

- `backend/scripts/migrateWardenToCaretaker.js` still names the `complaints`
  collection. That script is retired and hard-stops before running; its mention
  is a historical record of a 2025 field rename against old databases. Editing
  it would make that record wrong.
- **No database changes were made.** Any existing `complaints` collection and
  `managedDepartment` values are untouched — code is recoverable from git,
  production data is not. Note that with `'Department'` gone from the role enum,
  any surviving Department *user* document will fail Mongoose validation on its
  next save; delete those accounts or re-add the enum value when reinstating.

## Verification used at removal time

```bash
# backend: every file parses, and app.js has no dangling requires
cd backend && for f in $(find src scripts -name '*.js'); do node --check "$f"; done
node -e "require('dotenv').config(); require('./src/app.js')"

# frontend: 27 routes, none of them complaint/department
cd safeexit && npx next build
```

Lint problem count was unchanged across the removal (34, all pre-existing
`react-hooks/set-state-in-effect`, `no-img-element` and `no-html-link-for-pages`).
