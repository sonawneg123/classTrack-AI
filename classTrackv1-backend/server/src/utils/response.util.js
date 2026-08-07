/**
 * server/src/utils/response.util.js
 *
 * Consistent API response envelope used by every controller.
 *
 * Success:  { success: true,  message, data }
 * Error:    { success: false, message, errors: [] }
 *
 * Controllers should call these instead of res.json() directly
 * so the shape of every response is predictable for the client.
 */

class ApiResponse {
  /**
   * @param {number}  statusCode  HTTP status
   * @param {string}  message     Human-readable description
   * @param {*}       data        Payload (object, array, null)
   */
  constructor(statusCode, message, data = null) {
    this.statusCode = statusCode;
    this.success    = statusCode < 400;
    this.message    = message;
    if (data !== null) this.data = data;
  }

  send(res) {
    return res.status(this.statusCode).json({
      success: this.success,
      message: this.message,
      ...(this.data !== undefined && { data: this.data }),
    });
  }
}

class ApiError extends Error {
  /**
   * @param {number}        statusCode   HTTP status (4xx or 5xx)
   * @param {string}        message      Human-readable error
   * @param {string[]}      [errors]     Optional field-level error list
   * @param {boolean}       [isOperational]  true = known/expected error; false = programming error
   */
  constructor(statusCode, message, errors = [], isOperational = true) {
    super(message);
    this.statusCode    = statusCode;
    this.errors        = errors;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }

  // Factory shortcuts for the most common errors
  static badRequest(message, errors = []) {
    return new ApiError(400, message, errors);
  }

  static unauthorized(message = 'Authentication required.') {
    return new ApiError(401, message);
  }

  static forbidden(message = 'You do not have permission to access this resource.') {
    return new ApiError(403, message);
  }

  static notFound(message = 'Resource not found.') {
    return new ApiError(404, message);
  }

  static conflict(message) {
    return new ApiError(409, message);
  }

  static tooManyRequests(message = 'Too many requests. Please slow down.') {
    return new ApiError(429, message);
  }

  static internal(message = 'An unexpected error occurred. Please try again.') {
    return new ApiError(500, message, [], false);
  }
}

/**
 * Wraps an async route handler so every unhandled rejection is forwarded
 * to Express's next(err) error handler — eliminating the try/catch boilerplate
 * that was repeated in every controller function.
 *
 * Usage:
 *   router.get('/path', asyncHandler(async (req, res) => { ... }));
 */
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { ApiResponse, ApiError, asyncHandler };
