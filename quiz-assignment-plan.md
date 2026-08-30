# Quiz Assignment System — Implementation Plan

## Overview

Implement a standalone **Quiz Assignment** bounded workflow, entirely separate from the
existing file-submission `Tasks` system. Teachers compose quizzes from published questions
in their question bank, assign them to classrooms, and view per-student results.
Students see assigned quizzes in their portal, answer all questions, submit the complete
quiz in one action, and receive auto-scored results immediately.

**Architecture decision:** New tables (`quiz_assignments`, `quiz_assignment_questions`,
`quiz_assignment_attempts`), new permissions, new routes, new services, new frontend
pages. Zero changes to the existing `tasks` / `submissions` tables or their routes.

---

## Confirmed Design Decisions

| Decision | Choice |
|----------|--------|
| Quiz submission model | One-shot final submit (all answers at once); no per-question submit |
| Duplicate submission protection | Server enforces `status='submitted'` guard; client disables button while pending |
| Marks override | Supported in V1 — `marks_override` column on `quiz_assignment_questions`; NULL = use question default |
| Retake model | `allow_retake` flag; each submission is a **new INSERT row** (no overwrite) — full attempt history preserved |
| Curriculum navigator | **Must be built now** — cascading dropdowns (Curriculum → Subject → Chapter → Topic); reuses existing `useCurricula/useSubjects/useChapters/useTopics` hooks from `useKnowledge.ts` |
| Teacher question generation UX | `QuestionBankPage` gets a new "Generate Questions" panel using the `CurriculumNavigator` component |

---

## Entity Relationship Overview

```
teachers
  └── classrooms
        └── students
teachers
  └── curricula → subjects → chapters → topics
        └── question_bank (status='published')

quiz_assignments (teacher_id, classroom_id)
  └── quiz_assignment_questions (quiz_assignment_id, question_id, order_index, marks_override)
  └── quiz_assignment_attempts  (quiz_assignment_id, student_id, attempt_number, status, score, max_score, submitted_at)
```

> **Retake note:** `quiz_assignment_attempts` uses (`quiz_assignment_id`, `student_id`, `attempt_number`) as unique.
> A new attempt_number is computed as `MAX(attempt_number) + 1` per (quiz, student).
> There is NO upsert — every submission is a new row.

---

## Three Separate Workflows (must stay independent)

```
1. TEACHER QUESTION GENERATION
   Teacher → CurriculumNavigator selects Topic → RAG generate → pending_approval → approve → publish

2. QUIZ ASSIGNMENT WORKFLOW
   Teacher → Published Questions → Quiz Assignment → Classroom → Student → attempt → auto-score

3. STUDENT PRACTICE (unchanged)
   Student → Topic → RAG → private practice questions → answer per-question → score
```

---

## Sub-Tasks

---

### Sub-Task 1 — Database Migrations (V11 + V12)

**Status:** [ ] pending

**Intent:**
Create the three new tables that model the quiz assignment lifecycle and seed the new
permissions into the existing RBAC tables. Two migrations follow the existing V1–V10
naming pattern. The attempts table uses attempt_number (not UNIQUE on student alone)
to support the retake-history model.

**Expected Outcomes:**
- `quiz_assignments` table exists with correct columns, FK constraints, indexes.
- `quiz_assignment_questions` join table exists with `marks_override` NUMERIC(5,2).
- `quiz_assignment_attempts` table exists with UNIQUE(quiz_assignment_id, student_id, attempt_number).
- Three new permissions seeded: `quiz:create`, `quiz:manage_own`, `quiz:attempt`.
- Role-permission rows inserted for teacher and student.

**Todo List:**
1. Create `classTrackv1-backend/database/migrations/flyway/V11__quiz_assignments.sql`
   - Table `quiz_assignments`:
     - `id` INTEGER GENERATED ALWAYS AS IDENTITY PK
     - `teacher_id` INTEGER NOT NULL → FK → teachers.id ON DELETE CASCADE ON UPDATE CASCADE
     - `classroom_id` INTEGER NOT NULL → FK → classrooms.id ON DELETE CASCADE ON UPDATE CASCADE
     - `title` VARCHAR(200) NOT NULL
     - `instructions` TEXT NULL
     - `time_limit_minutes` INTEGER NULL DEFAULT NULL (NULL = no time limit)
     - `due_date` TIMESTAMP WITH TIME ZONE NULL DEFAULT NULL
     - `status` TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived'))
     - `allow_retake` BOOLEAN NOT NULL DEFAULT FALSE
     - `shuffle_questions` BOOLEAN NOT NULL DEFAULT FALSE
     - `deleted_at` TIMESTAMP WITH TIME ZONE NULL DEFAULT NULL
     - `created_at` TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
     - `updated_at` TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
   - Table `quiz_assignment_questions`:
     - `id` INTEGER GENERATED ALWAYS AS IDENTITY PK
     - `quiz_assignment_id` INTEGER NOT NULL → FK → quiz_assignments.id ON DELETE CASCADE ON UPDATE CASCADE
     - `question_id` INTEGER NOT NULL → FK → question_bank.id ON DELETE CASCADE ON UPDATE CASCADE
     - `order_index` INTEGER NOT NULL DEFAULT 0
     - `marks_override` NUMERIC(5,2) NULL DEFAULT NULL CHECK (marks_override > 0 OR marks_override IS NULL)
     - CONSTRAINT uq_qaq_quiz_question UNIQUE (quiz_assignment_id, question_id)
   - Table `quiz_assignment_attempts`:
     - `id` INTEGER GENERATED ALWAYS AS IDENTITY PK
     - `quiz_assignment_id` INTEGER NOT NULL → FK → quiz_assignments.id ON DELETE CASCADE ON UPDATE CASCADE
     - `student_id` INTEGER NOT NULL → FK → students.id ON DELETE CASCADE ON UPDATE CASCADE
     - `attempt_number` INTEGER NOT NULL DEFAULT 1
     - `status` TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','submitted'))
     - `score` NUMERIC(8,2) NULL DEFAULT NULL
     - `max_score` NUMERIC(8,2) NULL DEFAULT NULL
     - `started_at` TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
     - `submitted_at` TIMESTAMP WITH TIME ZONE NULL DEFAULT NULL
     - CONSTRAINT uq_qaa_quiz_student_attempt UNIQUE (quiz_assignment_id, student_id, attempt_number)
     - FK constraints as above
   - Indexes:
     - `idx_qa_teacher_id` ON quiz_assignments (teacher_id)
     - `idx_qa_classroom_id` ON quiz_assignments (classroom_id)
     - `idx_qa_status` ON quiz_assignments (status)
     - `idx_qa_teacher_deleted` ON quiz_assignments (teacher_id, deleted_at)
     - `idx_qaq_quiz_id` ON quiz_assignment_questions (quiz_assignment_id)
     - `idx_qaq_question_id` ON quiz_assignment_questions (question_id)
     - `idx_qaa_quiz_id` ON quiz_assignment_attempts (quiz_assignment_id)
     - `idx_qaa_student_id` ON quiz_assignment_attempts (student_id)
     - `idx_qaa_quiz_student` ON quiz_assignment_attempts (quiz_assignment_id, student_id)
