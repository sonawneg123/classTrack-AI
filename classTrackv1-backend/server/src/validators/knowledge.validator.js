/**
 * server/src/validators/knowledge.validator.js
 */
const Joi = require('joi');

const curriculumIdParam = {
  params: Joi.object({ curriculumId: Joi.number().integer().positive().required() }),
};

const subjectIdParam = {
  params: Joi.object({ subjectId: Joi.number().integer().positive().required() }),
};

const chapterIdParam = {
  params: Joi.object({ chapterId: Joi.number().integer().positive().required() }),
};

const topicIdParam = {
  params: Joi.object({ topicId: Joi.number().integer().positive().required() }),
};

const documentIdParam = {
  params: Joi.object({ documentId: Joi.number().integer().positive().required() }),
};

const createCurriculum = {
  body: Joi.object({
    name:        Joi.string().min(2).max(200).required(),
    description: Joi.string().max(1000).allow('', null).optional(),
  }),
};

const createSubject = {
  params: Joi.object({ curriculumId: Joi.number().integer().positive().required() }),
  body: Joi.object({
    name:        Joi.string().min(2).max(200).required(),
    description: Joi.string().max(1000).allow('', null).optional(),
  }),
};

const createChapter = {
  params: Joi.object({ subjectId: Joi.number().integer().positive().required() }),
  body: Joi.object({
    name:        Joi.string().min(2).max(200).required(),
    description: Joi.string().max(1000).allow('', null).optional(),
    orderIndex:  Joi.number().integer().min(0).optional(),
  }),
};

const createTopic = {
  params: Joi.object({ chapterId: Joi.number().integer().positive().required() }),
  body: Joi.object({
    name:        Joi.string().min(2).max(200).required(),
    description: Joi.string().max(1000).allow('', null).optional(),
    orderIndex:  Joi.number().integer().min(0).optional(),
  }),
};

const uploadDocument = {
  params: Joi.object({ topicId: Joi.number().integer().positive().required() }),
  body: Joi.object({
    title: Joi.string().min(2).max(300).optional(),
  }),
};

const searchKnowledge = {
  body: Joi.object({
    query:       Joi.string().min(1).max(1000).required(),
    topK:        Joi.number().integer().min(1).max(50).optional(),
    curriculumId: Joi.number().integer().positive().optional(),
    subjectId:   Joi.number().integer().positive().optional(),
    chapterId:   Joi.number().integer().positive().optional(),
    topicId:     Joi.number().integer().positive().optional(),
  }),
};

module.exports = {
  curriculumIdParam, subjectIdParam, chapterIdParam, topicIdParam, documentIdParam,
  createCurriculum, createSubject, createChapter, createTopic,
  uploadDocument, searchKnowledge,
};
