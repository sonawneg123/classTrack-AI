/**
 * server/src/services/ai/extractor.service.js
 *
 * Extracts readable text from uploaded files before they are sent to Groq.
 * Isolated here so future OCR integrations (Tesseract, AWS Textract, etc.)
 * can be dropped in without touching controllers or the grading logic.
 */
const fs       = require('fs');
const pdfParse = require('pdf-parse');
const logger   = require('../../utils/logger.util');

async function extractFromTxt(filePath) {
  return fs.readFileSync(filePath, 'utf-8');
}

async function extractFromPdf(filePath) {
  try {
    const buffer = fs.readFileSync(filePath);
    const data   = await pdfParse(buffer);
    return data.text || '';
  } catch (err) {
    logger.warn('PDF text extraction failed', { filePath, error: err.message });
    return '';
  }
}

/**
 * Reads a file and returns a base64 data URL safe to pass to a vision model.
 * @param {string} filePath
 * @param {string} mimetype  e.g. 'image/jpeg'
 */
function toBase64DataUrl(filePath, mimetype) {
  const buffer = fs.readFileSync(filePath);
  return `data:${mimetype};base64,${buffer.toString('base64')}`;
}

module.exports = { extractFromTxt, extractFromPdf, toBase64DataUrl };
