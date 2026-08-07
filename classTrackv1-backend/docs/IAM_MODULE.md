# Enterprise Identity & Access Management (IAM) Module

This document covers the authentication upgrade delivered on top of the
existing ClassTrack AI enterprise architecture. **No business logic outside
authentication was changed.** Everything here is additive — the pre-existing
`/api/auth/*` surface, database schema, and frontend continue to work exactly
as before.

---

## 1. What changed, at a glance

| Area | Before | After |
|---|---|---|
| Access tokens | One JWT, 7-day expiry, used directly | Short-lived JWT (15 min default) + separate refresh flow |
| Refresh | None — re-login required every 7 days | Opaque, rotating refresh token (30 day default), stored hashed |
| Authorization | Hard-coded `authorizeRoles('admin')` checks | New `authorizePermissions(...)` checks named permissions; `authorizeRoles` still works, untouched |
| Password hashing | bcrypt, cost factor 10 | Unchanged — already correct |
| Email verification | None | Optional (off by default), for admin/teacher accounts |
| Forgot/reset password | None (only admin/teacher-initiated resets existed) | Full self-service flow for admin/teacher; students still use the existing teacher/admin-initiated reset |
| Login history | None | Every login attempt (success or failure) recorded with IP, user agent, timestamp |
| Account lockout | None | Configurable — locks after N failed attempts for M minutes |
| Audit logging | Partial (admin actions only) | Extended to cover every auth event: login, logout, password change, role/lockout events |
| API docs | None | Swagger/OpenAPI at `/api-docs`, full JSDoc coverage of the auth surface |
| API versioning | `/api/*` only | `/api/*` (legacy, unchanged) + `/api/v1/*` (new, full IAM surface) |

---

## 2. Why two API surfaces?

- **`/api/auth/*`** — the original 4 endpoints (admin/teacher/student login,
  student register). **Unchanged.** The existing React frontend calls these
  and will keep working with zero modification.
- **`/api/v1/auth/*`** — the same 4 endpoints (same controller functions,
  richer response) **plus** `refresh`, `logout`, `logout-all`,
  `forgot-password`, `reset-password`, `verify-email`,
  `resend-verification`, `change-password`, `me`.
- **`/api/v1/{admin,teacher,student,account}/*`** — the existing routers,
  re-mounted unchanged, for API-version consistency.

A new frontend (or an updated version of the existing one) can adopt the v1
surface incrementally, starting with login, without a big-bang migration.

---

## 3. Token model

```
Client -- login --> POST /api/v1/auth/*/login
                          |
                accessToken  (JWT, 15m)
                refreshToken (opaque, 30d)
                          |
     Every API call: Authorization: Bearer <accessToken>
                          |
          accessToken expires -> POST /api/v1/auth/refresh { refreshToken }
                          |
          new accessToken + refreshToken issued
          (old refreshToken revoked, linked to the new one)

     If a refreshToken is reused after being rotated:
       -> reuse detected -> ALL sessions for that user revoked
       -> forced re-login everywhere
```

**Why rotation + reuse detection matters:** if a refresh token is ever
stolen (XSS, log leak, intercepted request), the attacker and the
legitimate user will both eventually try to use it. The *first* use
succeeds and rotates the token. The *second* use (whichever party is
second) presents a token that's already been marked "replaced" — that's
the signal something is wrong, and the response is to kill every session
for that account, not just the compromised one.

### What's stored where

| Data | Storage | Notes |
|---|---|---|
| Access token | Not stored server-side | Stateless JWT, verified by signature + expiry |
| Refresh token (raw) | Never stored | Shown to the client exactly once |
| Refresh token (hash) | `refresh_tokens.token_hash` | SHA-256, irreversible |
| Password | `*.password_hash` | bcrypt, cost 10 (unchanged from before this module) |
| Email verification / reset tokens | Hashed, same pattern as refresh tokens | Single-use (`used_at`), time-limited (`expires_at`) |

---

## 4. Permission model

Routes now express *what* they require, not *who* is allowed:

```js
// Old style — still works, unchanged, used throughout the pre-existing routes
router.get('/stats', authenticate, authorizeRoles('admin'), controller.getStats);

// New style — same effect, but decoupled from the role name
router.post('/classrooms', authenticate, authorizePermissions(PERMISSIONS.CLASSROOM_CREATE), controller.createClassroom);
```

The mapping lives in `src/constants/permissions.constants.js` (fast,
in-memory) and is mirrored in the `permissions` / `role_permissions` tables
(migration 002) for auditability. To change who can do what, edit the
mapping in one place — no route file needs to change.

`authenticate` middleware computes `req.user.permissions` once per request
(a plain array lookup, not a DB query), so `authorizePermissions` is
essentially free at request time.

---

## 5. Account lockout

- Configurable via `MAX_FAILED_LOGIN_ATTEMPTS` (default 5) and
  `LOCKOUT_DURATION_MINUTES` (default 15).
- Applies to all three roles (admin, teacher, student).
- A locked account gets a clear `403` with a "try again after HH:MM:SS"
  message — this is *not* hidden behind a generic error, since the user
  already proved they know a valid identifier.
- Successful login resets the counter. A successful password reset also
  clears any active lockout.
- Enforced twice: once at login (obviously), and again on every
  authenticated request (`auth.middleware.js`) — so an account locked
  mid-session is cut off immediately, not just prevented from logging in
  again.

---

## 6. Email verification

**Off by default** (`REQUIRE_EMAIL_VERIFICATION=false`). This is a
deliberate compatibility decision: every teacher account created before
this module existed has no `email_verified_at` value. Turning enforcement
on without a migration path would lock out your entire existing teacher
base. When you're ready:

1. Set `REQUIRE_EMAIL_VERIFICATION=true` in `.env`.
2. Either bulk-verify existing accounts in the database, or send them all a
   verification link via `resend-verification`.
3. Deploy.

Only admin and teacher accounts participate — students authenticate by
username and have no email column in the schema, so there's no delivery
channel for a student verification link.

---

## 7. Forgot / reset password

Available for admin and teacher (email-based) accounts via
`/api/v1/auth/forgot-password` and `/api/v1/auth/reset-password`.

Students have no email on file, so there's no self-service flow for them —
this is an intentional scope limit, not an oversight. A student's password
continues to be reset by their teacher (`POST /teacher/students/:id/reset-password`)
or an admin, exactly as it worked before this module.

The forgot-password endpoint **always returns the same generic message**
regardless of whether the email exists, to prevent account enumeration.

---

## 8. API documentation

Interactive Swagger UI: **`GET /api-docs`**
Raw OpenAPI JSON: **`GET /api-docs.json`**

Every `/api/v1/auth/*` endpoint has full JSDoc-driven documentation:
request/response schemas, status codes, and auth requirements. See
`src/routes/v1/auth.routes.js` for the source annotations and
`src/config/swagger.config.js` for the shared schema components.

---

## 9. Running the tests

```bash
cd server
npm install
npm test
```

- `tests/unit/` — token utilities, permission logic, the
  `authorizePermissions` middleware, and the token service (rotation,
  reuse detection, expiry) — all with the database layer mocked.
- `tests/integration/` — full HTTP-level tests through `supertest` against
  the real Express app (`app.js`), covering login success/failure/lockout,
  refresh rotation and reuse detection, forgot-password enumeration
  resistance, and the authenticated logout flow. Only the repository/DB
  layer is mocked, so these run without a live MySQL instance — useful for
  CI pipelines that don't provision a database.

---

## 10. Migration checklist

1. Run `database/migrations/002_auth_enterprise.sql` against your existing
   database (additive — no data loss, no downtime required).
2. Add the new environment variables from `.env.example` to your `.env`
   (all have safe defaults; nothing is required to keep the app running).
3. `npm install` in `server/` to pick up `nodemailer`, `swagger-jsdoc`,
   `swagger-ui-express`.
4. Deploy. The legacy frontend and `/api/auth/*` surface work unchanged.
5. Optionally, start migrating the frontend to the `/api/v1/auth/*`
   surface to gain refresh tokens, forgot-password, and email verification
   — at your own pace, endpoint by endpoint.
