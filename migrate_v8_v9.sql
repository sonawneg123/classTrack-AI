-- Apply V8 quiz_attempts if not already applied
CREATE TABLE IF NOT EXISTS quiz_attempts (
  id                  INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  student_id          INTEGER      NOT NULL,
  question_id         INTEGER      NOT NULL,
  student_answer      TEXT         NOT NULL,
  is_correct          BOOLEAN      NULL DEFAULT NULL,
  score               NUMERIC(5,2) NULL DEFAULT NULL,
  attempt_count       INTEGER      NOT NULL DEFAULT 1,
  first_attempted_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  last_attempted_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_quiz_attempts_student_question UNIQUE (student_id, question_id),
  CONSTRAINT fk_quiz_attempts_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_quiz_attempts_question FOREIGN KEY (question_id) REFERENCES question_bank(id) ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_student_id    ON quiz_attempts (student_id);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_question_id   ON quiz_attempts (question_id);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_student_question ON quiz_attempts (student_id, question_id);

INSERT INTO permissions (code, description) VALUES
  ('question:attempt', 'Submit an answer attempt for a published question'),
  ('question:view_results', 'View student quiz attempt results for owned questions')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role, permission_code) VALUES
  ('student', 'question:attempt'),
  ('teacher', 'question:view_results')
ON CONFLICT (role, permission_code) DO NOTHING;
