/**
 * server/tests/unit/middleware/authorizePermissions.test.js
 *
 * Tests the permission-based authorization guard in isolation — it only
 * reads req.user.permissions, so no database mocking is needed here.
 */
const { authorizePermissions } = require('../../../src/middleware/auth.middleware');
const { PERMISSIONS } = require('../../../src/constants/permissions.constants');
const { ApiError } = require('../../../src/utils/response.util');

function mockReq(permissions) {
  return { user: { id: 1, role: 'teacher', permissions } };
}

describe('authorizePermissions middleware', () => {
  it('calls next() with no error when the user has the single required permission', () => {
    const middleware = authorizePermissions(PERMISSIONS.TASK_CREATE);
    const next = jest.fn();
    middleware(mockReq([PERMISSIONS.TASK_CREATE]), {}, next);
    expect(next).toHaveBeenCalledWith(); // no argument = success
  });

  it('calls next(ApiError) when the user lacks the required permission', () => {
    const middleware = authorizePermissions(PERMISSIONS.PLATFORM_MANAGE);
    const next = jest.fn();
    middleware(mockReq([PERMISSIONS.TASK_CREATE]), {}, next);
    expect(next).toHaveBeenCalledWith(expect.any(ApiError));
    expect(next.mock.calls[0][0].statusCode).toBe(403);
  });

  it('defaults to requiring ALL listed permissions', () => {
    const middleware = authorizePermissions(PERMISSIONS.TASK_CREATE, PERMISSIONS.SUBMISSION_GRADE);
    const next = jest.fn();
    // Has only one of the two required permissions
    middleware(mockReq([PERMISSIONS.TASK_CREATE]), {}, next);
    expect(next.mock.calls[0][0]).toBeInstanceOf(ApiError);
  });

  it('with { match: "any" }, succeeds if the user has at least one of the listed permissions', () => {
    const middleware = authorizePermissions(PERMISSIONS.REPORT_VIEW_ANY, PERMISSIONS.REPORT_VIEW_OWN, { match: 'any' });
    const next = jest.fn();
    middleware(mockReq([PERMISSIONS.REPORT_VIEW_OWN]), {}, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('rejects when req.user is missing entirely (not authenticated)', () => {
    const middleware = authorizePermissions(PERMISSIONS.TASK_CREATE);
    const next = jest.fn();
    middleware({}, {}, next);
    expect(next.mock.calls[0][0]).toBeInstanceOf(ApiError);
    expect(next.mock.calls[0][0].statusCode).toBe(403);
  });

  it('rejects when the user has an empty permissions array', () => {
    const middleware = authorizePermissions(PERMISSIONS.TASK_CREATE);
    const next = jest.fn();
    middleware(mockReq([]), {}, next);
    expect(next.mock.calls[0][0]).toBeInstanceOf(ApiError);
  });
});
