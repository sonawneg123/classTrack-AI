/**
 * server/src/controllers/student.controller.js
 */
const studentService = require('../services/student.service');
const pdfService     = require('../services/report/pdf.service');
const { ApiResponse, asyncHandler } = require('../utils/response.util');
const { pool } = require('../database/connection');

const getMyTasks = asyncHandler(async (req, res) => {
  const data = await studentService.getMyTasks(req.user.id, req.user.classroomId);
  new ApiResponse(200, 'Tasks retrieved.', { tasks: data }).send(res);
});

const submitTask = asyncHandler(async (req, res) => {
  const data = await studentService.submitTask({
    taskId:      req.params.taskId,
    studentId:   req.user.id,
    classroomId: req.user.classroomId,
    file:        req.file,
    typedText:   req.body.typedText,
  });
  new ApiResponse(201, 'Submission received! AI is reviewing it now.', data).send(res);
});

const getMySubmissions = asyncHandler(async (req, res) => {
  const data = await studentService.getMySubmissions(req.user.id);
  new ApiResponse(200, 'Submissions retrieved.', { submissions: data }).send(res);
});

const getMySubmissionHistory = asyncHandler(async (req, res) => {
  const data = await studentService.getMySubmissionHistory(req.params.submissionId, req.user.id);
  new ApiResponse(200, 'History retrieved.', { versions: data }).send(res);
});

const downloadMyReport = asyncHandler(async (req, res) => {
  const [studentRows]   = await pool.query('SELECT * FROM students WHERE id = ?', [req.user.id]);
  const [classroomRows] = await pool.query('SELECT * FROM classrooms WHERE id = ?', [req.user.classroomId]);
  const [tasks]         = await pool.query('SELECT * FROM tasks WHERE classroom_id = ? ORDER BY task_date', [req.user.classroomId]);
  const [submissions]   = await pool.query('SELECT * FROM submissions WHERE student_id = ?', [req.user.id]);

  const byTask = {};
  submissions.forEach((s) => (byTask[s.task_id] = s));
  const rows = tasks.map((task) => ({ task, submission: byTask[task.id] || null }));

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${studentRows[0].name.replace(/\s+/g,'_')}_progress_report.pdf"`);
  pdfService.buildStudentReport({ student: studentRows[0], classroom: classroomRows[0], rows }).pipe(res);
});

module.exports = { getMyTasks, submitTask, getMySubmissions, getMySubmissionHistory, downloadMyReport };