2. Create `classTrackv1-backend/database/migrations/flyway/V12__quiz_assignment_permissions.sql`
   - INSERT into permissions: `quiz:create`, `quiz:manage_own`, `quiz:attempt` with descriptions
   - INSERT into role_permissions: teacher gets `quiz:create`, `quiz:manage_own`; student gets `quiz:attempt`
   - Use ON CONFLICT DO NOTHING pattern (same as V8, V9, V10)

**Relevant Context:**
- Pattern (table structure): `classTrackv1-backend/database/migrations/flyway/V5__question_bank.sql`
- Pattern (permission seeding): `classTrackv1-backend/database/migrations/flyway/V8__quiz_attempts.sql`
- FK naming convention: `CONSTRAINT fk_{table}_{col} FOREIGN KEY ({col}) REFERENCES {ref}(id) ON DELETE CASCADE ON UPDATE CASCADE`
- Unique constraint naming: `CONSTRAINT uq_{table}_{cols}`

---

### Sub-Task 2 — Permissions Constants

**Status:** [ ] pending

**Intent:**
Register the three new quiz permissions in the centralized permissions constant so all
middleware and service code can reference them by name rather than string literals.

**Expected Outcomes:**
- `PERMISSIONS.QUIZ_CREATE`, `PERMISSIONS.QUIZ_MANAGE_OWN`, `PERMISSIONS.QUIZ_ATTEMPT`
  exported from permissions.constants.js.
- `ROLE_PERMISSIONS.teacher` includes `QUIZ_CREATE` and `QUIZ_MANAGE_OWN`.
- `ROLE_PERMISSIONS.student` includes `QUIZ_ATTEMPT`.

**Todo List:**
1. Open `classTrackv1-backend/server/src/constants/permissions.constants.js`
2. Add three new entries to the `PERMISSIONS` object:
   - `QUIZ_CREATE: 'quiz:create'`
   - `QUIZ_MANAGE_OWN: 'quiz:manage_own'`
   - `QUIZ_ATTEMPT: 'quiz:attempt'`
3. Add `QUIZ_CREATE` and `QUIZ_MANAGE_OWN` to `ROLE_PERMISSIONS.teacher` array
4. Add `QUIZ_ATTEMPT` to `ROLE_PERMISSIONS.student` array

**Relevant Context:**
- File: `classTrackv1-backend/server/src/constants/permissions.constants.js`
- Existing pattern: `QUESTION_GENERATE: 'question:generate'`

---

### Sub-Task 3 — Backend: Shared Scoring Utility

**Status:** [ ] pending

**Intent:**
Extract the `_autoScore` helper that currently exists only inside `questionBank.service.js`
into a shared utility file so `quizAssignment.service.js` can reuse it without duplication.

**Expected Outcomes:**
- `classTrackv1-backend/server/src/utils/scoring.util.js` exists and exports `autoScore`.
- `questionBank.service.js` is updated to import from the new utility (internal behavior unchanged).
- No behavior change to existing question bank scoring.

**Todo List:**
1. Read the `_autoScore` function in `classTrackv1-backend/server/src/services/questions/questionBank.service.js`
2. Create `classTrackv1-backend/server/src/utils/scoring.util.js`:
   ```js
   const AUTO_SCORE_TYPES = ['mcq', 'true_false', 'one_word', 'fill_blank'];

   function autoScore(questionType, correctAnswer, studentAnswer, marks) {
     if (!AUTO_SCORE_TYPES.includes(questionType)) {
       return { isCorrect: null, score: null };
     }
     const isCorrect =
       correctAnswer.trim().toLowerCase() === studentAnswer.trim().toLowerCase();
     return { isCorrect, score: isCorrect ? Number(marks) : 0 };
   }

   module.exports = { autoScore };
   ```
3. In `questionBank.service.js`: replace the local `_autoScore` call with `require('../../utils/scoring.util').autoScore`

**Relevant Context:**
- Source: `classTrackv1-backend/server/src/services/questions/questionBank.service.js` — `_autoScore` function
- This is a minimal extraction, no logic change

---

### Sub-Task 4 — Backend Repository (`quizAssignment.repository.js`)

**Status:** [ ] pending

**Intent:**
Implement the data access layer for all three new tables. Follows the same patterns as
`task.repository.js` and `questionBank.repository.js` — extends `BaseRepository`,
uses parameterized `$1, $2` placeholders, always scopes to `teacher_id` or `student_id`
for ownership safety. Retakes are new INSERTs, not upserts.

**Expected Outcomes:**
- `classTrackv1-backend/server/src/repositories/quizAssignment.repository.js` exists.
- Teacher methods: create, listByTeacher, findByIdForTeacher (with questions), updateFields,
  setStatus, softDelete, addQuestion, removeQuestion, reorderQuestions, getResultsForTeacher.
- Student methods: listForStudent, findForStudent (with questions + latest attempt), insertAttempt,
  listAttemptsForStudent, getLatestAttempt.

**Todo List:**
1. Create `classTrackv1-backend/server/src/repositories/quizAssignment.repository.js`
2. Extend `BaseRepository` (require `./base.repository`)
3. Implement teacher methods:
   - `create({ teacherId, classroomId, title, instructions, timeLimitMinutes, dueDate, shuffleQuestions, allowRetake })` → INSERT, return `{ id, title, status, created_at }`
   - `listByTeacher(teacherId)` → all non-deleted quizzes with `question_count` (subquery COUNT from quiz_assignment_questions) and `attempt_count` (subquery COUNT DISTINCT student_id from quiz_assignment_attempts where status='submitted'), ordered by created_at DESC
   - `findByIdForTeacher(id, teacherId)` → quiz row + all questions via LEFT JOIN quiz_assignment_questions JOIN question_bank, ordered by order_index ASC. Returns null if not found or teacher_id doesn't match. Questions include: `qaq.id as quiz_question_id, qaq.order_index, qaq.marks_override, qb.*`
   - `updateFields(id, teacherId, data)` → UPDATE SET ... WHERE id=$1 AND teacher_id=$2 AND deleted_at IS NULL, set updated_at=NOW()
   - `setStatus(id, teacherId, newStatus)` → UPDATE status, updated_at WHERE id AND teacher_id AND deleted_at IS NULL
   - `softDelete(id, teacherId)` → UPDATE deleted_at=NOW(), updated_at=NOW() WHERE id AND teacher_id
   - `addQuestion(quizId, questionId, orderIndex, marksOverride)` → INSERT INTO quiz_assignment_questions; marksOverride may be null
   - `removeQuestion(quizId, questionId)` → DELETE FROM quiz_assignment_questions WHERE quiz_assignment_id=$1 AND question_id=$2
   - `reorderQuestions(quizId, orderedQuestionIds)` → for each questionId in array, UPDATE order_index = array_position WHERE quiz_assignment_id=quizId AND question_id=questionId (loop or VALUES-based bulk UPDATE)
   - `getResultsForTeacher(quizId, teacherId)` → SELECT qaa.*, s.name AS student_name, s.username, COUNT(qaa2.id) FILTER (WHERE qaa2.quiz_assignment_id = qaa.quiz_assignment_id AND qaa2.student_id = qaa.student_id) AS total_attempts FROM quiz_assignment_attempts qaa JOIN students s ON s.id = qaa.student_id JOIN quiz_assignments qa ON qa.id = qaa.quiz_assignment_id WHERE qaa.quiz_assignment_id=$1 AND qa.teacher_id=$2 ORDER BY s.name ASC, qaa.attempt_number ASC
   - `countQuestions(quizId)` → SELECT COUNT(*) FROM quiz_assignment_questions WHERE quiz_assignment_id=$1
