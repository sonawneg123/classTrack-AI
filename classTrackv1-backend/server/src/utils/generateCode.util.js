/**
 * server/src/utils/generateCode.util.js
 */
const { customAlphabet } = require('nanoid');

// Unambiguous alphabet — no 0/O or 1/I/L confusion when students type the code
const generate = customAlphabet('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 8);

/**
 * Generates an 8-character classroom join code that is unique in the
 * classrooms table. Uses the classroomRepo's existsByCode method to check.
 *
 * @param {object} classroomRepo  - instance with async existsByCode(code)
 */
async function generateClassCode(classroomRepo) {
  let code;
  let exists = true;
  while (exists) {
    code   = generate();
    exists = await classroomRepo.existsByCode(code);
  }
  return code;
}

module.exports = { generateClassCode };
