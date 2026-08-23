/**
 * server/src/routes/teacher.routes.js
 */
const { Router } = require('express');
const controller  = require('../controllers/teacher.controller');
const teacherValidator = require('../validators/teacher.validator');
const { authenticate, authorizeRoles, authorizePermissions } = require('../middleware/auth.middleware');
const { PERMISSIONS } = require('../constants/permissions.constants');
const { upload, validateFileSignature } = require('../middleware/upload.middleware');
const validate = require('../middleware/validate.middleware');

const router = Router();
router.use(authenticate, authorizeRoles('teacher'));

/**
 * @openapi
 * /v1/teacher/dashboard:
 *   get:
 *     tags: [Teacher]
 *     summary: Teacher dashboard stats
 *     description: Total classrooms, total students, active assignments, pending evaluations, and recent activity — one aggregated round trip, no N+1.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Dashboard stats }
 *       401: { description: Missing or invalid access token }
 */
router.get('/dashboard', controller.getDashboardStats);

/**
 * @openapi
 * /v1/teacher/classrooms/manage:
 *   get:
 *     tags: [Teacher]
 *     summary: List my classrooms (paginated, searchable, sortable, filterable)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20, maximum: 100 }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [active, archived, all], default: active }
 *       - in: query
 *         name: sortBy
 *         schema: { type: string, enum: [name, createdAt, studentCount, taskCount], default: createdAt }
 *       - in: query
 *         name: sortDir
 *         schema: { type: string, enum: [asc, desc], default: desc }
 *     responses:
 *       200: { description: Paginated classroom list }
 *   post:
 *     tags: [Teacher]
 *     summary: Create a classroom
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:    { type: string, minLength: 2, maxLength: 150 }
 *               subject: { type: string, maxLength: 100 }
 *               section: { type: string, maxLength: 50 }
 *     responses:
 *       201: { description: Classroom created }
 *       409: { description: Duplicate classroom (same name + section already exists for this teacher) }
 */
router.get('/classrooms/manage', validate(teacherValidator.listClassrooms), controller.listClassroomsManaged);
router.post('/classrooms/manage', authorizePermissions(PERMISSIONS.CLASSROOM_MANAGE_OWN), validate(teacherValidator.createClassroom), controller.createClassroom);

/**
 * @openapi
 * /v1/teacher/classrooms/manage/{classroomId}:
 *   get:
 *     tags: [Teacher]
 *     summary: Get classroom details
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: classroomId, required: true, schema: { type: integer } }]
 *     responses: { 200: { description: Classroom details }, 404: { description: Not found or not yours } }
 *   patch:
 *     tags: [Teacher]
 *     summary: Update a classroom
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: classroomId, required: true, schema: { type: integer } }]
 *     responses: { 200: { description: Updated }, 409: { description: Duplicate name+section } }
 *   delete:
 *     tags: [Teacher]
 *     summary: Delete a classroom (soft delete only — not reversible via restore)
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: classroomId, required: true, schema: { type: integer } }]
 *     responses: { 200: { description: Deleted } }
 */
router.get('/classrooms/manage/:classroomId', validate(teacherValidator.classroomIdParam), controller.getClassroomDetails);
router.patch('/classrooms/manage/:classroomId', authorizePermissions(PERMISSIONS.CLASSROOM_MANAGE_OWN), validate(teacherValidator.updateClassroom), controller.updateClassroom);
router.delete('/classrooms/manage/:classroomId', authorizePermissions(PERMISSIONS.CLASSROOM_MANAGE_OWN), validate(teacherValidator.classroomIdParam), controller.deleteClassroom);

/**
 * @openapi
 * /v1/teacher/classrooms/manage/{classroomId}/archive:
 *   patch:
 *     tags: [Teacher]
 *     summary: Archive a classroom
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: classroomId, required: true, schema: { type: integer } }]
 *     responses: { 200: { description: Archived }, 400: { description: Already archived } }
 */
router.patch('/classrooms/manage/:classroomId/archive', authorizePermissions(PERMISSIONS.CLASSROOM_MANAGE_OWN), validate(teacherValidator.classroomIdParam), controller.archiveClassroom);

