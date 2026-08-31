# ClassTrack AI

An AI-powered classroom management platform for educational institutions.

ClassTrack AI is a full-stack web application that gives administrators, teachers, and students a secure, role-based environment for classroom management, assignment workflows, AI-assisted evaluation, a knowledge base with RAG retrieval, a question bank, practice sessions, and quiz assignments.

---

## User Roles

| Role | Description |
|------|-------------|
| **Admin** | Manages the platform: creates/manages teachers, assigns classrooms, generates teacher registration codes, monitors the dashboard and audit logs |
| **Teacher** | Manages classrooms, creates and publishes assignments, reviews submissions, grades, builds a knowledge base, generates quiz questions, assigns quizzes |
| **Student** | Views and submits assignments, practices with AI-generated questions, takes assigned quizzes, tracks mastery |

---

## Current Project Status

The following features are implemented, tested, and manually verified in the running application:

| Module | Status |
|--------|--------|
| Enterprise authentication (login, refresh, logout) | ✅ Complete |
| JWT access + refresh token rotation | ✅ Complete |
| Role-based access control (RBAC) + permission checks | ✅ Complete |
| Account lockout after repeated failed logins | ✅ Complete |
| Forgot / reset password (all roles) | ✅ Complete |
| Gmail SMTP password-reset email delivery | ✅ Complete |
| Email verification (teacher/admin) | ✅ Complete |
| Admin dashboard | ✅ Complete |
| Admin teacher management | ✅ Complete |
| Teacher self-registration via admin-issued code | ✅ Complete |
| Teacher registration code management (generate/view/revoke) | ✅ Complete |
| Classroom management (teacher) | ✅ Complete |
| Assignment / task management (teacher) | ✅ Complete |
| AI submission evaluation (Groq) | ✅ Complete |
| Manual grading + score override | ✅ Complete |
| Knowledge base (RAG, pgvector) | ✅ Complete |
| AI question generation | ✅ Complete |
| Question bank lifecycle | ✅ Complete |
| Student practice sessions + mastery tracking | ✅ Complete |
| Quiz assignments (teacher create → student take) | ✅ Complete |
| Student registration + login | ✅ Complete |
| Student assignment submission | ✅ Complete |
| Notification framework | ✅ Complete |
| Audit logging | ✅ Complete |
| PostgreSQL + Flyway migrations (V1–V18) | ✅ Complete |

---

## Features

### Authentication & Security

- Short-lived JWT access tokens (15 min default) + rotating refresh tokens (30 days)
- Account lockout after configurable failed-login attempts
- Forgot password: works for admin, teacher, and student accounts
- Password-reset tokens stored as SHA-256 hashes; raw token shown once via email
- Single-use reset tokens; all sessions revoked on successful reset
- Generic forgot-password response prevents account enumeration
- Email verification for teacher and admin accounts (configurable)
- Passwords hashed with bcrypt (cost factor 10)
- Teacher registration codes stored as SHA-256 hashes; raw code displayed once
- Sensitive fields (password hashes, tokens) never returned in API responses or logs
- Helmet security headers on all responses
- CORS restricted to `CLIENT_URL`
- Rate limiting on login, register, refresh, and forgot-password routes

### Teacher Registration Workflow

The teacher registration flow is code-gated to prevent unauthorized sign-ups:

```
Admin generates a registration code
  → Code is shown once in ABCD-1234 format
  → Admin shares the code with the teacher
  → Teacher fills in the registration form with the code
  → Server validates the code, creates the teacher account, marks the code as used
  → Admin can then assign a classroom to the new teacher
  → Teacher logs in and sees their assigned classroom
```

- Registration codes have a configurable expiry (default 24 hours)
- Codes are single-use; admin can revoke unused codes
- Teacher role is always assigned server-side — client cannot escalate privileges

### Admin Panel

- **Dashboard**: real-time counts for teachers, students, classrooms, tasks, submissions; recent audit activity; alerts for pending evaluations, failed evaluations, unassigned teachers, and expired registration codes
- **Teacher management**: view all teachers (with classroom count and mobile number), view teacher details, update name/email/mobile, activate/deactivate, reset password, assign classroom, remove from classroom
- **Teacher registration codes**: generate, list (with status: active/used/expired/revoked), revoke
- **Classroom management**: create classrooms and assign them to teachers
- **Audit logs**: paginated feed of admin actions

### Teacher Module

