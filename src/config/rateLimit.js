const rateLimit = require('express-rate-limit');

const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests', status: 429 },
  skip: () => process.env.NODE_ENV === 'development',
});

// Much more lenient for agent — 20 runs per minute in dev, 5 in prod
const agentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: process.env.NODE_ENV === 'development' ? 20 : 5,
  message: { error: 'Agent rate limit exceeded. Please wait.', status: 429 },
  skip: () => process.env.NODE_ENV === 'development',
});

module.exports = { rateLimiter, agentLimiter };
