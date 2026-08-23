/**
 * server/src/controllers/teacher.controller.js
 */
const teacherService = require('../services/teacher.service');
const pdfService     = require('../services/report/pdf.service');
const csvService     = require('../services/report/csv.service');
const aiQueueService = require('../services/ai/queue.service');
const submissionRepo = require('../repositories/submission.repository');
const { analyzeText, analyzeImage } = require('../services/ai/groq.service');
const { toBase64DataUrl } = require('../services/ai/extractor.service');
const { ApiResponse, asyncHandler } = require('../utils/response.util');
const { pool } = require('../database/connection');

const getMyClassrooms    = asyncHandler(async (req, res) => {
  const data = await teacherService.getMyClassrooms(req.user.id);
  new ApiResponse(200, 'Classrooms retrieved.', { classrooms: data }).send(res);
});

const createTask         = asyncHandler(async (req, res) => {
  const taskId = await teacherService.createTask({ ...req.body, classroomId: req.params.classroomId, teacherId: req.user.id });
  new ApiResponse(201, 'Task posted. Students have been notified.', { taskId }).send(res);
});

/** Flat POST /teacher/tasks — classroomId comes from the body instead of
 *  the URL. Calls the exact same service function as createTask above —
 *  no business logic is duplicated, only the input source differs. */
const createTaskManaged  = asyncHandler(async (req, res) => {
  const taskId = await teacherService.createTask({ ...req.body, teacherId: req.user.id });
  new ApiResponse(201, 'Task posted. Students have been notified.', { taskId }).send(res);
});

const updateTask         = asyncHandler(async (req, res) => {
  await teacherService.updateTask({ ...req.body, taskId: req.params.taskId, teacherId: req.user.id });
  new ApiResponse(200, 'Task updated.').send(res);
});

const toggleTaskActive   = asyncHandler(async (req, res) => {
  await teacherService.toggleTaskActive(req.params.taskId, req.user.id);
  new ApiResponse(200, 'Task visibility updated.').send(res);
});

const listTasksManaged   = asyncHandler(async (req, res) => {
  const data = await teacherService.listTasksManaged(req.user.id, req.query);
  new ApiResponse(200, 'Tasks retrieved.', data).send(res);
});

const getTaskDetails     = asyncHandler(async (req, res) => {
  const data = await teacherService.getTaskDetails(req.params.taskId, req.user.id);
  new ApiResponse(200, 'Task retrieved.', data).send(res);
});

const deleteTask         = asyncHandler(async (req, res) => {
  await teacherService.deleteTask(req.params.taskId, req.user.id);
  new ApiResponse(200, 'Task deleted.').send(res);
});

const publishTask        = asyncHandler(async (req, res) => {
  await teacherService.publishTask(req.params.taskId, req.user.id);
  new ApiResponse(200, 'Task published.').send(res);
});

const unpublishTask      = asyncHandler(async (req, res) => {
  await teacherService.unpublishTask(req.params.taskId, req.user.id);
  new ApiResponse(200, 'Task unpublished.').send(res);
});

const archiveTask        = asyncHandler(async (req, res) => {
  await teacherService.archiveTask(req.params.taskId, req.user.id);
  new ApiResponse(200, 'Task archived.').send(res);
});

const restoreTask        = asyncHandler(async (req, res) => {
  await teacherService.restoreTask(req.params.taskId, req.user.id);
  new ApiResponse(200, 'Task restored.').send(res);
});

const duplicateTask      = asyncHandler(async (req, res) => {
  const taskId = await teacherService.duplicateTask(req.params.taskId, req.user.id);
  new ApiResponse(201, 'Task duplicated as a draft.', { taskId }).send(res);
});

const getClassroomTasks  = asyncHandler(async (req, res) => {
  const data = await teacherService.getClassroomTasks(req.params.classroomId, req.user.id);
  new ApiResponse(200, 'Tasks retrieved.', { tasks: data }).send(res);
});

const getTaskSubmissions = asyncHandler(async (req, res) => {
  const data = await teacherService.getTaskSubmissions(req.params.taskId, req.user.id);
  new ApiResponse(200, 'Submissions retrieved.', data).send(res);
});

const getSubmissionHistory = asyncHandler(async (req, res) => {
  const data = await teacherService.getSubmissionHistory(req.params.submissionId, req.user.id);
  new ApiResponse(200, 'History retrieved.', { versions: data }).send(res);
});

const overrideScore = asyncHandler(async (req, res) => {
  await teacherService.overrideScore({
    submissionId:    req.params.submissionId,
    teacherId:       req.user.id,
    teacherScore:    req.body.teacherScore,
    teacherFeedback: req.body.teacherFeedback,
  });
  new ApiResponse(200, 'Score updated. Student has been notified.').send(res);
});

