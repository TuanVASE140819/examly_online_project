import jwt from 'jsonwebtoken'
import { UserRole } from '@prisma/client'
import { prisma } from '../../lib/prisma.js'
import { env } from '../../config/env.js'
import { comparePassword, hashPassword } from '../../lib/crypto.js'
import { AppError } from '../../middleware/errorHandler.js'
import type { LoginInput, RegisterInput } from './auth.schemas.js'

export class AuthService {
  static async login(data: LoginInput) {
    const user = await prisma.user.findUnique({
      where: { email: data.email.toLowerCase() },
    })

    if (!user) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Email hoặc mật khẩu không chính xác.')
    }

    const isValid = await comparePassword(data.password, user.passwordHash)
    if (!isValid) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Email hoặc mật khẩu không chính xác.')
    }

    const token = jwt.sign(
      {
        sub: user.id,
        role: user.role,
        email: user.email,
        displayName: user.displayName,
      },
      env.JWT_SECRET,
      { expiresIn: '7d' }
    )

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
      },
    }
  }

  static async register(data: RegisterInput) {
    const existing = await prisma.user.findUnique({
      where: { email: data.email.toLowerCase() },
    })

    if (existing) {
      throw new AppError(409, 'EMAIL_EXISTS', 'Email này đã được sử dụng.')
    }

    const passwordHash = await hashPassword(data.password)

    const user = await prisma.user.create({
      data: {
        email: data.email.toLowerCase(),
        passwordHash,
        displayName: data.displayName,
        role: data.role === 'STUDENT' ? UserRole.STUDENT : UserRole.TEACHER,
      },
    })

    const token = jwt.sign(
      {
        sub: user.id,
        role: user.role,
        email: user.email,
        displayName: user.displayName,
      },
      env.JWT_SECRET,
      { expiresIn: '7d' }
    )

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
      },
    }
  }

  static async getMe(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        createdAt: true,
      },
    })

    if (!user) {
      throw new AppError(404, 'USER_NOT_FOUND', 'Không tìm thấy người dùng.')
    }

    return { user }
  }
}
