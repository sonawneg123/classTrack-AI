/**
 * server/src/middleware/auth.middleware.js
 *
 * Verifies the Bearer token AND re-checks is_active in the DB on every
 * request — so disabling an account takes effect immediately, not on token
 * expiry.
 */
const { verifyToken } = require('../utils/jwt.util');
const { ApiError }    = require('../utils/response.util');
const { pool }        = require('../database/connection');
const { permissionsForRole } = require('../constants/permissions.constants');
const logger          = require('../utils/logger.util');

const TABLE_BY_ROLE = { admin: 'admins', teacher: 'teachers', student: 'students' };

async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw ApiError.unauthorized('Missing authentication token.');

    let payload;
    try {
      payload = verifyToken(token);
    } catch {
      throw ApiError.unauthorized('Invalid or expired token. Please log in again.');
    }

    const table = TABLE_BY_ROLE[payload.role];
    if (!table) throw ApiError.unauthorized('Invalid token role.');

    const [rows] = await pool.query(`SELECT * FROM \`${table}\` WHERE id = ?`, [payload.id]);
    const account = rows[0];

    if (!account) throw ApiError.unauthorized('Your account no longer exists.');
    if ('is_active' in account && !account.is_active) {
      throw ApiError.forbidden('Your account has been disabled. Contact your administrator.');
    }
    // Defense-in-depth: an account locked out (repeated failed logins)
    // mid-session is also cut off immediately, not just at the next login
    // attempt. The `'locked_until' in account` guard means this is a no-op
    // on a database that hasn't run migration 002 yet — fully backward
    // compatible with a pre-IAM schema.
    if ('locked_until' in account && account.locked_until && new Date(account.locked_until) > new Date()) {
      throw ApiError.forbidden('Your account is temporarily locked due to failed login attempts. Please try again later.');
    }

    req.user    = { ...payload, account };
    req.user.id = payload.id; // ensure numeric id from JWT
    // Permissions attached alongside — additive; nothing reads req.user.role
    // any differently, so every existing authorizeRoles() check is unaffected.
    req.user.permissions = permissionsForRole(payload.role);
    next();
  } catch (err) {
    next(err);
  }
}

function authorizeRoles(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(ApiError.forbidden());
    }
    next();
  };
}

/**
 * Permission-based authorization — the preferred guard for all new routes.
 * Checks req.user.permissions (computed once, at authenticate() time) rather
 * than a hard-coded role string, so a route's access rules can be changed
 * by editing permissions.constants.js instead of hunting down every route
 * that hard-codes a role name.
 *
 * @param {...string} requiredPermissions  One or more permission codes.
 * @param {object} [options]
 * @param {'all'|'any'} [options.match='all']  Require all listed permissions, or any one of them.
 *
 * Usage:
 *   router.post('/classrooms', authorizePermissions(PERMISSIONS.CLASSROOM_CREATE), ...);
 *   router.get('/reports', authorizePermissions(PERMISSIONS.REPORT_VIEW_ANY, PERMISSIONS.REPORT_VIEW_OWN, { match: 'any' }), ...);
 */
function authorizePermissions(...args) {
  let match = 'all';
  let permissions = args;
  const last = args[args.length - 1];
  if (last && typeof last === 'object' && !Array.isArray(last)) {
    match = last.match || 'all';
    permissions = args.slice(0, -1);
  }

  return (req, res, next) => {
    if (!req.user) return next(ApiError.forbidden());
    const granted = req.user.permissions || [];
    const hasAccess = match === 'any'
      ? permissions.some((p) => granted.includes(p))
      : permissions.every((p) => granted.includes(p));

    if (!hasAccess) {
      logger.warn('Permission denied', { userId: req.user.id, role: req.user.role, required: permissions, match });
      return next(ApiError.forbidden());
    }
    next();
  };
}

module.exports = { authenticate, authorizeRoles, authorizePermissions };
