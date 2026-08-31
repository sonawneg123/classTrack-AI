/**
 * server/src/validators/admin.validator.js
 */
const Joi = require('joi');

const createTeacher = {
  body: Joi.object({
    name:     Joi.string().min(2).max(100).required(),
    email:    Joi.string().email().required(),
    password: Joi.string().min(6).max(128).required(),
  }),
};

const updateTeacher = {
  body: Joi.object({
    name:   Joi.string().min(2).max(100).optional(),
    email:  Joi.string().email().max(150).optional(),
    mobile: Joi.string().pattern(/^\+?[\d\s\-]{7,15}$/).optional().allow('', null),
  }),
  params: Joi.object({ id: Joi.number().integer().positive().required() }),
};

const setTeacherStatus = {
  body: Joi.object({
    isActive: Joi.boolean().required().label('isActive'),
  }),
  params: Joi.object({ id: Joi.number().integer().positive().required() }),
};

const assignClassroom = {
  body: Joi.object({
    classroomId: Joi.number().integer().positive().required().label('Classroom ID'),
  }),
  params: Joi.object({ id: Joi.number().integer().positive().required() }),
};

const createClassroom = {
  body: Joi.object({
    name:      Joi.string().min(2).max(150).required(),
    subject:   Joi.string().max(100).allow('', null).optional(),
    section:   Joi.string().max(50).allow('', null).optional(),
    teacherId: Joi.number().integer().positive().required(),
  }),
};

const createRegistrationCode = {
  body: Joi.object({
    expiresInHours: Joi.number().integer().min(1).max(720).default(24).optional()
                       .label('Expiry (hours)'),
  }),
};

module.exports = { createTeacher, updateTeacher, setTeacherStatus, assignClassroom, createClassroom, createRegistrationCode };
