const PDFDocument = require('pdfkit');
const { effectiveScore, isOverridden } = require('../../utils/scoring.util');

const MAROON = '#990302';
const CREAM = '#EBE2E0';
const INK = '#2B1A1A';
const GREEN = '#2F7D5A';
const AMBER = '#C97A1F';
const RED = '#B23A2E';

function scoreColor(score, maxScore) {
  const pct = maxScore ? (score / maxScore) * 100 : 0;
  if (pct >= 75) return GREEN;
  if (pct >= 50) return AMBER;
  return RED;
}

function drawHeader(doc, title, subtitle) {
  doc.rect(0, 0, doc.page.width, 90).fill(MAROON);
  doc
    .fillColor(CREAM)
    .font('Helvetica-Bold')
    .fontSize(20)
    .text(title, 40, 28, { width: doc.page.width - 80 });
  if (subtitle) {
    doc
      .fillColor(CREAM)
      .font('Helvetica')
      .fontSize(11)
      .text(subtitle, 40, 56, { width: doc.page.width - 80 });
  }
  doc.fillColor(INK);
  doc.y = 110;
}

function drawFooter(doc) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc
      .fontSize(8)
      .fillColor('#8a7a78')
      .text(
        `ClassTrack AI — generated ${new Date().toLocaleString()}`,
        40,
        doc.page.height - 40,
        { width: doc.page.width - 80, align: 'center' }
      );
  }
}

function sectionTitle(doc, text) {
  doc.moveDown(0.5);
  doc.font('Helvetica-Bold').fontSize(13).fillColor(MAROON).text(text);
  doc
    .moveTo(40, doc.y + 2)
    .lineTo(doc.page.width - 40, doc.y + 2)
    .strokeColor(CREAM)
    .lineWidth(1.5)
    .stroke();
  doc.moveDown(0.5);
  doc.fillColor(INK);
}

function scoreChip(doc, x, y, score, maxScore) {
  const label = `${Number(score).toFixed(0)}/${maxScore}`;
  const color = scoreColor(score, maxScore);
  const w = 52;
  doc.roundedRect(x, y, w, 18, 4).fill(color);
  doc
    .fillColor('#ffffff')
    .font('Helvetica-Bold')
    .fontSize(9)
    .text(label, x, y + 4, { width: w, align: 'center' });
  doc.fillColor(INK).font('Helvetica');
}

function bulletList(doc, items, color) {
  items.forEach((item) => {
    doc
      .fillColor(color)
      .font('Helvetica-Bold')
      .text('• ', { continued: true })
      .fillColor(INK)
      .font('Helvetica')
      .text(item);
  });
}

/**
 * Teacher-facing report: every student's performance across every task
 * in a classroom, so progress can be scanned at a glance.
 *
 * data = {
 *   classroom: { name, subject, class_code },
 *   teacher: { name },
 *   tasks: [{ id, title, max_score, due_date }],
 *   studentRows: [{ student: {id,name}, submissions: { [taskId]: submission|null } }]
 * }
 */
function buildClassroomReport(data) {
  const doc = new PDFDocument({ margin: 40, bufferPages: true, size: 'A4' });
  const { classroom, teacher, tasks, studentRows } = data;

  drawHeader(
    doc,
    `Classroom Progress Report`,
    `${classroom.name}${classroom.subject ? ' • ' + classroom.subject : ''} • Code: ${classroom.class_code} • Teacher: ${teacher?.name || '—'}`
  );

  const totalStudents = studentRows.length;
  const totalTasks = tasks.length;
  const allScores = [];
  studentRows.forEach((r) =>
    tasks.forEach((t) => {
      const s = r.submissions[t.id];
      if (s) {
        const score = effectiveScore(s);
        if (score !== null) allScores.push(score);
      }
    })
  );
  const avg = allScores.length ? (allScores.reduce((a, b) => a + b, 0) / allScores.length).toFixed(1) : 'N/A';

  sectionTitle(doc, 'Overview');
  doc.font('Helvetica').fontSize(11);
  doc.text(`Students enrolled: ${totalStudents}`);
  doc.text(`Tasks posted: ${totalTasks}`);
  doc.text(`Average AI score across all graded submissions: ${avg}`);

  sectionTitle(doc, 'Student Summary');
  tasks.forEach((task) => {
    doc.moveDown(0.3);
    doc.font('Helvetica-Bold').fontSize(12).fillColor(MAROON).text(`${task.title}`);
    doc.font('Helvetica').fontSize(9).fillColor('#6b5a58').text(`Max score: ${task.max_score}${task.due_date ? ' • Due: ' + task.due_date : ''}`);
    doc.moveDown(0.3);

    studentRows.forEach((row) => {
      const sub = row.submissions[task.id];
      const y = doc.y;
      doc.fillColor(INK).font('Helvetica').fontSize(10).text(row.student.name, 50, y, { width: 180 });

      if (!sub) {
        doc.fillColor('#a08c89').fontSize(9).text('Not submitted', 240, y + 1);
      } else if (sub.status !== 'analyzed') {
        doc.fillColor(AMBER).fontSize(9).text('Pending AI analysis', 240, y + 1);
      } else {
        scoreChip(doc, 240, y - 2, effectiveScore(sub), task.max_score);
        if (isOverridden(sub)) {
          doc.fillColor(MAROON).font('Helvetica-Bold').fontSize(7).text('teacher-graded', 300, y - 9);
        }
        doc
          .fillColor('#6b5a58')
          .fontSize(8)
          .text(sub.ai_summary ? sub.ai_summary.slice(0, 110) : '', 300, y + 1, { width: doc.page.width - 340 });
      }
      doc.moveDown(0.6);

      if (doc.y > doc.page.height - 80) doc.addPage();
    });
  });

  doc.addPage();
  drawHeader(doc, 'Detailed Feedback by Student', `${classroom.name} • Code: ${classroom.class_code}`);

  studentRows.forEach((row, idx) => {
    if (idx > 0) doc.moveDown(0.8);
    sectionTitle(doc, row.student.name);

    let hasSubmission = false;
    tasks.forEach((task) => {
      const sub = row.submissions[task.id];
      if (!sub || sub.status !== 'analyzed') return;
      hasSubmission = true;

      doc.font('Helvetica-Bold').fontSize(10.5).fillColor(INK).text(task.title, { continued: true });
      doc.font('Helvetica').fillColor('#6b5a58').text(`   (${effectiveScore(sub).toFixed(0)}/${task.max_score}${isOverridden(sub) ? ' • teacher-graded' : ''})`);
      if (sub.ai_summary) doc.font('Helvetica').fontSize(9.5).fillColor(INK).text(sub.ai_summary);
      if (sub.teacher_feedback) {
        doc.font('Helvetica-Oblique').fontSize(9).fillColor(MAROON).text(`Teacher's note: ${sub.teacher_feedback}`);
      }

      if (sub.ai_strengths) {
        doc.moveDown(0.15);
        doc.font('Helvetica-Bold').fontSize(9).fillColor(GREEN).text('Strengths');
        bulletList(doc, JSON.parse(sub.ai_strengths || '[]'), GREEN);
      }
      if (sub.ai_improvements) {
        doc.moveDown(0.15);
        doc.font('Helvetica-Bold').fontSize(9).fillColor(RED).text('Needs improvement');
        bulletList(doc, JSON.parse(sub.ai_improvements || '[]'), RED);
      }
      doc.moveDown(0.5);

      if (doc.y > doc.page.height - 100) doc.addPage();
    });

    if (!hasSubmission) {
      doc.font('Helvetica-Oblique').fontSize(9.5).fillColor('#a08c89').text('No analyzed submissions yet.');
    }
  });

  drawFooter(doc);
  doc.end();
  return doc;
}

