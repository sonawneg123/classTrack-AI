/**
 * server/src/utils/dateOnly.util.js
 *
 * THE date architecture for this project, defined once:
 *
 *   Every "date" field in this system (task due_date, task_date, and any
 *   future date-only field) is a calendar date with NO time-of-day
 *   component — a deadline is "end of Aug 5", not "Aug 5 at 14:32:07".
 *   Every such column is MySQL DATE (not DATETIME/TIMESTAMP), the pool
 *   is configured with dateStrings: true (server/src/database/
 *   connection.js) so reads come back as plain 'YYYY-MM-DD' strings, and
 *   every validator that accepts a date-only field must use
 *   `dateOnlySchema` from this file — never Joi's built-in `.isoDate()`,
 *   which permits full datetimes and would let one slip through to a
 *   DATE column.
 *
 * This is intentionally the ONLY place this pattern is defined. Do not
 * duplicate the regex or re-implement date validation elsewhere — import
 * from here.
 */
const Joi = require('joi');

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** A strict YYYY-MM-DD Joi schema. Rejects (400s) anything with a time
 *  component instead of silently truncating it — a datetime being sent
 *  for a date-only field is a client bug that should surface, not be
 *  quietly masked. */
const dateOnlySchema = Joi.string()
  .pattern(DATE_ONLY_PATTERN)
  .message('Must be a date in YYYY-MM-DD format (no time component).');

module.exports = { DATE_ONLY_PATTERN, dateOnlySchema };