const reanalyzeSubmission = asyncHandler(async (req, res) => {
  const sub = await submissionRepo.belongsToTeacherClassroom(req.params.submissionId, req.user.id);
  if (!sub) return new ApiResponse(404, 'Submission not found.').send(res);

  await submissionRepo.markAnalyzing(sub.id);
  new ApiResponse(200, 'Re-analysis started.').send(res);

  // Run outside the response so the teacher doesn't wait on Groq
  aiQueueService.enqueue(async () => {
    const [taskRows] = await pool.query('SELECT * FROM tasks WHERE id = ?', [sub.task_id]);
    const task = taskRows[0];
    let result;
    if (sub.file_type === 'image') {
      result = await analyzeImage({ title: task.title, description: task.description, maxScore: task.max_score, base64DataUrl: toBase64DataUrl(sub.file_path, 'image/jpeg') });
    } else {
      result = await analyzeText({ title: task.title, description: task.description, maxScore: task.max_score, studentText: sub.typed_text || sub.extracted_text || '' });
    }
    await submissionRepo.markAnalyzed(sub.id, result, result.transcribedText);
  }, `reanalyze-${sub.id}`, async () => {
    await submissionRepo.markFailed(sub.id);
  });
});

const resetStudentPassword = asyncHandler(async (req, res) => {
  const data = await teacherService.resetStudentPassword(req.params.studentId, req.user.id);
  new ApiResponse(200, data.message, { tempPassword: data.tempPassword }).send(res);
});

const downloadClassroomReport = asyncHandler(async (req, res) => {
  const [teacherRows] = await pool.query('SELECT name FROM teachers WHERE id = ?', [req.user.id]);
  const data = await teacherService.buildClassroomReportData(req.params.classroomId, req.user.id);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${data.classroom.name.replace(/\s+/g,'_')}_report.pdf"`);
  pdfService.buildClassroomReport({ ...data, teacher: teacherRows[0] }).pipe(res);
});

const downloadClassroomCsv = asyncHandler(async (req, res) => {
  const data = await teacherService.buildClassroomReportData(req.params.classroomId, req.user.id);
  const csv  = csvService.buildClassroomGradesCsv(data);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${data.classroom.name.replace(/\s+/g,'_')}_grades.csv"`);
  res.send(csv);
});

const getDashboardStats  = asyncHandler(async (req, res) => {
  const data = await teacherService.getDashboardStats(req.user.id);
  new ApiResponse(200, 'Dashboard stats retrieved.', data).send(res);
});

const listClassroomsManaged = asyncHandler(async (req, res) => {
  const data = await teacherService.listClassroomsManaged(req.user.id, req.query);
  new ApiResponse(200, 'Classrooms retrieved.', data).send(res);
});

const getClassroomDetails = asyncHandler(async (req, res) => {
  const data = await teacherService.getClassroomDetails(req.params.classroomId, req.user.id);
  new ApiResponse(200, 'Classroom retrieved.', data).send(res);
});

const createClassroom = asyncHandler(async (req, res) => {
  const data = await teacherService.createClassroom({ ...req.body, teacherId: req.user.id });
  new ApiResponse(201, 'Classroom created.', data).send(res);
});

const updateClassroom = asyncHandler(async (req, res) => {
  await teacherService.updateClassroom({ ...req.body, classroomId: req.params.classroomId, teacherId: req.user.id });
  new ApiResponse(200, 'Classroom updated.').send(res);
});

const archiveClassroom = asyncHandler(async (req, res) => {
  await teacherService.archiveClassroom(req.params.classroomId, req.user.id);
  new ApiResponse(200, 'Classroom archived.').send(res);
});

const restoreClassroom = asyncHandler(async (req, res) => {
  await teacherService.restoreClassroom(req.params.classroomId, req.user.id);
  new ApiResponse(200, 'Classroom restored.').send(res);
});

const deleteClassroom = asyncHandler(async (req, res) => {
  await teacherService.deleteClassroom(req.params.classroomId, req.user.id);
  new ApiResponse(200, 'Classroom deleted.').send(res);
});

const regenerateJoinCode = asyncHandler(async (req, res) => {
  const data = await teacherService.regenerateJoinCode(req.params.classroomId, req.user.id);
  new ApiResponse(200, 'Join code regenerated.', data).send(res);
});

const getGradingOverview = asyncHandler(async (req, res) => {
  const data = await teacherService.getGradingOverview(req.params.classroomId, req.user.id);
  new ApiResponse(200, 'Grading overview retrieved.', data).send(res);
});

module.exports = {
  getMyClassrooms, createTask, updateTask, toggleTaskActive, getClassroomTasks,
  getTaskSubmissions, getSubmissionHistory, overrideScore, reanalyzeSubmission,
  resetStudentPassword, downloadClassroomReport, downloadClassroomCsv,
  getDashboardStats, listClassroomsManaged, getClassroomDetails,
  createClassroom, updateClassroom, archiveClassroom, restoreClassroom,
  deleteClassroom, regenerateJoinCode,
  createTaskManaged, listTasksManaged, getTaskDetails, deleteTask, publishTask, unpublishTask,
  archiveTask, restoreTask, duplicateTask,
  getGradingOverview,
};
