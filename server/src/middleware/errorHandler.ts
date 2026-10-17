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