4. Implement student methods:
   - `listForStudent(studentId)` → SELECT qa.*, c.name AS classroom_name, latest_att.status AS attempt_status, latest_att.score AS attempt_score, latest_att.max_score AS attempt_max_score, latest_att.submitted_at AS attempt_submitted_at, (SELECT COUNT(*) FROM quiz_assignment_questions WHERE quiz_assignment_id=qa.id) AS question_count FROM quiz_assignments qa JOIN classrooms c ON c.id = qa.classroom_id JOIN students s ON s.classroom_id = c.id AND s.id=$1 LEFT JOIN LATERAL (SELECT * FROM quiz_assignment_attempts WHERE quiz_assignment_id=qa.id AND student_id=$1 ORDER BY attempt_number DESC LIMIT 1) latest_att ON TRUE WHERE qa.status='published' AND qa.deleted_at IS NULL ORDER BY qa.due_date ASC NULLS LAST, qa.created_at DESC
   - `findForStudent(quizId, studentId)` → single quiz (same access check: published, classroom match) with all questions ordered by order_index ASC; also attach `latest_attempt` via LATERAL join
   - `insertAttempt({ quizId, studentId, status, score, maxScore, startedAt, submittedAt, attemptNumber })` → INSERT INTO quiz_assignment_attempts, return the inserted row
   - `getNextAttemptNumber(quizId, studentId)` → SELECT COALESCE(MAX(attempt_number), 0) + 1 FROM quiz_assignment_attempts WHERE quiz_assignment_id=$1 AND student_id=$2
   - `getLatestAttempt(quizId, studentId)` → SELECT * FROM quiz_assignment_attempts WHERE quiz_assignment_id=$1 AND student_id=$2 ORDER BY attempt_number DESC LIMIT 1
   - `listAttemptsForStudent(quizId, studentId)` → SELECT * FROM quiz_assignment_attempts WHERE quiz_assignment_id=$1 AND student_id=$2 ORDER BY attempt_number ASC

**Relevant Context:**
- Pattern (teacher-scoped listing): `classTrackv1-backend/server/src/repositories/task.repository.js`
- Pattern (ownership JOIN): `classTrackv1-backend/server/src/repositories/questionBank.repository.js`
- Pattern (student access via classroom JOIN): `classTrackv1-backend/server/src/repositories/questionBank.repository.js` `listPublishedForStudent`
- BaseRepository: `classTrackv1-backend/server/src/repositories/base.repository.js`
- LATERAL join for latest attempt: enables single-query fetch without N+1

---

### Sub-Task 5 — Backend Service (`quizAssignment.service.js`)

**Status:** [ ] pending

**Intent:**
Business logic layer enforcing ownership invariants, validating state transitions,
computing total scores via the shared `autoScore` utility, and handling the retake model
(new INSERT per attempt, preserving history). Mirrors the pattern of `questionBank.service.js`.

**Expected Outcomes:**
- `classTrackv1-backend/server/src/services/quizAssignment.service.js` exists.
- All teacher and student operations exported as named functions.
- Teacher: create, list, get, update, publish, archive, delete, addQuestion, removeQuestion, reorderQuestions, getResults.
- Student: listMyQuizzes, getMyQuiz, startQuiz, submitQuiz, getMyAttempt, listMyAttempts.
- Duplicate submission is blocked at the service layer.
- Auto-scoring uses `scoring.util.js`.
- Each submission also upserts into `quiz_attempts` (the existing per-question tracking table).

**Todo List:**
1. Create `classTrackv1-backend/server/src/services/quizAssignment.service.js`
2. Import: `quizAssignmentRepo`, `questionRepo` (for ownership + published status), `quizAttemptRepo` (for per-question tracking), `pool`, `{ autoScore }` from scoring.util, `{ ApiError }` from response.util
3. Internal helper `_requireOwnedQuiz(quizId, teacherId)` → `repo.findByIdForTeacher(quizId, teacherId)`, throw `ApiError.notFound` if null
4. Implement teacher functions:
   - `createQuiz(teacherId, { classroomId, title, instructions, timeLimitMinutes, dueDate, shuffleQuestions, allowRetake })`:
     - SELECT id FROM classrooms WHERE id=$classroomId AND teacher_id=$teacherId AND deleted_at IS NULL → throw 404 if not found
     - `repo.create(...)`, return created row
   - `listQuizzes(teacherId)` → `repo.listByTeacher(teacherId)`
   - `getQuiz(quizId, teacherId)` → `_requireOwnedQuiz`, return with questions
   - `updateQuiz(quizId, teacherId, data)`:
     - `_requireOwnedQuiz`
     - Throw `ApiError.badRequest('Cannot edit a published or archived quiz.')` if quiz.status !== 'draft'
     - `repo.updateFields(quizId, teacherId, data)`
   - `publishQuiz(quizId, teacherId)`:
     - `_requireOwnedQuiz`
     - Throw if quiz.status !== 'draft'
     - `repo.countQuestions(quizId)` → throw if count === 0
     - SELECT id FROM classrooms WHERE id=quiz.classroom_id AND is_active=TRUE AND deleted_at IS NULL → throw if missing
     - `repo.setStatus(quizId, teacherId, 'published')`
   - `archiveQuiz(quizId, teacherId)` → `_requireOwnedQuiz`, `repo.setStatus(..., 'archived')`
   - `deleteQuiz(quizId, teacherId)` → `_requireOwnedQuiz`, `repo.softDelete(quizId, teacherId)`
   - `addQuestion(quizId, teacherId, questionId, marksOverride)`:
     - `_requireOwnedQuiz`
     - Throw if quiz.status !== 'draft' (cannot add questions to published quiz)
     - `questionRepo.findByIdForTeacher(questionId, teacherId)` → throw 404 if null
     - Throw if question.status !== 'published' (only published questions may be added)
     - Throw `ApiError.conflict('Question already in this quiz.')` if duplicate
     - Compute `orderIndex`: `repo.countQuestions(quizId) + 1`
     - Validate marksOverride: if provided, must be > 0
     - `repo.addQuestion(quizId, questionId, orderIndex, marksOverride ?? null)`
   - `removeQuestion(quizId, teacherId, questionId)`:
     - `_requireOwnedQuiz`
     - Throw if quiz.status !== 'draft'
     - `repo.removeQuestion(quizId, questionId)`
   - `reorderQuestions(quizId, teacherId, orderedQuestionIds)`:
     - `_requireOwnedQuiz`
     - Throw if quiz.status !== 'draft'
     - `repo.reorderQuestions(quizId, orderedQuestionIds)`
   - `getQuizResults(quizId, teacherId)` → `_requireOwnedQuiz`, `repo.getResultsForTeacher(quizId, teacherId)`
