-- 003_classroom_management.sql
--
-- Additive only. Adds soft-delete support to `classrooms`. Archiving does
-- NOT need a new column — it reuses the existing `is_active` flag (already
-- present and already selected by admin.repository.js's listWithTeacher):
--   archived  == is_active = 0
--   active    == is_active = 1
-- Deleting is a distinct, separate state from archiving (a deleted
-- classroom should never reappear even via "restore"), so it gets its own
-- column rather than overloading is_active for two meanings.

ALTER TABLE classrooms
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL DEFAULT NULL AFTER is_active;

-- Every new classroom-management query filters on (teacher_id, deleted_at)
-- and often is_active too — index the combination actually queried.
CREATE INDEX IF NOT EXISTS idx_classrooms_teacher_deleted
  ON classrooms (teacher_id, deleted_at);

CREATE INDEX IF NOT EXISTS idx_classrooms_teacher_active_deleted
  ON classrooms (teacher_id, is_active, deleted_at);
