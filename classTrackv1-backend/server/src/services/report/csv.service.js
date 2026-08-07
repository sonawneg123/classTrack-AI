/** Escapes a value for safe inclusion in a CSV cell. */
function csvCell(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCsvRow(values) {
  return values.map(csvCell).join(',') + '\r\n';
}

/**
 * Builds a CSV of every student's score on every task in a classroom.
 * tasks: [{ id, title, max_score }]
 * studentRows: [{ student: {name, username}, submissions: { [taskId]: submission } }]
 */
function buildClassroomGradesCsv({ classroom, tasks, studentRows }) {
  let csv = toCsvRow(['Classroom', classroom.name, 'Code', classroom.class_code]);
  csv += toCsvRow(['Student', 'Username', ...tasks.map((t) => `${t.title} (/${t.max_score})`), 'Average %']);

  studentRows.forEach(({ student, submissions }) => {
    const scores = [];
    const cells = tasks.map((t) => {
      const sub = submissions[t.id];
      if (!sub) return 'Not submitted';
      const effectiveScore = sub.teacher_score !== null && sub.teacher_score !== undefined ? sub.teacher_score : sub.ai_score;
      if (effectiveScore === null || effectiveScore === undefined) return sub.status;
      scores.push((Number(effectiveScore) / t.max_score) * 100);
      return effectiveScore;
    });
    const avg = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : '';
    csv += toCsvRow([student.name, student.username, ...cells, avg]);
  });

  return csv;
}

module.exports = { buildClassroomGradesCsv };
