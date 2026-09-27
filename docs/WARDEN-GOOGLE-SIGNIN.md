# Turning on Google sign-in for wardens (production)

Wardens, assistant wardens and the Chief Warden sign in with their `@nitp.ac.in` Google
account instead of an ID + PIN. This is the one-time setup on the college server. There is
**no database schema change**; the only data change is step 7, and it has a preview mode.

Production is `https://erp.nitp.ac.in/safeexit`.

---

## 1. Create the Google OAuth client (Google Cloud Console)

Do this signed in with a **college (`@nitp.ac.in`) Google account** if you can. It matters
for step 1.2.

1. Open <https://console.cloud.google.com/>, create a project (e.g. `NITP SafeExit`).
2. **APIs & Services → OAuth consent screen** (called "Google Auth Platform → Branding /
   Audience" in newer consoles):
   - **User type: Internal** if the option is offered. It only appears when the project
     belongs to the nitp.ac.in Google Workspace organisation, and it limits sign-in to college
     accounts with no review.
   - Otherwise **External**. Then, under Audience, press **Publish app** so it is "In
     production". While it says "Testing", only the test users you list can sign in, and every
     other warden gets an error. The app asks only for name and email, so publishing needs no
     Google verification.
   - App name `NITP SafeExit`, support email: yours.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**.
   - **Authorized JavaScript origins:** `https://erp.nitp.ac.in`. This is the origin only: no
     `/safeexit` and no trailing slash. (Add `http://localhost:3000` too if you test locally.)
   - Authorized redirect URIs: leave empty.
4. Copy the **Client ID** (`…apps.googleusercontent.com`). It is not a secret. You do not
   need the client secret.

## 2. Get the new code onto the server

```bash
cd /path/to/SafeExit
git pull origin main
```

## 3. Add the client ID to `backend/.env`

```bash
nano backend/.env
```

Add one line:

```
GOOGLE_CLIENT_ID=1234567890-xxxxxxxx.apps.googleusercontent.com
```

Nothing else in `.env` changes. The frontend reads the client ID from the backend, so there
is no frontend variable to set.

## 4. Rebuild and restart

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml logs --tail=50 backend
```

The log should show the server listening with no errors.

## 5. Check the server can reach Google

The backend downloads Google's signing keys to verify each sign-in:

```bash
docker compose -f docker-compose.prod.yml exec backend \
  node -e "fetch('https://www.googleapis.com/oauth2/v3/certs').then(r=>console.log('Google reachable:', r.status)).catch(e=>console.log('BLOCKED:', e.message))"
```

It must print `Google reachable: 200`. If it prints `BLOCKED`, ask the network team to allow
outbound HTTPS from this server to `www.googleapis.com`. Until then every warden sign-in
fails with "could not be verified".

## 6. Check the client ID is being served

```bash
curl -s https://erp.nitp.ac.in/safeexit/api/auth/google/config
```

It must print `{"clientId":"…apps.googleusercontent.com"}`. `null` means step 3 did not take
effect: check the variable name and restart.

## 7. Create the warden accounts

`backend/wardens.json` holds the list. It is git-ignored, so `git pull` does not bring it;
copy it from your machine:

```bash
# on your machine
scp backend/wardens.json user@college-server:/path/to/SafeExit/backend/wardens.json
```

**7a. Preview. This changes nothing:**

```bash
docker compose -f docker-compose.prod.yml run --rm \
  -v "$PWD/backend/wardens.json:/app/wardens.json:ro" \
  backend node scripts/seedWardens.js --dry-run
```

It prints the warden accounts that exist in production today, then what it would do.

**7b. Read the preview.** Production had no warden accounts when this was written, so
expect `Warden accounts in this database now (0)` and 14 `created` lines: 13 wardens plus
the Chief Warden.

If the preview instead lists old ID + PIN warden accounts (someone created one in the
meantime), either remove them from Admin → People, or add `"replacesLoginId": "<their ID>"`
to the person who should take the account over. Converting keeps the old account's history
and deletes its PIN and passkeys.

**7c. Apply** (same command without `--dry-run`):

```bash
docker compose -f docker-compose.prod.yml run --rm \
  -v "$PWD/backend/wardens.json:/app/wardens.json:ro" \
  backend node scripts/seedWardens.js
```

It is all-or-nothing: on any error nothing is saved. It is also safe to re-run later, for
example after editing the file when a warden changes.

## 8. Test it end to end

1. **A warden:** open `https://erp.nitp.ac.in/safeexit/login/warden` → Sign in with Google →
   a warden's account. They land on **their own hostel's** dashboard.
2. **A student account** on the same page: refused ("not registered as a hostel warden").
3. **A warden's account on the Chief Warden page** (`/login/chief-warden`): refused.
4. **`bambam.ec@nitp.ac.in` on the Chief Warden page:** lands on the Chief Warden dashboard.
5. **An old warden ID + PIN:** refused, and any phone still logged in with the old PIN is
   signed out on its next request.
6. **Admin → People → Wardens** lists all 13, several per hostel.
7. **Forward one outing from a caretaker:** every warden of that hostel sees it; once one
   decides, it disappears from the others' queues.

## 9. Afterwards

- Adding or removing a warden later: Admin → People → Wardens → **Add Warden** (by email) or
  **Remove**. Or edit `wardens.json` and re-run step 7.
- Optionally delete `backend/wardens.json` from the server. It holds only emails and phone
  numbers that are already public on the college website.

## If something goes wrong

| Symptom | Cause |
|---|---|
| "Google sign-in is not configured yet" | Step 3/4: `GOOGLE_CLIENT_ID` missing or not restarted. |
| Google popup says `origin_mismatch` / "invalid origin" | Step 1.3: origin must be exactly `https://erp.nitp.ac.in`. |
| Google says "access blocked: app in testing" | Step 1.2: publish the app, or use Internal. |
| "could not be verified" for everyone | Step 5: the server cannot reach `www.googleapis.com`. |
| "not registered as a hostel warden" for a real warden | Their email is not in the database, or has a typo. Check step 7's output. |
| "no hostel assigned" | Admin → People → Wardens → Assign hostel. |
