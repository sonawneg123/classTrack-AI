/**
 * server/src/controllers/account.controller.js
 */
const notifService = require('../services/notification.service');
const { ApiResponse, asyncHandler } = require('../utils/response.util');

const getNotifications = asyncHandler(async (req, res) => {
  const unreadOnly = req.query.unreadOnly === 'true';
  const limit      = Math.min(Number(req.query.limit) || 30, 100);
  const offset     = Number(req.query.offset) || 0;
  const data = await notifService.getNotifications(req.user.role, req.user.id, { unreadOnly, limit, offset });
  new ApiResponse(200, 'Notifications retrieved.', data).send(res);
});

const markNotificationRead = asyncHandler(async (req, res) => {
  await notifService.markRead(req.params.id, req.user.role, req.user.id);
  new ApiResponse(200, 'Marked as read.').send(res);
});

const markAllNotificationsRead = asyncHandler(async (req, res) => {
  await notifService.markAllRead(req.user.role, req.user.id);
  new ApiResponse(200, 'All notifications marked as read.').send(res);
});

module.exports = { getNotifications, markNotificationRead, markAllNotificationsRead };
