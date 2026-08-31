/**
 * server/src/utils/mobile.util.js
 *
 * Mobile number normalization to E.164.
 *
 * Strategy (India-default):
 *   - Strip all spaces, dashes, parentheses.
 *   - If it starts with '+', keep as-is (already has country code).
 *   - If it starts with '00', replace leading '00' with '+'.
 *   - If it starts with '0' and is 10+ digits, treat as local Indian number:
 *     strip the leading 0 and prepend +91.
 *   - If it is exactly 10 digits (no prefix), prepend +91.
 *   - Otherwise return the cleaned number with a '+' prefix.
 *
 * Examples:
 *   +919876543210  →  +919876543210
 *   +91 98765 43210  →  +919876543210
 *   09876543210  →  +919876543210
 *   9876543210   →  +919876543210
 *   0919876543210 → +919876543210 (via 00 → + rule after strip)
 *
 * The normalized form is what is stored in the database.
 * This is the single authoritative normalization point — use it in
 * both studentRegister and any future mobile-based lookup.
 */

/**
 * @param {string} raw   Raw mobile string from user input.
 * @returns {string}     E.164-normalized mobile number.
 */
function normalizeMobile(raw) {
  // Strip whitespace, dashes, parentheses, dots
  let digits = raw.replace(/[\s\-().]/g, '');

  if (digits.startsWith('+')) {
    // Already has country code — keep as-is (just remove non-digit chars after '+')
    return '+' + digits.slice(1).replace(/\D/g, '');
  }

  if (digits.startsWith('00')) {
    // International prefix 00XXXXXXXXXXX → +XXXXXXXXXXX
    return '+' + digits.slice(2);
  }

  // Remove remaining non-digit characters
  digits = digits.replace(/\D/g, '');

  if (digits.startsWith('0') && digits.length >= 10) {
    // Local format with leading 0 (Indian mobile) → strip 0, prepend +91
    return '+91' + digits.slice(1);
  }

  if (digits.length === 10) {
    // Bare 10-digit number (Indian mobile without any prefix)
    return '+91' + digits;
  }

  // Fallback: prepend + and return
  return '+' + digits;
}

module.exports = { normalizeMobile };
