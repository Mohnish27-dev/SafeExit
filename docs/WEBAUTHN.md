# WebAuthn / Passkey Authentication

This document describes the real WebAuthn (FIDO2) implementation that replaced the
earlier mock. It covers the security model, the API surface, the data stored, and
configuration.

## Why this change was made

The previous implementation was authentication theater:

- The frontend triggered the browser biometric prompt with a throwaway, all-zero
  challenge (`new Uint8Array(32)`) and **discarded the result**.
- The backend `registerWebAuthn` just set `webAuthnRegistered = true`.
- The backend `verifyWebAuthnLogin` took an `email` from the request body and, if
  that user had `webAuthnRegistered === true`, **issued a valid JWT** — with no
  signature check.

Because emails are derived deterministically from the roll number, anyone who knew a
roll number could impersonate that student with a single unauthenticated request:

```bash
curl -X POST http://server/api/auth/webauthn/verify -d '{"email":"stu2024@college.edu"}'
# old behaviour: returned a real session token
```

The new implementation performs genuine public-key cryptography via
[`@simplewebauthn/server`](https://simplewebauthn.dev) v13, so a session token is only
issued after the server verifies a signature produced by the private key held inside
the user's authenticator (fingerprint / FaceID / device PIN). That private key never
leaves the device and cannot be forged from a roll number.

## The ceremony (two round-trips each)

WebAuthn registration and login are each a two-step "ceremony":

1. **`/options`** — the server generates a random, single-use **challenge** and returns
   the WebAuthn options. The challenge is stored on the user document
   (`currentChallenge`) for the duration of the ceremony.
2. **`/verify`** — the browser returns the authenticator's signed response; the server
   verifies the signature against the stored challenge, expected origin, and expected
   RP ID, then clears the challenge.

### Registration (binding a passkey to an existing account)

| Step | Endpoint | Auth | Purpose |
|------|----------|------|---------|
| 1 | `POST /api/auth/webauthn/register/options` | JWT (Bearer / cookie) | Issue creation challenge |
| 2 | `POST /api/auth/webauthn/register/verify`  | JWT (Bearer / cookie) | Verify attestation, store the public key |

Registration requires an authenticated session because a passkey must be bound to a
known account. The frontend creates the account via `POST /api/auth/register` first,
then uses the returned JWT to authorize these two calls.

### Login (authenticating with a passkey)

| Step | Endpoint | Auth | Purpose |
|------|----------|------|---------|
| 1 | `POST /api/auth/webauthn/login/options` | Public | Issue auth challenge scoped to the account's credentials |
| 2 | `POST /api/auth/webauthn/login/verify`  | Public | Verify the signed assertion, then issue a JWT |

Login is public on purpose: security comes from the signature over the server's
challenge, not from a pre-existing session. Knowing the email only lets an attacker
*start* a ceremony; without the authenticator's private key they cannot produce a valid
assertion, so `/login/verify` returns 401.

## What is stored

`User` schema (`backend/src/models/User.js`):

```js
webAuthnRegistered: Boolean,          // convenience flag
webAuthnCredentials: [{
  credentialID: String,               // base64url credential id (WebAuthnCredential.id)
  publicKey:    Buffer,               // COSE public key bytes
  counter:      Number,               // signature counter — bumped each login to block replay
  transports:   [String]              // e.g. ["internal"], ["hybrid"]
}],
currentChallenge: String              // single-use, cleared after each ceremony
```

The **private key is never stored** anywhere on the server — only the public key. The
`counter` is the replay defence: each authentication must report a counter greater than
the last stored value.

## Security properties

- **No signature, no token.** `/login/verify` calls `verifyAuthenticationResponse` and
  only issues a JWT when `verified === true`.
- **Challenge binding.** Each ceremony uses a fresh server-generated challenge stored on
  the user record and validated on verify, then cleared — a captured challenge cannot be
  reused.
- **Origin / RP ID binding.** Verification checks `expectedOrigin` and `expectedRPID`, so
  a response collected on a phishing origin will not verify.
- **Replay protection.** The authenticator's monotonic `counter` is persisted and checked.
- **Credential scoping.** `/login/options` returns `allowCredentials` for that account,
  and `/login/verify` matches the asserted credential id against stored credentials.

## Configuration

Set in `backend/.env`:

```
RP_ID=localhost                 # registrable domain (no scheme/port). Prod: e.g. safeexit.app
RP_NAME=NITP-SafeExit           # user-visible relying-party name
RP_ORIGIN=http://localhost:3000 # exact origin where navigator.credentials runs (the frontend)
```

Defaults (used if unset) are the localhost dev values above.

### Important runtime notes

- **Secure context required.** WebAuthn only runs on `https://` or on `localhost`/`127.0.0.1`.
  Testing over a LAN IP or tunnel requires HTTPS and matching `RP_ID` / `RP_ORIGIN`.
- **`RP_ORIGIN` is the frontend origin**, not the backend. Requests reach the backend via
  the Next.js rewrite `/api/backend/:path*` → `http://127.0.0.1:5000/api/:path*`, but the
  WebAuthn ceremony happens in the browser at `http://localhost:3000`.
- **Legacy accounts.** Users created under the old mock have `webAuthnRegistered: true`
  but no stored credential, so passkey *login* will report "no passkey registered". They
  must re-run passkey setup (or use password login).

## Files changed

Backend:
- `src/controllers/authController.js` — four real ceremony handlers replacing the two mocks
- `src/routes/authRoutes.js` — four new routes replacing `/webauthn/register` + `/webauthn/verify`
- `src/models/User.js` — credential fields + `currentChallenge`
- `.env` — `RP_ID`, `RP_NAME`, `RP_ORIGIN`

Frontend:
- `package.json` — added `@simplewebauthn/browser`
- `src/app/login/student/page.js` — `setupWebAuthn` and `handleBiometricLogin` now run the
  real ceremony via `startRegistration` / `startAuthentication`
