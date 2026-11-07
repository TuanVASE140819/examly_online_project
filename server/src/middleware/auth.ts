import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { UserRole } from '@prisma/client'
import { env } from '../config/env.js'
import { prisma } from '../lib/prisma.js'
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

// Token phiên thi (participantToken) cũng mang role STUDENT nhưng sub là participantId.
// Các route theo tài khoản (lớp học, bài tập, bảng điểm) chỉ nhận token đăng nhập tài khoản.
export function requireUserAccount(req: Request, _res: Response, next: NextFunction) {
  if (!req.user || req.user.examId) {
    return next(new AppError(403, 'ACCOUNT_TOKEN_REQUIRED', 'Vui lòng đăng nhập bằng tài khoản để dùng chức năng này.'))
  }
  next()
}

// Quyền quản trị được đối chiếu với cơ sở dữ liệu ở mỗi yêu cầu, để tài khoản bị hạ quyền
// hoặc bị xóa mất quyền ngay mà không phải chờ token hết hạn
export async function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  try {
    if (!req.user || req.user.examId || req.user.role !== UserRole.ADMIN) {
      throw new AppError(403, 'FORBIDDEN', 'Chỉ quản trị viên mới thực hiện được thao tác này.')
    }
    const account = await prisma.user.findUnique({ where: { id: req.user.sub }, select: { role: true } })
    if (account?.role !== UserRole.ADMIN) {
      throw new AppError(403, 'FORBIDDEN', 'Tài khoản của bạn không còn quyền quản trị. Vui lòng đăng nhập lại.')
    }
    next()
  } catch (err) {
    next(err)
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