/**
 * @openapi
 * /v1/teacher/classrooms/manage/{classroomId}/restore:
 *   patch:
 *     tags: [Teacher]
 *     summary: Restore an archived classroom
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: classroomId, required: true, schema: { type: integer } }]
 *     responses: { 200: { description: Restored }, 400: { description: Not archived } }
 */
router.patch('/classrooms/manage/:classroomId/restore', authorizePermissions(PERMISSIONS.CLASSROOM_MANAGE_OWN), validate(teacherValidator.classroomIdParam), controller.restoreClassroom);

/**
 * @openapi
 * /v1/teacher/classrooms/manage/{classroomId}/regenerate-code:
 *   patch:
 *     tags: [Teacher]
 *     summary: Regenerate a classroom's join code
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: classroomId, required: true, schema: { type: integer } }]
 *     responses: { 200: { description: New join code issued } }
 */
router.patch('/classrooms/manage/:classroomId/regenerate-code', authorizePermissions(PERMISSIONS.CLASSROOM_MANAGE_OWN), validate(teacherValidator.classroomIdParam), controller.regenerateJoinCode);

/**
 * @openapi
 * /v1/teacher/classrooms/manage/{classroomId}/grading-overview:
 *   get:
 *     tags: [Teacher]
 *     summary: Classroom grading overview
 *     description: >
 *       Returns a grading overview for one classroom: classroom-level summary
 *       (student count, task count, total/evaluated/pending submissions, average
 *       score), per-task aggregation rows, and per-student aggregation rows.
 *       Score precedence: teacher_score wins over ai_score (COALESCE).
 *       Only the owning teacher can access this; deleted classrooms return 404.
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: classroomId, required: true, schema: { type: integer } }]
 *     responses:
 *       200: { description: Grading overview data }
 *       401: { description: Not authenticated }
 *       403: { description: Not a teacher }
 *       404: { description: Classroom not found or not owned }
 */
router.get('/classrooms/manage/:classroomId/grading-overview', validate(teacherValidator.classroomIdParam), controller.getGradingOverview);

// Classrooms
router.get('/classrooms',                             controller.getMyClassrooms);
router.get('/classrooms/:classroomId/tasks',          controller.getClassroomTasks);
router.post('/classrooms/:classroomId/tasks',         validate(teacherValidator.createTask),   controller.createTask);
router.get('/classrooms/:classroomId/report',         controller.downloadClassroomReport);
router.get('/classrooms/:classroomId/export-csv',     controller.downloadClassroomCsv);

// Tasks (flat resource)
/**
 * @openapi
 * /v1/teacher/tasks:
 *   get:
 *     tags: [Teacher]
 *     summary: List my tasks across all classrooms (paginated, searchable, sortable, filterable)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20, maximum: 100 }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [published, unpublished, archived, all], default: all }
 *       - in: query
 *         name: classroomId
 *         schema: { type: integer }
 *       - in: query
 *         name: sortBy
 *         schema: { type: string, enum: [title, createdAt, dueDate, submissionCount], default: createdAt }
 *       - in: query
 *         name: sortDir
 *         schema: { type: string, enum: [asc, desc], default: desc }
 *     responses:
 *       200: { description: Paginated task list }
 *   post:
 *     tags: [Teacher]
 *     summary: Create a task (classroom chosen in the body)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, classroomId]
 *             properties:
 *               classroomId:  { type: integer }
 *               title:        { type: string, minLength: 2, maxLength: 200 }
 *               description:  { type: string, maxLength: 2000 }
 *               instructions: { type: string, maxLength: 2000 }
 *               maxScore:     { type: integer, minimum: 1, maximum: 10000, default: 100 }
 *               dueDate:      { type: string, format: date }
 *               taskDate:     { type: string, format: date }
 *               aiEvaluationEnabled: { type: boolean, default: true }
 *               allowedFileTypes:    { type: array, items: { type: string, enum: [pdf, jpg, jpeg, png, webp, txt] } }
 *     responses:
 *       201: { description: Task created, students notified }
 *       409: { description: Duplicate task title in this classroom }
 */
router.get('/tasks',  validate(teacherValidator.listTasksManaged), controller.listTasksManaged);
router.post('/tasks', authorizePermissions(PERMISSIONS.TASK_CREATE), validate(teacherValidator.createTaskManaged), controller.createTaskManaged);

