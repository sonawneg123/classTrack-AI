/**
 * server/src/validators/teacher.validator.js
 */
const Joi = require('joi');
const { dateOnlySchema } = require('../utils/dateOnly.util');

const ALLOWED_FILE_TYPE_VALUES = ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'txt'];

const createTask = {
  body: Joi.object({
    title:        Joi.string().min(2).max(200).required(),
    description:  Joi.string().max(2000).allow('', null).optional(),
    instructions: Joi.string().max(2000).allow('', null).optional(),
    maxScore:     Joi.number().integer().min(1).max(10000).default(100),
    dueDate:      dateOnlySchema.allow('', null).optional(),
    taskDate:     dateOnlySchema.allow('', null).optional(),
    aiEvaluationEnabled: Joi.boolean().optional(),
    allowedFileTypes:    Joi.array().items(Joi.string().valid(...ALLOWED_FILE_TYPE_VALUES)).max(10).optional(),
    lateSubmissionAllowed: Joi.boolean().optional(),
    // Per-task override of the platform default (config.upload.maxSizeMb).
    // NOTE: upload.middleware.js does not yet read this value — see the
    // "remaining known issues" note in the final report.
    maxFileSizeMb: Joi.number().integer().min(1).max(100).optional(),
  }),
};

/** Same as createTask, but for the flat POST /teacher/tasks route, where
 *  the classroom is chosen in the body instead of coming from the URL. */
const createTaskManaged = {
  body: createTask.body.keys({
    classroomId: Joi.number().integer().positive().required(),
  }),
};

const updateTask = {
  body: Joi.object({
    title:        Joi.string().min(2).max(200).optional(),
    description:  Joi.string().max(2000).allow('', null).optional(),
    instructions: Joi.string().max(2000).allow('', null).optional(),
    maxScore:     Joi.number().integer().min(1).max(10000).optional(),
    dueDate:      dateOnlySchema.allow('', null).optional(),
    taskDate:     dateOnlySchema.allow('', null).optional(),
    aiEvaluationEnabled: Joi.boolean().optional(),
    allowedFileTypes:    Joi.array().items(Joi.string().valid(...ALLOWED_FILE_TYPE_VALUES)).max(10).optional(),
    lateSubmissionAllowed: Joi.boolean().optional(),
    maxFileSizeMb: Joi.number().integer().min(1).max(100).optional(),
  }),
  params: Joi.object({ taskId: Joi.number().integer().positive().required() }),
};

const taskIdParam = {
  params: Joi.object({ taskId: Joi.number().integer().positive().required() }),
};

const listTasksManaged = {
  query: Joi.object({
    page:        Joi.number().integer().min(1).default(1),
    limit:       Joi.number().integer().min(1).max(100).default(20),
    search:      Joi.string().max(200).allow('', null).optional(),
    status:      Joi.string().valid('published', 'unpublished', 'archived', 'all').default('all'),
    classroomId: Joi.number().integer().positive().optional(),
    sortBy:      Joi.string().valid('title', 'createdAt', 'dueDate', 'submissionCount').default('createdAt'),
    sortDir:     Joi.string().valid('asc', 'desc').default('desc'),
  }),
};

const overrideScore = {
  body: Joi.object({
    teacherScore:    Joi.number().min(0).max(10000).allow(null).optional(),
    teacherFeedback: Joi.string().max(1000).allow('', null).optional(),
  }),
  params: Joi.object({ submissionId: Joi.number().integer().positive().required() }),
};

const createClassroom = {
  body: Joi.object({
    name:    Joi.string().min(2).max(150).required().label('Classroom name'),
    subject: Joi.string().max(100).allow('', null).optional(),
    section: Joi.string().max(50).allow('', null).optional(),
  }),
};

const updateClassroom = {
  body: Joi.object({
    name:    Joi.string().min(2).max(150).optional(),
    subject: Joi.string().max(100).allow('', null).optional(),
    section: Joi.string().max(50).allow('', null).optional(),
  }),
  params: Joi.object({ classroomId: Joi.number().integer().positive().required() }),
};

const listClassrooms = {
  query: Joi.object({
    page:     Joi.number().integer().min(1).default(1),
    limit:    Joi.number().integer().min(1).max(100).default(20),
    search:   Joi.string().max(150).allow('', null).optional(),
    status:   Joi.string().valid('active', 'archived', 'all').default('active'),
    sortBy:   Joi.string().valid('name', 'createdAt', 'studentCount', 'taskCount').default('createdAt'),
    sortDir:  Joi.string().valid('asc', 'desc').default('desc'),
  }),
};

const classroomIdParam = {
  params: Joi.object({ classroomId: Joi.number().integer().positive().required() }),
};

module.exports = {
  createTask, updateTask, overrideScore,
  createClassroom, updateClassroom, listClassrooms, classroomIdParam,
  createTaskManaged, taskIdParam, listTasksManaged,
};