- Dashboard stats: classrooms, students, pending evaluations, recent activity
- Classroom management: create, edit, archive/restore, soft-delete, regenerate join code
- Task (assignment) management: create, edit, publish/unpublish, archive/restore, duplicate, soft-delete
- Grading overview per classroom (per-task and per-student aggregates)
- Pending evaluations cross-classroom view
- Submission review: view submission, AI evaluation, override score, re-analyse
- Knowledge base: Curriculum → Subject → Chapter → Topic → Document hierarchy; documents ingested into pgvector for RAG retrieval
- Question bank: AI-generated questions, lifecycle (pending → approved → published → archived), approve/reject/publish/archive
- Quiz assignments: create quiz, add questions from bank, publish, view student results
- Classroom and task reports (PDF + CSV download)

### Student Module

- Register with a classroom join code
- Log in by username (or email/mobile for newer accounts)
- View and submit assignments (file upload: PDF, image; or typed text)
- View submission history and AI/teacher feedback
- Practice with AI-generated questions per topic
- Practice sessions with mastery tracking
- Take assigned quizzes
- View quiz results

---

## Technology Stack

### Backend

| Technology | Purpose |
|-----------|---------|
| Node.js + Express | API server |
| PostgreSQL 16 + pgvector | Relational database with vector search |
| Flyway | Database schema migrations |
| `pg` | PostgreSQL client |
| bcryptjs | Password hashing |
| jsonwebtoken | JWT signing/verification |
| Joi | Request validation |
| Nodemailer | Email (SMTP) |
| Groq SDK | LLM for AI evaluation and question generation |
| @xenova/transformers | Local ONNX embedding model |
| Winston | Structured logging |
| Helmet + CORS | Security headers |
| express-rate-limit | Rate limiting |
| Swagger / OpenAPI | Interactive API documentation at `/api-docs` |
| Multer | File uploads |

### Frontend

| Technology | Purpose |
|-----------|---------|
| React 19 + TypeScript (strict) | UI framework |
| Vite 6 | Build tool and dev server |
| Material UI 6 | Component library |
| React Router v7 | Client-side routing |
| TanStack Query v5 | Server-state management and caching |
| React Hook Form + Zod | Forms and schema validation |
| Zustand | Global client state |
| Axios | HTTP client |
| Recharts | Data visualisation |
| Notistack | Toast notifications |
| Vitest + Testing Library | Frontend unit tests |

---

## Project Structure

```
classTrack-AI/
├── classTrackv1-backend/
│   ├── database/
│   │   ├── init/                    # Docker init scripts (extensions)
│   │   └── migrations/flyway/       # Flyway SQL migrations (V1–V18)
│   ├── docker-compose.yml           # PostgreSQL + Flyway services
│   └── server/
│       ├── app.js                   # Express app factory
│       ├── server.js                # HTTP server entry point
│       ├── seed.js                  # Demo data seeder
│       ├── .env.example             # Environment variable template
│       └── src/
│           ├── config/              # Centralised config (env vars)
│           ├── constants/           # Permissions definitions
│           ├── controllers/         # Route handlers (thin)
│           ├── database/            # pg connection pool
│           ├── middleware/          # Auth, rate limit, validation, logging
│           ├── repositories/        # SQL data access layer
│           ├── routes/              # Express routers
│           │   └── v1/              # Versioned IAM routes
│           ├── services/            # Business logic
│           │   ├── ai/              # Groq + embedding providers
│           │   ├── knowledge/       # RAG ingestion, retrieval, reranking
│           │   ├── questions/       # Question generation and practice
│           │   └── report/          # PDF and CSV report generation
│           ├── utils/               # JWT, token, logger, scoring helpers
│           └── validators/          # Joi validation schemas
│
├── classTrackv1-frontend/
│   └── src/
│       ├── app/                     # Providers (QueryClient, Theme, Router)
│       ├── assets/                  # Static assets
│       ├── components/              # Reusable UI components
│       ├── features/                # Feature-sliced modules
│       │   ├── admin/               # Admin feature components + API
│       │   ├── auth/                # Login, register, forgot/reset password
│       │   ├── dashboard/           # Dashboard widgets
│       │   ├── knowledge/           # Knowledge base UI
│       │   ├── practice/            # Student practice UI
│       │   ├── questions/           # Question bank UI
│       │   ├── quizAssignments/     # Quiz assignment UI
│       │   ├── student/             # Student features
│       │   └── teacher/             # Teacher features
│       ├── hooks/                   # Shared custom hooks
│       ├── layouts/                 # Role-based shell layouts
│       ├── pages/                   # Route-level page components
│       │   ├── admin/               # Admin dashboard, teachers
│       │   ├── auth/                # Login, register, forgot/reset/verify
│       │   ├── student/             # Student assignments, quizzes, practice
│       │   └── teacher/             # Teacher classrooms, tasks, knowledge, quizzes
│       ├── routes/                  # Route table + ProtectedRoute + RoleRoute guards
│       ├── services/                # Axios instance + API clients
│       ├── store/                   # Zustand global state
│       ├── theme/                   # MUI theme tokens
│       ├── types/                   # Shared TypeScript types
│       └── utils/                   # Constants, helpers
│
└── README.md
```

