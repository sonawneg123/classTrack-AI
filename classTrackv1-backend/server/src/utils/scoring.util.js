/**
 * server/src/utils/scoring.util.js
 *
 * Teacher override wins over the AI score everywhere — PDF reports,
 * CSV exports, student views, API responses.
 */
function effectiveScore(submission) {
  if (!submission) return null;
  const ts = submission.teacher_score;
  if (ts !== null && ts !== undefined) return Number(ts);
  const as = submission.ai_score;
  if (as !== null && as !== undefined) return Number(as);
  return null;
}

function isOverridden(submission) {
  return !!submission &&
    submission.teacher_score !== null &&
    submission.teacher_score !== undefined;
}

module.exports = { effectiveScore, isOverridden };