5. Implement student functions:
   - `listMyQuizzes(studentId)` → `repo.listForStudent(studentId)`
   - `getMyQuiz(quizId, studentId)`:
     - `repo.findForStudent(quizId, studentId)` → throw `ApiError.notFound` if null
     - If `quiz.shuffle_questions` is true, shuffle `quiz.questions` array (Fisher-Yates) before return
     - Return quiz with `latest_attempt` attached
   - `startQuiz(quizId, studentId)`:
     - `repo.findForStudent(quizId, studentId)` → throw 404 if null
     - `repo.getLatestAttempt(quizId, studentId)` → get most recent attempt
     - If latest attempt exists and status='in_progress' → return existing (idempotent start)
     - If latest attempt exists and status='submitted' and NOT quiz.allow_retake → throw `ApiError.forbidden('Retakes are not allowed for this quiz.')`
     - Compute `attemptNumber = repo.getNextAttemptNumber(quizId, studentId)`
     - `repo.insertAttempt({ quizId, studentId, status: 'in_progress', score: null, maxScore: null, startedAt: new Date(), submittedAt: null, attemptNumber })`
     - Return the inserted attempt row
   - `submitQuiz(quizId, studentId, answers)` where `answers = [{questionId, studentAnswer}]`:
     - `repo.findForStudent(quizId, studentId)` → throw 404 if null
     - `repo.getLatestAttempt(quizId, studentId)` → throw 404 if null; throw `ApiError.conflict('Quiz already submitted.')` if status='submitted' (duplicate submit guard)
     - Build a Map from quizQuestion.question_id → quizQuestion (for marks_override lookup)
     - For each answer: look up question from quiz.questions; call `autoScore(q.question_type, q.correct_answer, studentAnswer, effectiveMarks)` where `effectiveMarks = marks_override ?? q.marks`; accumulate totalScore and maxScore; also call `quizAttemptRepo.upsert({ studentId, questionId, studentAnswer, isCorrect, score })`
     - `repo.insertAttempt` is NOT used here — UPDATE the existing in_progress row: `UPDATE quiz_assignment_attempts SET status='submitted', score=$score, max_score=$maxScore, submitted_at=NOW(), updated_at=NOW() WHERE id=$attemptId`  (add `updateAttempt(attemptId, data)` repo method)
     - Return `{ attemptNumber, totalScore, maxScore, answers: [{questionId, isCorrect, score, correctAnswer, explanation}] }`
   - `getMyAttempt(quizId, studentId)` → `repo.findForStudent` + `repo.getLatestAttempt`
   - `listMyAttempts(quizId, studentId)` → `repo.findForStudent` (access check) + `repo.listAttemptsForStudent`

**Important implementation notes:**
- `submitQuiz` must use a PostgreSQL transaction (`pool.connect()`) to atomically update the attempt row AND upsert all per-question `quiz_attempts` rows. If any step fails, the transaction is rolled back.
- The duplicate-submit guard (status='submitted' check) must happen BEFORE acquiring the transaction to fail fast.

**Relevant Context:**
- Auto-score source: `classTrackv1-backend/server/src/utils/scoring.util.js` (Sub-Task 3)
- Per-question upsert: `classTrackv1-backend/server/src/repositories/quizAttempt.repository.js` `upsert()`
- Transaction pattern: `pool.connect()` → client.query() → client.release() (already used in other services)
- Classroom ownership check: `SELECT id FROM classrooms WHERE id=$1 AND teacher_id=$2 AND deleted_at IS NULL`

---

### Sub-Task 6 — Backend Controller + Validator + Routes

**Status:** [ ] pending

**Intent:**
Thin HTTP layer wiring Joi validators → controller methods → service layer → standard
ApiResponse envelope. Follows same structure as `practice.routes.js` + `question.routes.js`.

**Expected Outcomes:**
- `classTrackv1-backend/server/src/validators/quizAssignment.validator.js` with all Joi schemas.
- `classTrackv1-backend/server/src/controllers/quizAssignment.controller.js` with all controller methods.
- `classTrackv1-backend/server/src/routes/quiz.routes.js` with teacher and student route groups.
- Routes mounted in `src/routes/v1/index.js`.

**Todo List:**
1. Create `classTrackv1-backend/server/src/validators/quizAssignment.validator.js`:
   - `createQuiz` (body): `{ classroomId: required int+, title: required string max(200), instructions: optional string max(2000), timeLimitMinutes: optional int min(1) max(300) allow(null), dueDate: optional date ISO allow(null), shuffleQuestions: boolean default(false), allowRetake: boolean default(false) }`
   - `updateQuiz` (body): same fields all optional
   - `quizIdParam` (params): `{ quizId: required int+ }`
   - `quizQuestionParam` (params): `{ quizId: required int+, questionId: required int+ }`
   - `addQuestion` (body): `{ questionId: required int+, marksOverride: optional number min(0.01) allow(null) }`
   - `reorderQuestions` (body): `{ questionIds: required array of int+, min(1) }`
   - `submitQuiz` (body): `{ answers: required array min(1) of { questionId: required int+, studentAnswer: required string min(1) max(5000) } }`
2. Create `classTrackv1-backend/server/src/controllers/quizAssignment.controller.js`:
   - Each method: extract from `req.params` / `req.body` / `req.user`, call service, respond `ApiResponse.success(res, data, message, statusCode)`
   - Wrap each in `try/catch` → `next(err)` (same pattern as question.controller.js)
   - Teacher methods: `createQuiz`, `listQuizzes`, `getQuiz`, `updateQuiz`, `publishQuiz`, `archiveQuiz`, `deleteQuiz`, `addQuestion`, `removeQuestion`, `reorderQuestions`, `getQuizResults`
   - Student methods: `listMyQuizzes`, `getMyQuiz`, `startQuiz`, `submitQuiz`, `getMyAttempt`, `listMyAttempts`
