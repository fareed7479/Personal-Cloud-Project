import rateLimit from 'express-rate-limit';

/**
 * Strict rate limiter for sensitive pairing operations:
 * Max 20 requests per 15 minutes per IP.
 */
export const pairingRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many pairing attempts from this IP address. Please try again in 15 minutes.',
    },
  },
});

/**
 * General API abuse prevention rate limiter:
 * Max 1000 requests per minute per IP.
 */
export const generalApiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests. Please slow down and try again shortly.',
    },
  },
});
