/**
 * server/src/utils/username.util.js
 */
const VALID = /^[a-zA-Z0-9_.]{3,30}$/;

function isValidUsername(username) {
  return typeof username === 'string' && VALID.test(username);
}

function suggestUsername(name) {
  return name.trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24) || 'student';
}

module.exports = { isValidUsername, suggestUsername };
