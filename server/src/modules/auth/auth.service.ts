import jwt from 'jsonwebtoken'
import { UserRole, type User } from '@prisma/client'
import { prisma } from '../../lib/prisma.js'
import { env } from '../../config/env.js'
import { comparePassword, hashPassword } from '../../lib/crypto.js'
import { verifyGoogleIdToken } from '../../lib/firebase.js'
import { AppError } from '../../middleware/errorHandler.js'
import type { GoogleLoginInput, LoginInput, RegisterInput } from './auth.schemas.js'

function createSession(user: User) {
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

export class AuthService {
  static async login(data: LoginInput) {
    const user = await prisma.user.findUnique({
      where: { email: data.email.toLowerCase() },
    })

    if (!user) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Email hoặc mật khẩu không chính xác.')
    }

    // Tài khoản tạo bằng Google không có mật khẩu
    if (!user.passwordHash) {
      throw new AppError(401, 'GOOGLE_ACCOUNT', 'Tài khoản này đăng nhập bằng Google. Hãy bấm "Tiếp tục với Google".')
    }

    const isValid = await comparePassword(data.password, user.passwordHash)
    if (!isValid) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Email hoặc mật khẩu không chính xác.')
    }

    return createSession(user)
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

    return createSession(user)
  }

  // Đăng nhập bằng Google qua Firebase: liên kết với tài khoản sẵn có theo email đã xác minh,
  // chưa có thì tạo mới với vai trò người dùng chọn ở mục Đăng ký
  static async loginWithGoogle(data: GoogleLoginInput) {
    const google = await verifyGoogleIdToken(data.idToken)
    const email = google.email.toLowerCase()

    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      return createSession(existing)
    }

    if (!data.role) {
      throw new AppError(
        404,
        'GOOGLE_ACCOUNT_NOT_REGISTERED',
        'Tài khoản Google này chưa đăng ký. Hãy chọn vai trò rồi bấm "Tiếp tục với Google" để tạo tài khoản.'
      )
    }

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: null,
        displayName: (google.name?.trim() || email.split('@')[0] || email).slice(0, 120),
        role: data.role === 'STUDENT' ? UserRole.STUDENT : UserRole.TEACHER,
      },
    })

    return createSession(user)
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
