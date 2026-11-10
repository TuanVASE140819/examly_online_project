import type { Request, Response, NextFunction } from 'express'
import { ZodError } from 'zod'
import { logger } from '../lib/logger.js'

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
) {
  if (err instanceof AppError) {
    logger.warn({ err, path: req.path }, err.message)
    return res.status(err.statusCode).json({
      error: err.code,
      message: err.message,
      ...(err.details ? { details: err.details } : {}),
    })
  }

  // Lỗi từ bộ đọc body của Express (tệp hoặc JSON quá lớn, JSON hỏng)
  const bodyError = err as { type?: string; status?: number; limit?: number }
  if (bodyError?.type === 'entity.too.large') {
    const mb = bodyError.limit ? Math.round(bodyError.limit / 1024 / 1024) : 0
    return res.status(413).json({
      error: 'PAYLOAD_TOO_LARGE',
      message: mb >= 1 ? `Tệp hoặc dữ liệu gửi lên vượt quá ${mb} MB.` : 'Dữ liệu gửi lên quá lớn.',
    })
  }
  if (bodyError?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'INVALID_JSON', message: 'Dữ liệu gửi lên không đúng định dạng JSON.' })
  }

  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'Dữ liệu đầu vào không hợp lệ',
      details: err.flatten(),
    })
  }

  logger.error({ err, path: req.path }, 'Unhandled Internal Server Error')

  return res.status(500).json({
    error: 'INTERNAL_SERVER_ERROR',
    message: 'Đã có lỗi xảy ra trên máy chủ. Vui lòng thử lại sau.',
  })
}
