import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { UserRole } from '@prisma/client'
import { env } from '../config/env.js'
import { AppError } from './errorHandler.js'

export type AuthPayload = {
  sub: string
  role: UserRole
  examId?: string
  email?: string
  displayName?: string
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload
    }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return next(new AppError(401, 'UNAUTHORIZED', 'Yêu cầu đăng nhập hoặc mã phiên không hợp lệ.'))
  }

  const token = authHeader.slice(7)
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as AuthPayload
    req.user = decoded
    next()
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      return next(new AppError(401, 'TOKEN_EXPIRED', 'Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.'))
    }
    return next(new AppError(401, 'INVALID_TOKEN', 'Token xác thực không hợp lệ.'))
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new AppError(403, 'FORBIDDEN', 'Bạn không có quyền thực hiện hành động này.'))
    }
    next()
  }
}

export function requireExamParticipant(req: Request, _res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== UserRole.STUDENT) {
    return next(new AppError(403, 'FORBIDDEN', 'Chỉ thí sinh đã tham gia phòng thi mới được truy cập.'))
  }
  const examId = req.params['examId'] || req.body?.examId
  if (examId && req.user.examId && req.user.examId !== examId) {
    return next(new AppError(403, 'FORBIDDEN', 'Bạn không thuộc kỳ thi này.'))
  }
  next()
}
