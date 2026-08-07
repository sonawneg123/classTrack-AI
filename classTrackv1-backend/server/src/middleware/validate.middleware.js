/**
 * server/src/middleware/validate.middleware.js
 *
 * Wraps a Joi schema into Express middleware.
 *
 * Usage:
 *   router.post('/login', validate(authValidator.login), controller.login);
 *
 * Validates req.body, req.params, req.query depending on which schemas
 * are supplied. Fires a 400 ApiError if validation fails.
 */
const { ApiError } = require('../utils/response.util');

/**
 * @param {object} schemas  Keys: body | params | query — each a Joi schema
 */
function validate(schemas) {
  return (req, res, next) => {
    const errors = [];

    for (const [target, schema] of Object.entries(schemas)) {
      if (!schema) continue;
      const { error, value } = schema.validate(req[target], { abortEarly: false, stripUnknown: true });
      if (error) {
        error.details.forEach((d) => errors.push(d.message));
      } else if (target === 'query') {
        // req.query is a getter-only property on Express 4's request
        // prototype (no setter) — a plain `req.query = value` assignment
        // silently no-ops in non-strict mode instead of replacing it.
        // Defining an own property shadows the inherited getter correctly.
        Object.defineProperty(req, 'query', {
          value, writable: true, enumerable: true, configurable: true,
        });
      } else {
        req[target] = value; // replace with sanitised/coerced values
      }
    }

    if (errors.length) {
      return next(ApiError.badRequest('Validation failed.', errors));
    }
    next();
  };
}

module.exports = validate;