3. Create `classTrackv1-backend/server/src/routes/quiz.routes.js`:
   - Split into two Express Router sub-groups sharing the same file:
   - **Teacher routes** (`router.use('/teacher/quiz-assignments', ...)`): authenticate + authorizeRoles('teacher')
     - `POST   /`                          — createQuiz (QUIZ_CREATE)
     - `GET    /`                          — listQuizzes (QUIZ_MANAGE_OWN)
     - `GET    /:quizId`                   — getQuiz (QUIZ_MANAGE_OWN)
     - `PATCH  /:quizId`                   — updateQuiz (QUIZ_MANAGE_OWN)
     - `DELETE /:quizId`                   — deleteQuiz (QUIZ_MANAGE_OWN)
     - `PATCH  /:quizId/publish`           — publishQuiz (QUIZ_MANAGE_OWN)
     - `PATCH  /:quizId/archive`           — archiveQuiz (QUIZ_MANAGE_OWN)
     - `POST   /:quizId/questions`         — addQuestion (QUIZ_MANAGE_OWN)
     - `DELETE /:quizId/questions/:questionId` — removeQuestion (QUIZ_MANAGE_OWN)
     - `PUT    /:quizId/questions/order`   — reorderQuestions (QUIZ_MANAGE_OWN)
     - `GET    /:quizId/results`           — getQuizResults (QUIZ_MANAGE_OWN)
   - **Student routes** (`router.use('/student/quiz-assignments', ...)`): authenticate + authorizeRoles('student')
     - `GET    /`                          — listMyQuizzes (QUIZ_ATTEMPT)
     - `GET    /:quizId`                   — getMyQuiz (QUIZ_ATTEMPT)
     - `POST   /:quizId/start`             — startQuiz (QUIZ_ATTEMPT)
     - `POST   /:quizId/submit`            — submitQuiz (QUIZ_ATTEMPT)
     - `GET    /:quizId/attempt`           — getMyAttempt (QUIZ_ATTEMPT)
     - `GET    /:quizId/attempts`          — listMyAttempts (QUIZ_ATTEMPT)
4. Update `classTrackv1-backend/server/src/routes/v1/index.js`:
   - Add `const quizRoutes = require('../quiz.routes');`
   - Add `router.use('/', quizRoutes);` (routes already carry full `/teacher/quiz-assignments` and `/student/quiz-assignments` prefixes)

**Relevant Context:**
- Pattern: `classTrackv1-backend/server/src/routes/practice.routes.js`
- Pattern: `classTrackv1-backend/server/src/controllers/question.controller.js`
- ApiResponse: `classTrackv1-backend/server/src/utils/response.util.js`
- validate middleware: `classTrackv1-backend/server/src/middleware/validate.middleware.js`

---

### Sub-Task 7 — Frontend TypeScript Types + API Client + React Query Hooks

**Status:** [ ] pending

**Intent:**
Add the TypeScript type definitions, Axios API client functions, and React Query hooks
for the quiz assignment domain. Follows the exact same structure as
`src/features/questions/api/questionApi.ts` and `src/features/questions/hooks/useQuestions.ts`.

**Expected Outcomes:**
- `src/types/quizAssignment.ts` with all TS types.
- `src/features/quizAssignments/api/quizAssignmentApi.ts` with all API calls.
- `src/features/quizAssignments/hooks/useQuizAssignments.ts` with all React Query hooks.

**Todo List:**
1. Create `classTrackv1-frontend/src/types/quizAssignment.ts`:
   ```typescript
   export type QuizStatus = 'draft' | 'published' | 'archived';
   export type AttemptStatus = 'in_progress' | 'submitted';

   export interface QuizAssignment {
     id: number; teacher_id: number; classroom_id: number; classroom_name?: string;
     title: string; instructions: string | null; time_limit_minutes: number | null;
     due_date: string | null; status: QuizStatus; allow_retake: boolean;
     shuffle_questions: boolean; question_count: number; attempt_count: number;
     created_at: string; updated_at: string;
   }

   export interface QuizAssignmentQuestion {
     id: number; quiz_assignment_id: number; question_id: number;
     order_index: number; marks_override: number | null;
     // Joined from question_bank:
     question_type: QuestionType; difficulty: QuestionDifficulty;
     marks: number; question_text: string; options: QuestionOptions;
     correct_answer: string; explanation: string | null;
   }

   export interface QuizAssignmentDetail extends QuizAssignment {
     questions: QuizAssignmentQuestion[];
   }

   export interface QuizAssignmentAttempt {
     id: number; quiz_assignment_id: number; student_id: number;
     attempt_number: number; status: AttemptStatus;
     score: number | null; max_score: number | null;
     started_at: string; submitted_at: string | null;
   }

   export interface StudentQuizView extends QuizAssignmentDetail {
     latest_attempt: QuizAssignmentAttempt | null;
   }

   export interface QuizSubmitAnswer { questionId: number; studentAnswer: string; }

   export interface QuizAnswerResult {
     questionId: number; isCorrect: boolean | null; score: number | null;
     correctAnswer: string; explanation: string | null;
   }

   export interface QuizSubmitResult {
     attemptNumber: number; totalScore: number; maxScore: number;
     answers: QuizAnswerResult[];
   }

   export interface TeacherQuizResultRow {
     student_id: number; student_name: string; username: string;
     attempt_number: number; status: AttemptStatus;
     score: number | null; max_score: number | null;
     submitted_at: string | null; total_attempts: number;
   }
   ```
2. Create `classTrackv1-frontend/src/features/quizAssignments/api/quizAssignmentApi.ts`:
   - Same `_unwrap` helper pattern as `questionApi.ts`
   - Teacher base: `/teacher/quiz-assignments`
   - Student base: `/student/quiz-assignments`
   - Teacher methods: `create(payload)`, `list()`, `get(quizId)`, `update(quizId, payload)`, `publish(quizId)`, `archive(quizId)`, `remove(quizId)`, `addQuestion(quizId, payload)`, `removeQuestion(quizId, questionId)`, `reorderQuestions(quizId, questionIds)`, `getResults(quizId)`
   - Student methods: `listMine()`, `getMine(quizId)`, `start(quizId)`, `submit(quizId, answers)`, `getAttempt(quizId)`, `listAttempts(quizId)`
3. Create `classTrackv1-frontend/src/features/quizAssignments/hooks/useQuizAssignments.ts`:
   - Cache key namespace: `['quiz-assignments', ...]`
   - Teacher query hooks: `useTeacherQuizzes()`, `useTeacherQuizDetail(quizId)`, `useQuizResults(quizId)`
   - Teacher mutation hooks: `useCreateQuiz()`, `useUpdateQuiz()`, `usePublishQuiz()`, `useArchiveQuiz()`, `useDeleteQuiz()`, `useAddQuestion()`, `useRemoveQuestion()`, `useReorderQuestions()`
   - Student query hooks: `useStudentQuizzes()`, `useStudentQuizDetail(quizId)`, `useMyAttempt(quizId)`, `useMyAttempts(quizId)`
   - Student mutation hooks: `useStartQuiz()`, `useSubmitQuiz()`
   - Mutations invalidate: list + detail + results caches on success; show snackbar on error
   - `useSubmitQuiz`: on success invalidate attempt cache; **do NOT auto-navigate** — let the page handle navigation after receiving the result