/**
 * Student-facing personal report: a clear, encouraging breakdown of
 * where they're doing well and what to work on, across all their tasks.
 *
 * data = {
 *   student: { name },
 *   classroom: { name, subject },
 *   rows: [{ task: {title, max_score, due_date}, submission: {...} | null }]
 * }
 */
function buildStudentReport(data) {
  const doc = new PDFDocument({ margin: 40, bufferPages: true, size: 'A4' });
  const { student, classroom, rows } = data;

  drawHeader(doc, `My Progress Report`, `${student.name} • ${classroom.name}${classroom.subject ? ' • ' + classroom.subject : ''}`);

  const graded = rows.filter((r) => r.submission && r.submission.status === 'analyzed');
  const gradedScores = graded.map((r) => effectiveScore(r.submission)).filter((s) => s !== null);
  const avg = gradedScores.length ? (gradedScores.reduce((a, b) => a + b, 0) / gradedScores.length).toFixed(1) : 'N/A';

  sectionTitle(doc, 'Overview');
  doc.font('Helvetica').fontSize(11);
  doc.text(`Tasks assigned: ${rows.length}`);
  doc.text(`Tasks graded by AI: ${graded.length}`);
  doc.text(`Average score: ${avg}`);

  const allImprovements = graded.flatMap((r) => {
    try {
      return JSON.parse(r.submission.ai_improvements || '[]');
    } catch {
      return [];
    }
  });
  if (allImprovements.length) {
    sectionTitle(doc, 'Where to focus next');
    bulletList(doc, allImprovements.slice(0, 8), RED);
  }

  sectionTitle(doc, 'Task-by-Task Feedback');

  rows.forEach((row) => {
    const { task, submission } = row;
    if (doc.y > doc.page.height - 140) doc.addPage();

    doc.moveDown(0.4);
    const y = doc.y;
    doc.font('Helvetica-Bold').fontSize(11).fillColor(MAROON).text(task.title, 40, y, { width: 350 });

    if (!submission) {
      doc.font('Helvetica-Oblique').fontSize(9.5).fillColor('#a08c89').text('Not submitted yet.');
      return;
    }
    if (submission.status !== 'analyzed') {
      doc.font('Helvetica-Oblique').fontSize(9.5).fillColor(AMBER).text('Submitted — AI feedback in progress.');
      return;
    }

    scoreChip(doc, 460, y - 2, effectiveScore(submission), task.max_score);
    if (isOverridden(submission)) {
      doc.fillColor(MAROON).font('Helvetica-Bold').fontSize(7).text('teacher-graded', 460, y + 16);
    }
    doc.moveDown(0.4);

    if (submission.ai_summary) {
      doc.font('Helvetica').fontSize(9.5).fillColor(INK).text(submission.ai_summary);
    }
    if (submission.teacher_feedback) {
      doc.font('Helvetica-Oblique').fontSize(9).fillColor(MAROON).text(`From your teacher: ${submission.teacher_feedback}`);
    }
    if (submission.ai_strengths) {
      doc.moveDown(0.15);
      doc.font('Helvetica-Bold').fontSize(9).fillColor(GREEN).text('What you did well');
      bulletList(doc, JSON.parse(submission.ai_strengths || '[]'), GREEN);
    }
    if (submission.ai_improvements) {
      doc.moveDown(0.15);
      doc.font('Helvetica-Bold').fontSize(9).fillColor(RED).text('How to improve');
      bulletList(doc, JSON.parse(submission.ai_improvements || '[]'), RED);
    }
  });

  drawFooter(doc);
  doc.end();
  return doc;
}

module.exports = { buildClassroomReport, buildStudentReport };
