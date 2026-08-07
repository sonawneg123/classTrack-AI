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

const createClassroom = {
  body: Joi.object({
    name:      Joi.string().min(2).max(150).required(),
    subject:   Joi.string().max(100).allow('', null).optional(),
    section:   Joi.string().max(50).allow('', null).optional(),
    teacherId: Joi.number().integer().positive().required(),
  }),
};

module.exports = { createTeacher, createClassroom };