---

## Database & Migrations

The project uses **PostgreSQL 16** with the **pgvector** extension and **Flyway** for version-controlled schema migrations.

### Migration history

| Version | Description |
|---------|-------------|
| V1 | Initial schema (admins, teachers, classrooms, students, tasks, submissions, notifications, tokens) |
| V2 | Seed permissions (RBAC permission codes) |
| V3 | RAG knowledge base (curriculum/subject/chapter/topic/document/chunk with pgvector) |
| V4 | RAG permissions |
| V5 | Question bank |
| V6 | Question bank permissions |
| V7 | Student view-own permission |
| V8 | Quiz attempts (per-question tracking) |
| V9 | Quiz results permissions |
| V10 | Student practice |
| V11 | Quiz assignments |
| V12 | Quiz assignment permissions |
| V13 | Knowledge hard-delete cleanup |
| V14 | Practice sessions |
| V15 | Practice session ID on quiz attempts |
| V16 | Student topic mastery |
| V17 | Student email + mobile_number columns |
| V18 | Teacher registration codes table + teachers.mobile_number column |

All 18 migrations are applied to the current database (verified).

---

## API Overview

All endpoints are prefixed with `/api/v1`. The API also serves interactive documentation at `http://localhost:5000/api-docs`.

A health check is available at `GET /api/health` (no auth required).

### Authentication — `/api/v1/auth`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/admin/login` | — | Admin email + password login |
| POST | `/auth/teacher/login` | — | Teacher email + password login |
| POST | `/auth/teacher/register` | — | Teacher self-registration (requires admin-issued code) |
| POST | `/auth/student/register` | — | Student registration with classroom join code |
| POST | `/auth/student/login` | — | Student login (username or email/mobile) |
| GET | `/auth/me` | Bearer | Current authenticated user |
| POST | `/auth/refresh` | — | Exchange refresh token for a new token pair |
| POST | `/auth/logout` | Bearer | Revoke current refresh token |
| POST | `/auth/logout-all` | Bearer | Revoke all sessions |
| POST | `/auth/forgot-password` | — | Request a password reset email |
| GET | `/auth/validate-reset-token` | — | Validate a reset token (query: `?token=`) |
| POST | `/auth/reset-password` | — | Complete password reset with token + new password |
| POST | `/auth/verify-email` | — | Consume an email verification token |
| POST | `/auth/resend-verification` | — | Resend email verification link |
| POST | `/auth/change-password` | Bearer | Change own password (requires current password) |

### Admin — `/api/v1/admin` (admin role required)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/dashboard` | Aggregated platform dashboard data |
| GET | `/admin/stats` | Platform-level counts |
| GET | `/admin/audit-logs` | Paginated audit log |
| POST | `/admin/teachers` | Create a teacher account (admin-created) |
| GET | `/admin/teachers` | List all teachers (with classroom count) |
| GET | `/admin/teachers/:id` | Get teacher details with classroom list |
| PATCH | `/admin/teachers/:id` | Update teacher (name, email, mobile) |
| PATCH | `/admin/teachers/:id/status` | Set teacher active/inactive |
| PATCH | `/admin/teachers/:id/toggle-active` | Toggle teacher active status |
| POST | `/admin/teachers/:id/reset-password` | Reset teacher password |
| PATCH | `/admin/teachers/:id/classroom` | Assign teacher to a classroom |
| DELETE | `/admin/teachers/:id/classroom/:classroomId` | Remove teacher from a classroom |
| POST | `/admin/teacher-registration-codes` | Generate a teacher registration code |
| GET | `/admin/teacher-registration-codes` | List all registration codes |
| POST | `/admin/teacher-registration-codes/:id/revoke` | Revoke a registration code |
| POST | `/admin/classrooms` | Create a classroom |
| GET | `/admin/classrooms` | List all classrooms |

