/**
 * Request Validation Utilities
 */

/**
 * Validate an agent run request body
 */
function validateAgentRequest(body) {
  const errors = [];

  if (!body.jdText || typeof body.jdText !== 'string') {
    errors.push('jdText is required and must be a string');
  } else if (body.jdText.trim().length < 50) {
    errors.push('jdText is too short — provide a complete job description (min 50 chars)');
  } else if (body.jdText.length > 10000) {
    errors.push('jdText is too long (max 10,000 chars)');
  }

  if (!body.apiKey || typeof body.apiKey !== 'string') {
    errors.push('apiKey is required');
  } else if (!body.apiKey.startsWith('AIza')) {
    errors.push('apiKey does not appear to be a valid Gemini key');
  }

  if (body.topN !== undefined) {
    const n = parseInt(body.topN);
    if (isNaN(n) || n < 1 || n > 10) {
      errors.push('topN must be a number between 1 and 10');
    }
  }

  return errors;
}

/**
 * Sanitise string input — remove dangerous chars
 */
function sanitiseString(str, maxLen = 1000) {
  if (typeof str !== 'string') return '';
  return str.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
            .replace(/<[^>]+>/g, '')
            .slice(0, maxLen)
            .trim();
}

module.exports = { validateAgentRequest, sanitiseString };