/**
 * @openapi
 * /v1/teacher/tasks/{taskId}:
 *   get:
 *     tags: [Teacher]
 *     summary: Get task details
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: taskId, required: true, schema: { type: integer } }]
 *     responses: { 200: { description: Task details }, 404: { description: Not found, not yours, or deleted } }
 *   patch:
 *     tags: [Teacher]
 *     summary: Edit a task
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: taskId, required: true, schema: { type: integer } }]
 *     responses: { 200: { description: Updated }, 409: { description: Duplicate title }, 400: { description: Due date in the past } }
 *   delete:
 *     tags: [Teacher]
 *     summary: Delete a task (soft delete only — not reversible)
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: taskId, required: true, schema: { type: integer } }]
 *     responses: { 200: { description: Deleted } }
 */
router.get('/tasks/:taskId',    validate(teacherValidator.taskIdParam), controller.getTaskDetails);
router.patch('/tasks/:taskId',                        validate(teacherValidator.updateTask),    controller.updateTask);
router.delete('/tasks/:taskId', authorizePermissions(PERMISSIONS.TASK_MANAGE_OWN), validate(teacherValidator.taskIdParam), controller.deleteTask);
router.patch('/tasks/:taskId/toggle-active',          controller.toggleTaskActive);

/**
 * @openapi
 * /v1/teacher/tasks/{taskId}/publish:
 *   patch:
 *     tags: [Teacher]
 *     summary: Publish a task (make it visible to students)
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: taskId, required: true, schema: { type: integer } }]
 *     responses: { 200: { description: Published }, 400: { description: Classroom is archived } }
 * /v1/teacher/tasks/{taskId}/unpublish:
 *   patch:
 *     tags: [Teacher]
 *     summary: Unpublish a task (hide it from students; existing submissions are untouched)
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: taskId, required: true, schema: { type: integer } }]
 *     responses: { 200: { description: Unpublished } }
 */
router.patch('/tasks/:taskId/publish',   authorizePermissions(PERMISSIONS.TASK_MANAGE_OWN), validate(teacherValidator.taskIdParam), controller.publishTask);
router.patch('/tasks/:taskId/unpublish', authorizePermissions(PERMISSIONS.TASK_MANAGE_OWN), validate(teacherValidator.taskIdParam), controller.unpublishTask);

/**
 * @openapi
 * /v1/teacher/tasks/{taskId}/archive:
 *   patch:
 *     tags: [Teacher]
 *     summary: Archive a task (independent of publish state — hidden from students and the default list; not deleted)
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: taskId, required: true, schema: { type: integer } }]
 *     responses: { 200: { description: Archived }, 400: { description: Already archived } }
 * /v1/teacher/tasks/{taskId}/restore:
 *   patch:
 *     tags: [Teacher]
 *     summary: Restore an archived task
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: taskId, required: true, schema: { type: integer } }]
 *     responses: { 200: { description: Restored }, 400: { description: Not archived } }
 * /v1/teacher/tasks/{taskId}/duplicate:
 *   post:
 *     tags: [Teacher]
 *     summary: Duplicate a task as a new draft in the same classroom (due date not carried over)
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: taskId, required: true, schema: { type: integer } }]
 *     responses: { 201: { description: Duplicated }, 409: { description: A "(Copy)" already exists } }
 */
router.patch('/tasks/:taskId/archive',   authorizePermissions(PERMISSIONS.TASK_MANAGE_OWN), validate(teacherValidator.taskIdParam), controller.archiveTask);
router.patch('/tasks/:taskId/restore',   authorizePermissions(PERMISSIONS.TASK_MANAGE_OWN), validate(teacherValidator.taskIdParam), controller.restoreTask);
router.post('/tasks/:taskId/duplicate',  authorizePermissions(PERMISSIONS.TASK_CREATE),      validate(teacherValidator.taskIdParam), controller.duplicateTask);

router.get('/tasks/:taskId/submissions',              controller.getTaskSubmissions);

// Submissions
router.get('/submissions/:submissionId/history',      controller.getSubmissionHistory);
router.post('/submissions/:submissionId/reanalyze',   controller.reanalyzeSubmission);
router.patch('/submissions/:submissionId/override-score', validate(teacherValidator.overrideScore), controller.overrideScore);

// Students
router.post('/students/:studentId/reset-password',    controller.resetStudentPassword);

module.exports = router;