### Teacher — `/api/v1/teacher` (teacher role required)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/teacher/dashboard` | Dashboard statistics |
| GET | `/teacher/classrooms` | My classrooms (simple list) |
| GET/POST | `/teacher/classrooms/manage` | Paginated classroom list / create classroom |
| GET/PATCH/DELETE | `/teacher/classrooms/manage/:classroomId` | Get / update / delete classroom |
| PATCH | `/teacher/classrooms/manage/:classroomId/archive` | Archive classroom |
| PATCH | `/teacher/classrooms/manage/:classroomId/restore` | Restore archived classroom |
| PATCH | `/teacher/classrooms/manage/:classroomId/regenerate-code` | New join code |
| GET | `/teacher/classrooms/manage/:classroomId/grading-overview` | Grading overview |
| GET/POST | `/teacher/tasks` | Paginated task list / create task |
| GET/PATCH/DELETE | `/teacher/tasks/:taskId` | Get / update / delete task |
| PATCH | `/teacher/tasks/:taskId/publish` | Publish task |
| PATCH | `/teacher/tasks/:taskId/unpublish` | Unpublish task |
| PATCH | `/teacher/tasks/:taskId/archive` | Archive task |
| PATCH | `/teacher/tasks/:taskId/restore` | Restore archived task |
| POST | `/teacher/tasks/:taskId/duplicate` | Duplicate task |
| GET | `/teacher/tasks/:taskId/submissions` | Submissions for a task |
| GET | `/teacher/pending-evaluations` | Cross-classroom pending evaluations |
| GET | `/teacher/submissions/:submissionId` | Submission detail |
| PATCH | `/teacher/submissions/:submissionId/override-score` | Override AI score |
| POST | `/teacher/submissions/:submissionId/reanalyze` | Trigger re-analysis |
| POST | `/teacher/students/:studentId/reset-password` | Reset student password |

### Student — `/api/v1/student` (student role required)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/student/tasks` | View assigned tasks |
| POST | `/student/tasks/:taskId/submit` | Submit assignment (file or text) |
| GET | `/student/submissions` | My submission history |
| GET | `/student/submissions/:submissionId/history` | Submission version history |
| GET | `/student/report` | Download personal progress report |

---

## Environment Configuration

Copy `.env.example` to `.env` in `classTrackv1-backend/server/` and fill in your values.

### Required variables

```dotenv
# Server
PORT=5000
NODE_ENV=development
CLIENT_URL=http://localhost:5173

# PostgreSQL
DB_HOST=localhost
DB_PORT=5432
DB_USER=classtrack
DB_PASSWORD=your_db_password
DB_NAME=classtrack_ai
DB_POOL_LIMIT=10

# JWT
JWT_SECRET=change_this_to_a_long_random_secret
JWT_EXPIRES_IN=7d
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=30d
JWT_REFRESH_TOKEN_BYTES=64

# Account lockout
MAX_FAILED_LOGIN_ATTEMPTS=5
LOCKOUT_DURATION_MINUTES=15

# Email verification (off by default)
REQUIRE_EMAIL_VERIFICATION=false
EMAIL_VERIFICATION_EXPIRES_HOURS=24

# Password reset
PASSWORD_RESET_EXPIRES_MINUTES=60

# SMTP (leave blank to log emails to console instead of sending)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_gmail_address@gmail.com
SMTP_PASSWORD=your_gmail_app_password
EMAIL_FROM=no-reply@classtrack.ai
EMAIL_FROM_NAME=ClassTrack AI

# Groq AI (required — server fails to start without this)
GROQ_API_KEY=your_groq_api_key
GROQ_TEXT_MODEL=llama3-70b-8192
GROQ_VISION_MODEL=llava-v1.5-7b-4096-preview
GROQ_RAG_MODEL=llama3-70b-8192

# Embedding (local ONNX model — no API key needed)
EMBEDDING_PROVIDER=local
EMBEDDING_MODEL=Xenova/all-MiniLM-L6-v2
EMBEDDING_DIMENSION=384
```

