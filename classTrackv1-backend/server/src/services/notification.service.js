/**
 * server/src/services/notification.service.js
 */
const notifRepo = require('../repositories/notification.repository');

async function getNotifications(recipientType, recipientId, { unreadOnly, limit, offset } = {}) {
  return notifRepo.listForRecipient(recipientType, recipientId, { unreadOnly, limit, offset });
}

async function markRead(notificationId, recipientType, recipientId) {
  await notifRepo.markRead(notificationId, recipientType, recipientId);
}

async function markAllRead(recipientType, recipientId) {
  await notifRepo.markAllRead(recipientType, recipientId);
}

module.exports = { getNotifications, markRead, markAllRead };
