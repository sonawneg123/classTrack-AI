/**
 * server/src/utils/password.util.js
 */
const crypto = require('crypto');

const WORDS = [
  'Bold','Calm','Swift','Bright','Quiet','Brave','Sharp','Kind',
  'Otter','Tiger','Eagle','Maple','River','Comet','Coral','Cedar',
];

function generateTempPassword() {
  const w1  = WORDS[crypto.randomInt(WORDS.length)];
  const w2  = WORDS[crypto.randomInt(WORDS.length)];
  const num = crypto.randomInt(1000, 9999);
  return `${w1}-${w2}-${num}`;
}

module.exports = { generateTempPassword };
