/**
 * server/src/routes/auth.routes.js
 */
const { Router } = require('express');
const controller = require('../controllers/auth.controller');
const validator  = require('../validators/auth.validator');
const validate   = require('../middleware/validate.middleware');
const { loginLimiter, registerLimiter } = require('../middleware/rateLimiter.middleware');

const router = Router();

router.post('/admin/login',    loginLimiter,    validate(validator.adminLogin),    controller.adminLogin);
router.post('/teacher/login',  loginLimiter,    validate(validator.teacherLogin),  controller.teacherLogin);
router.post('/student/register', registerLimiter, validate(validator.studentRegister), controller.studentRegister);
router.post('/student/login',  loginLimiter,    validate(validator.studentLogin),  controller.studentLogin);

module.exports = router;