**Relevant Context:**
- Pattern: `classTrackv1-frontend/src/features/questions/api/questionApi.ts`
- Pattern: `classTrackv1-frontend/src/features/questions/hooks/useQuestions.ts`
- Type imports needed: `QuestionType`, `QuestionDifficulty`, `QuestionOptions` from `@/types/question`

---

### Sub-Task 8 — Frontend: CurriculumNavigator Shared Component

**Status:** [ ] pending

**Intent:**
Build a reusable `CurriculumNavigator` component that renders four cascading MUI Select
dropdowns (Curriculum → Subject → Chapter → Topic). It consumes **existing** hooks from
`useKnowledge.ts` — no new API calls or backend changes needed. When a topic is selected,
it calls an `onTopicSelect(topicId, topicName)` callback. Used in both the Teacher Question
Bank "Generate" panel and the Quiz Assignment builder's question picker.

**Expected Outcomes:**
- `classTrackv1-frontend/src/components/curriculum/CurriculumNavigator.tsx` exists.
- Renders 4 cascading dropdowns: Curriculum, Subject, Chapter, Topic.
- Each downstream dropdown resets when its parent selection changes.
- Downstream dropdowns are disabled until their parent is selected.
- Loading states shown in each dropdown while fetching.
- `onTopicSelect` callback fires with `{ topicId: number, topicName: string }` when a topic is chosen.
- Optional `label` prop to customize the selector heading.
- Optional `disabled` prop to lock all fields (e.g. while generating questions).

**Todo List:**
1. Create `classTrackv1-frontend/src/components/curriculum/CurriculumNavigator.tsx`:
   ```typescript
   interface CurriculumNavigatorProps {
     onTopicSelect: (selection: { topicId: number; topicName: string } | null) => void;
     label?: string;
     disabled?: boolean;
   }
   ```
2. Internal state: `selectedCurriculumId`, `selectedSubjectId`, `selectedChapterId`, `selectedTopicId`
3. Use hooks (already exist in `useKnowledge.ts`):
   - `useCurricula()` — always fetched
   - `useSubjects(selectedCurriculumId)` — enabled when curriculum selected
   - `useChapters(selectedSubjectId)` — enabled when subject selected
   - `useTopics(selectedChapterId)` — enabled when chapter selected
4. Cascade reset logic: when Curriculum changes → reset subject/chapter/topic; when Subject changes → reset chapter/topic; when Chapter changes → reset topic
5. Render:
   - `FormControl + Select` for Curriculum: options from `curricula.data?.curricula`
   - `FormControl + Select` for Subject: disabled if no curriculum; options from `subjects.data?.subjects`
   - `FormControl + Select` for Chapter: disabled if no subject; options from `chapters.data?.chapters`
   - `FormControl + Select` for Topic: disabled if no chapter; options from `topics.data?.topics`
   - Each shows `MenuItem` with `value={item.id}` and `label={item.name}`
   - Loading state: `CircularProgress` inside InputAdornment when fetching
6. On topic selection: call `onTopicSelect({ topicId: selectedTopicId, topicName: topicName })` or `onTopicSelect(null)` if cleared

**Relevant Context:**
- Existing hooks (ALL already exist, no new ones needed):
  - `useCurricula` in `classTrackv1-frontend/src/features/knowledge/hooks/useKnowledge.ts`
  - `useSubjects(curriculumId)` — same file
  - `useChapters(subjectId)` — same file
  - `useTopics(chapterId)` — same file
- These hooks call the existing `/knowledge/curricula`, `/knowledge/curricula/:id/subjects`, `/knowledge/subjects/:id/chapters`, `/knowledge/chapters/:id/topics` endpoints
- Backend: these endpoints already exist in `classTrackv1-backend/server/src/routes/knowledge.routes.js`

---

### Sub-Task 9 — Frontend: Update Teacher Question Bank Page (Generate Questions Panel)

**Status:** [ ] pending

**Intent:**
Replace the manual `topicId` text field on the teacher Question Bank page with the new
`CurriculumNavigator` component. The generate questions form should use cascading dropdowns
so teachers never need to type a numeric ID. The rest of the page (approval queue, publish
actions) is unchanged.

**Expected Outcomes:**
- Teacher Question Bank page has a "Generate Questions" section with `CurriculumNavigator`.
- "Generate Questions" button is only enabled after Topic + QuestionType + Difficulty + Count are all set.
- The `topicId` is resolved from the `CurriculumNavigator` callback, not from a text field.
- All existing approval/reject/publish/archive actions remain unchanged.

**Todo List:**
1. Open `classTrackv1-frontend/src/pages/teacher/QuestionBankPage.tsx`
2. Add a new collapsible or always-visible "Generate Questions" section at the top (above the pending queue):
   - `CurriculumNavigator` component → `onTopicSelect` sets local `selectedTopicId` state
   - Question Type: MUI Select with all 8 types from `QuestionType` union
   - Difficulty: MUI Select (Easy / Medium / Hard)
   - Number of Questions: MUI TextField type="number" (1–15)
   - Generate button: calls `useGenerateQuestions()` mutation with `{ topicId: selectedTopicId, questionType, difficulty, count }` — disabled while any field is missing OR while mutation is pending
3. Import `CurriculumNavigator` from `@components/curriculum/CurriculumNavigator`
4. Import `useGenerateQuestions` hook (already exported from `useQuestions.ts`)
5. Do NOT remove any existing content — the pending approval table, approve/reject/publish actions all remain as-is

**Relevant Context:**
- Current generate UI: does NOT exist on teacher Question Bank page (was student-only via Practice page)
- File to modify: `classTrackv1-frontend/src/pages/teacher/QuestionBankPage.tsx`
- Hook to use: `useGenerateQuestions()` from `classTrackv1-frontend/src/features/questions/hooks/useQuestions.ts`

---

### Sub-Task 10 — Teacher Frontend: Quiz Assignments List + Create Page

**Status:** [ ] pending

**Intent:**
Teacher-facing page to view all quiz assignments and create new ones. Follows the same
layout and MUI component patterns as `TasksPage.tsx`. Includes a create dialog with
classroom picker, title, due date, instructions, time limit, and boolean flags.

**Expected Outcomes:**
- `src/pages/teacher/QuizAssignmentsPage.tsx` — list page with create dialog.
- Teacher sees all quiz assignments with status chips (Draft / Published / Archived).
- Teacher can open "New Quiz" dialog, fill fields, save as draft.
- Clicking a row navigates to the detail/builder page.