> **SMTP note:** For Gmail, create a dedicated [App Password](https://support.google.com/accounts/answer/185833) rather than using your account password. If `SMTP_HOST` is left blank, emails are printed to the console instead of being sent (safe for local development without email).

See `classTrackv1-backend/server/.env.example` for the full list of optional RAG, question-generation, and AI-queue variables.

---

## Local Development

### Prerequisites

- Node.js 18+
- Docker (for PostgreSQL + Flyway)
- A Groq API key (free tier works — get one at [console.groq.com](https://console.groq.com))

### 1. Clone the repository

```bash
git clone <repository-url>
cd classTrack-AI
```

### 2. Set up the backend environment

```bash
cd classTrackv1-backend/server
cp .env.example .env
# Edit .env with your database credentials, JWT secret, and Groq API key
```

### 3. Start PostgreSQL

```bash
cd classTrackv1-backend
docker compose up -d postgres
```

The database container exposes PostgreSQL on `localhost:5432`. Wait for it to report `healthy` before running migrations.

### 4. Run Flyway migrations

```bash
docker compose --profile migrate run --rm flyway
```

This applies all migrations from `V1` through `V18` to the `classtrack_ai` database. Re-running is safe — Flyway skips already-applied migrations.

### 5. Install backend dependencies

```bash
cd classTrackv1-backend/server
npm install
```

### 6. Seed demo data (optional)

Creates a demo admin, teacher, classroom, and student so you can log in immediately.

```bash
npm run seed
```

Demo credentials created by the seed:

| Role | Email / Username | Password |
|------|-----------------|----------|
| Admin | `admin@classtrack.ai` | `Admin@123` |
| Teacher | `teacher@classtrack.ai` | `Teacher@123` |
| Student | `demo_student` | `Demo@123` |

### 7. Start the backend server

```bash
npm run dev        # development (nodemon auto-reload)
# or
npm start          # production (plain node)
```

The API listens on `http://localhost:5000`. Interactive API docs are available at `http://localhost:5000/api-docs`.

### 8. Install frontend dependencies

```bash
cd classTrackv1-frontend
npm install
```

### 9. Start the frontend dev server

```bash
npm run dev
```

The dev server starts at `http://localhost:5173` and proxies all `/api/*` requests to the backend at `http://localhost:5000`.

---

## Running Tests

### Backend tests

Tests run in-process using Jest + Supertest. Most tests mock the database and do not require a running PostgreSQL instance.

```bash
cd classTrackv1-backend/server
npm test
```

**Latest result:** 70 test suites passed · 1 220 tests passed · 0 failures (5 suites skipped — they require a live database connection and are excluded in CI).

### Frontend tests

```bash
cd classTrackv1-frontend
npm test
```

Runs the Vitest suite with jsdom.

---

## Building the Frontend

```bash
cd classTrackv1-frontend
npm run build
```

Output goes to `classTrackv1-frontend/dist/`. Source maps are included.

> **Known issue:** `QuizAssignmentDetailPage.tsx` has pre-existing TypeScript errors (missing imports/types) that cause `tsc` to fail. These errors exist in the working branch and do not affect the development server or runtime behaviour — the Vite dev build succeeds. A type-check-only pass (`npm run typecheck`) will report these errors until that file is fixed.

---

## Security Notes

- All tokens (refresh tokens, password-reset tokens, email-verification tokens, teacher registration codes) are stored in the database as **SHA-256 hashes only**. The raw value is returned to the client exactly once and cannot be recovered from the database.
- Password reset **revokes all active sessions** for the account on success.
- The forgot-password endpoint always returns a `200` response with the same generic message, regardless of whether the email exists, to prevent account enumeration.
- Teacher role is **always assigned server-side** during registration — client-supplied role values are ignored.
- Admin routes (`/api/v1/admin/*`) enforce both JWT authentication and `admin` role on every request.
- The `authenticate` middleware re-validates account `is_active` and lockout status from the database on **every request**, so disabling an account takes effect immediately without waiting for the access token to expire.
- Sensitive fields (`password_hash`, `code_hash`, `token_hash`, `locked_until`, `failed_login_attempts`) are never included in API responses.

---

## Future Roadmap

Items listed here are **not yet implemented** and represent planned work only.

- Advanced student analytics dashboard
- Attendance tracking
- Institution-level multi-admin management
- Bulk student import
- Extended AI evaluation configurability (rubric editor)
- Mobile application
- AWS / production deployment pipeline

---

## Author

**Gaurav Sonawane**  
Full Stack Developer | AI Enthusiast

---

## License

MIT License
