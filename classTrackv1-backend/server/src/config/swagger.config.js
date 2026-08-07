/**
 * server/src/config/swagger.config.js
 *
 * Generates an OpenAPI 3.0 spec from the `@openapi` JSDoc comments in
 * route files (currently: routes/v1/auth.routes.js) and serves an
 * interactive Swagger UI at GET /api-docs.
 *
 * Reusable schemas (AuthSuccessResponse, ErrorResponse, etc.) are defined
 * once here and referenced via `$ref` from the route JSDoc so the shape of
 * the standard API envelope only needs to be described in one place.
 */
const swaggerJSDoc = require('swagger-jsdoc');
const config = require('./index');

const definition = {
  openapi: '3.0.3',
  info: {
    title: 'ClassTrack AI — Identity & Access Management API',
    version: '1.0.0',
    description:
      'Enterprise authentication endpoints: login, registration, short-lived ' +
      'access tokens with rotating refresh tokens, email verification, ' +
      'forgot/reset password, and account lockout. All endpoints are versioned ' +
      'under `/api/v1`. The legacy `/api/auth/*` surface (login/register only, ' +
      'no refresh tokens) remains available unchanged for backward compatibility ' +
      'and is not documented here.',
    contact: { name: 'ClassTrack AI' },
  },
  servers: [
    { url: `http://localhost:${config.server.port}/api`, description: 'Local development' },
  ],
  tags: [
    { name: 'Auth', description: 'Authentication, session management, and account recovery' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Short-lived access token obtained from a login or refresh endpoint. Send as `Authorization: Bearer <token>`.',
      },
    },
    schemas: {
      EmailLoginRequest: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email:    { type: 'string', format: 'email', example: 'teacher@classtrack.ai' },
          password: { type: 'string', format: 'password', example: 'Teacher@123' },
        },
      },
      AuthSuccessResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string', example: 'Login successful.' },
          data: {
            type: 'object',
            properties: {
              token:        { type: 'string', description: 'Alias for accessToken (kept for legacy frontend compatibility)' },
              accessToken:  { type: 'string', description: 'Short-lived JWT, default 15 minutes' },
              refreshToken: { type: 'string', description: 'Opaque long-lived token, default 30 days. Store securely.' },
              permissions:  { type: 'array', items: { type: 'string' }, example: ['classroom:manage_own', 'task:create'] },
              user: {
                type: 'object',
                properties: {
                  id:    { type: 'integer' },
                  name:  { type: 'string' },
                  role:  { type: 'string', enum: ['admin', 'teacher', 'student'] },
                  email: { type: 'string' },
                },
              },
            },
          },
        },
      },
      ErrorResponse: {
        type: 'object',
        properties: {
          success:   { type: 'boolean', example: false },
          message:   { type: 'string', example: 'Invalid email or password.' },
          errors:    { type: 'array', items: { type: 'string' }, example: [] },
          requestId: { type: 'string', format: 'uuid' },
        },
      },
    },
  },
};

const swaggerSpec = swaggerJSDoc({
  definition,
  apis: ['./src/routes/v1/*.routes.js'],
});

module.exports = swaggerSpec;
