import rateLimit from 'express-rate-limit'

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 phút
  max: 20, // Tối đa 20 yêu cầu trên 15 phút
  message: {
    error: 'RATE_LIMIT_EXCEEDED',
    message: 'Quá nhiều lần thử đăng nhập. Vui lòng thử lại sau 15 phút.',
  },
  standardHeaders: true,
  legacyHeaders: false,
})

export const joinLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 phút
  max: 30, // Tối đa 30 lần thử tham gia trên 1 phút
  message: {
    error: 'RATE_LIMIT_EXCEEDED',
    message: 'Quá nhiều yêu cầu tham gia phòng thi. Vui lòng thử lại sau ít phút.',
  },
  standardHeaders: true,
  legacyHeaders: false,
})

export const proctoringLimiter = rateLimit({
  windowMs: 10 * 1000, // 10 giây
  max: 10, // Tối đa 10 events trên 10 giây để chống spam DDoS
  message: {
    error: 'RATE_LIMIT_EXCEEDED',
    message: 'Gửi sự kiện giám sát quá nhanh.',
  },
  standardHeaders: true,
  legacyHeaders: false,
})