**Todo List:**
1. Create `classTrackv1-frontend/src/pages/teacher/QuizAssignmentsPage.tsx`:
   - Use `useTeacherQuizzes()` hook for the list
   - MUI `Table` layout: title, classroom name, status chip, question count, attempt count, due date, created at, row actions (View, Archive, Delete)
   - Status chips: Draft (grey/default), Published (green/success), Archived (orange/warning)
   - "New Quiz" button → opens `CreateQuizDialog`
   - Row click → navigate to `ROUTES.TEACHER.QUIZ_ASSIGNMENT_DETAIL(row.id)`
2. `CreateQuizDialog` component (inline or in `src/features/quizAssignments/components/`):
   - Classroom: MUI Select populated from `useClassrooms({ limit: 100 })` — shows `${name} ${section}` in options
   - Title: TextField required, max 200
   - Instructions: TextField multiline optional, max 2000
   - Due Date: date input optional
   - Time Limit (minutes): number input optional
   - Allow Retake: Checkbox
   - Shuffle Questions: Checkbox
   - "Create Quiz" → calls `useCreateQuiz()` → on success navigate to detail page

**Relevant Context:**
- Pattern: `classTrackv1-frontend/src/pages/teacher/TasksPage.tsx`
- Classroom list hook: `useClassrooms` from `classTrackv1-frontend/src/features/teacher/hooks/useClassrooms.ts`
- Nav will be updated in Sub-Task 13

---

### Sub-Task 11 — Teacher Frontend: Quiz Assignment Detail / Builder Page

**Status:** [ ] pending

**Intent:**
Teacher-facing detail page that acts as the quiz builder. Shows quiz metadata, a question
picker using `CurriculumNavigator` (no manual ID entry), current question list with
ordering and marks override controls, and publish/archive actions. Shows results table
once published.

**Expected Outcomes:**
- `src/pages/teacher/QuizAssignmentDetailPage.tsx` fully implemented.
- Teacher browses published questions via CurriculumNavigator → topic selection.
- Questions shown as a picker list with "Add" button and marks override field.
- Quiz question list shows ordered questions with Remove, up/down reorder, and marks override input.
- "Publish Quiz" disabled until ≥ 1 question and status = 'draft'.
- "Results" tab visible once published/archived — table of students with attempt history.

**Todo List:**
1. Create `classTrackv1-frontend/src/pages/teacher/QuizAssignmentDetailPage.tsx`:
   - Fetch quiz detail: `useTeacherQuizDetail(quizId)` from `useParams()`
   - **Tab 1 — Builder** (always visible):
     - Quiz info header: title, classroom name, status chip, due date, time limit
     - "Edit Details" button → opens `EditQuizDialog` (same fields as create, pre-filled) — only when status='draft'
     - **Question Picker panel** (only when status='draft'):
       - `CurriculumNavigator` → `onTopicSelect` sets `pickerTopicId` local state
       - When `pickerTopicId` is set: call `questionApi.listByTopic(pickerTopicId, 'published')` — already implemented
       - Render each returned question as a compact card with: question text preview, type chip, difficulty chip, default marks, "Add to Quiz" button (disabled if already in quiz)
       - "Add to Quiz" → opens small `MarksOverrideDialog` (optional, skip if user clicks without changing) → calls `useAddQuestion({ quizId, questionId, marksOverride })`
     - **Quiz question list** (always shown in builder tab):
       - Ordered list by order_index: question preview, effective marks (marks_override ?? marks), Remove button, ↑↓ order buttons
       - Order buttons call `useReorderQuestions` with new order array
       - Remove button calls `useRemoveQuestion`
       - Inline marks override field (input next to each question, calls `useUpdateQuestion` or separate update endpoint — NOTE: since there's no `updateQuestion` endpoint, marks_override can be set when adding. For V1, marks override is set at add-time only. The UI should show an editable inline field that calls `removeQuestion` + `addQuestion` when changed — or simpler: show the current marks_override and an "Edit" icon that re-opens the MarksOverrideDialog and replaces the question)
     - Action buttons: "Publish Quiz" (disabled if 0 questions or not draft), "Archive", "Delete" (with confirmation dialogs)
   - **Tab 2 — Results** (only shown when status='published' or 'archived'):
     - `useQuizResults(quizId)` → table: student name, username, best score, total attempts, latest submitted date
     - Summary row: completion count, average score

**Relevant Context:**
- `CurriculumNavigator`: built in Sub-Task 8
- `questionApi.listByTopic(topicId, 'published')` already exists in `questionApi.ts`
- Hooks: `useTeacherQuizDetail`, `useAddQuestion`, `useRemoveQuestion`, `useReorderQuestions`, `usePublishQuiz`, `useArchiveQuiz`, `useDeleteQuiz`, `useQuizResults`

---

### Sub-Task 12 — Student Frontend: My Quizzes List + Quiz Taking Page

**Status:** [ ] pending

**Intent:**
Student-facing pages for browsing assigned quizzes, starting a quiz, answering all
questions, and submitting one final time. After submission, the results are shown
immediately (auto-scored). Retake flow shows previous attempt history. Completely
separate from Practice page.

**Expected Outcomes:**
- `src/pages/student/QuizAssignmentsPage.tsx` — list of assigned quizzes.
- `src/pages/student/TakeQuizPage.tsx` — guided quiz flow with production-safe submission.
- Students see status correctly: Not Started / In Progress / Submitted.
- Correct answers NOT shown before submission.
- Submission button disabled while processing; confirmation dialog before submit.
- Attempting an already-submitted quiz (when allow_retake=false) shows "no retake" message.
- Results view shows score banner + per-question result cards.
- Attempt history shown if multiple attempts exist.

**Todo List:**
1. Create `classTrackv1-frontend/src/pages/student/QuizAssignmentsPage.tsx`:
   - `useStudentQuizzes()` hook
   - MUI Card grid or table: title, classroom name, due date, question count, attempt status chip, score (if submitted), "Open Quiz" button
   - Status chips: Not Started (grey), In Progress (blue/info), Submitted (green/success)
   - If `allow_retake=true` and status='submitted', show "Retake Available" chip
2. Create `classTrackv1-frontend/src/pages/student/TakeQuizPage.tsx`:
   - `quizId` from `useParams()`
   - Fetch: `useStudentQuizDetail(quizId)`
   - **State A — Not Started (or no attempt):**
     - Quiz intro card: title, instructions, question count, time limit (if set), due date, allow_retake status
     - "Start Quiz" button → calls `useStartQuiz(quizId)` → on success switches to State B
   - **State B — In Progress:**
     - Local state: `answers: Record<number, string>` mapping questionId → studentAnswer
     - Renders all questions on one scrollable page (not paginated — allows review before submit)
     - For each question: show question text, type, difficulty chip, marks chip; render input based on type:
       - MCQ: radio buttons (options from question)
       - True/False: radio buttons
       - All others: textarea
     - ⚠️ Correct answers are NEVER shown during this phase. `QuizQuestionCard` should be used WITHOUT `priorResult` or `sessionResult` prop.
     - Progress indicator: "X / N answered" shown at top
     - "Submit Quiz" button (pinned at bottom or end of page):
       - Disabled while `useSubmitQuiz.isPending` is true
       - Disabled if zero answers collected
       - Shows MUI `ConfirmationDialog` before submitting: "Are you sure? This action cannot be undone."
       - On confirm: call `useSubmitQuiz(quizId, { answers })` with all collected answers
       - While pending: show spinner, button text = "Submitting..."
   - **State C — Submitted:**
     - Score banner: "X / Y marks (Z%)" with color (green ≥70%, orange ≥50%, red <50%)
     - Per-question result cards: reuse `QuizQuestionCard` with `priorResult` prop populated from submit response
     - `priorResult` shape: `{ questionId, isCorrect, score, correctAnswer, explanation }` — maps to `SubmitAttemptResponse`-compatible shape
     - "Back to My Quizzes" button
     - If `allow_retake=true` and user wants to retake: "Retake Quiz" button → calls `useStartQuiz` again → resets to State B
     - If multiple attempts: "Previous Attempts" collapsible section showing attempt_number, score/max_score, submitted_at from `useMyAttempts(quizId)`
3. Key safety constraints:
   - Never render correct_answer in the DOM before submission (State B)
   - `QuizQuestionCard` used in State C with `priorResult` only (after submit response received)
   - `useSubmitQuiz` mutation result stored in local state for result display (not re-fetched)

**Relevant Context:**
- `QuizQuestionCard`: `classTrackv1-frontend/src/components/quiz/QuizQuestionCard.tsx` — supports both input and result modes
- `useStartQuiz`, `useSubmitQuiz` mutations from `useQuizAssignments.ts`
- `SubmitAttemptResponse` type in `classTrackv1-frontend/src/types/quizAttempt.ts` — compatible shape

---

### Sub-Task 13 — Route Config + Nav Config Updates

**Status:** [ ] pending

**Intent:**
Wire the new pages into the React Router configuration and navigation sidebar so both
teachers and students can access the new quiz assignment feature. Also update `constants.ts`.

**Expected Outcomes:**
- All new routes protected with correct role guards.
- Teacher nav has "Quiz Assignments" item after Question Bank.
- Student nav has "My Quizzes" item after Assignments (tasks).
- `ROUTES` constants updated.

**Todo List:**
1. Update `classTrackv1-frontend/src/utils/constants.ts`:
   - In `ROUTES.TEACHER`: add `QUIZ_ASSIGNMENTS: '/teacher/quiz-assignments'`
   - In `ROUTES.TEACHER`: add `QUIZ_ASSIGNMENT_DETAIL: (id: number | string) => \`/teacher/quiz-assignments/\${id}\``
   - In `ROUTES.STUDENT`: add `QUIZ_ASSIGNMENTS: '/student/quiz-assignments'`
   - In `ROUTES.STUDENT`: add `TAKE_QUIZ: (id: number | string) => \`/student/quiz-assignments/\${id}\``
2. Update `classTrackv1-frontend/src/routes/AppRoutes.tsx`:
   - Inside the teacher `<RequireAuth role="teacher">` wrapper, add:
     - `<Route path="/teacher/quiz-assignments" element={<QuizAssignmentsPage />} />`
     - `<Route path="/teacher/quiz-assignments/:quizId" element={<QuizAssignmentDetailPage />} />`
   - Inside the student `<RequireAuth role="student">` wrapper, add:
     - `<Route path="/student/quiz-assignments" element={<StudentQuizAssignmentsPage />} />`
     - `<Route path="/student/quiz-assignments/:quizId" element={<TakeQuizPage />} />`
3. Update `classTrackv1-frontend/src/layouts/navConfig.tsx`:
   - Teacher nav: add `{ label: 'Quiz Assignments', icon: QuizIcon, to: ROUTES.TEACHER.QUIZ_ASSIGNMENTS }` after the Question Bank item
   - Student nav: add `{ label: 'My Quizzes', icon: AssignmentTurnedInIcon, to: ROUTES.STUDENT.QUIZ_ASSIGNMENTS }` after the Assignments item

**Relevant Context:**
- Pattern: `classTrackv1-frontend/src/routes/AppRoutes.tsx`
- Pattern: `classTrackv1-frontend/src/layouts/navConfig.tsx`
- ROUTES: `classTrackv1-frontend/src/utils/constants.ts`

---

## Cross-Cutting Notes

### Scoring Utility Extraction (Sub-Task 3)
Extracting `autoScore` to `src/utils/scoring.util.js` avoids duplicating the 12-line
function across services. No logic change. The list of auto-scored types is:
`['mcq', 'true_false', 'one_word', 'fill_blank']`. All others return `{ isCorrect: null, score: null }`.

### Retake Model
Each call to `submitQuiz` is preceded by a `startQuiz` call (which inserts an in_progress
row with the next `attempt_number`). `submitQuiz` then updates that row's status to
'submitted'. If the student hits submit twice (network retry), the second call fails with
`status='submitted'` guard → `ApiError.conflict`. The client must handle this gracefully.

### Marks Resolution
`effectiveMarks = marks_override ?? question_bank.marks`. The `quiz_assignment_questions`
table carries `marks_override NUMERIC(5,2) NULL`. When NULL, the question's own `marks`
column is used. The `maxScore` calculation loops over all questions and sums
`marks_override ?? marks`. `totalScore` sums only the non-null auto-scored points.

### CurriculumNavigator Reuse Points
This component is used in TWO places:
1. Teacher Question Bank page → Generate Questions panel (Sub-Task 9)
2. Teacher Quiz Assignment Detail page → Question Picker panel (Sub-Task 11)

It must be a pure presentational/controlled component driven by `onTopicSelect` callback.
It must not carry any quiz-specific logic.

### Per-Question Attempt Cross-Tracking
When a student submits a quiz, every answered question is ALSO upserted into the existing
`quiz_attempts` table via `quizAttemptRepo.upsert`. This means:
- Teacher's existing "Quiz Results by Topic" view (`/questions/topics/:topicId/results`) continues to show these attempts.
- Student's existing "My Quiz Results" page continues to show attempts from quizzes.
- The two systems stay observable from both lenses.

### Draft-Lock Invariant
Quiz metadata (title, instructions, dates, flags) and question list are only editable
when `status = 'draft'`. The service throws `ApiError.badRequest` if edit/add/remove is
attempted on a published or archived quiz. Frontend disables all builder controls
(CurriculumNavigator question picker, order buttons, remove buttons) when `status !== 'draft'`.

---

## Implementation Order

```
1 (V11+V12 DB) → 2 (permissions constants) → 3 (scoring util) → 4 (repository)
→ 5 (service) → 6 (routes/controller/validator) → 7 (FE types/api/hooks)
→ 8 (CurriculumNavigator component) → 9 (teacher QuestionBank page update)
→ 10 (teacher QuizAssignments list+create) → 11 (teacher detail/builder)
→ 12 (student quiz pages) → 13 (routing+nav)
```
