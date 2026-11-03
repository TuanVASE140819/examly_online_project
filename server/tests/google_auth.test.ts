import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import { UserRole } from '@prisma/client'
import { createApp } from '../src/app.js'
import { prisma } from '../src/lib/prisma.js'
import { verifyGoogleIdToken } from '../src/lib/firebase.js'
import { AppError } from '../src/middleware/errorHandler.js'

vi.mock('../src/lib/prisma.js', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}))

// Không gọi Firebase thật: giả lập kết quả xác minh ID token Google
vi.mock('../src/lib/firebase.js', () => ({
  verifyGoogleIdToken: vi.fn(),
}))

const googleUser = {
  id: 'google-user-uuid',
  email: 'hocsinh.google@gmail.com',
  displayName: 'Học Sinh Google',
  passwordHash: null,
  role: UserRole.STUDENT,
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe('Đăng nhập bằng Google (Firebase)', () => {
  const app = createApp()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('Tài khoản đã có (cùng email): đăng nhập luôn, không tạo mới và không đổi vai trò', async () => {
    vi.mocked(verifyGoogleIdToken).mockResolvedValueOnce({ email: 'GiaoVien@Gmail.com', name: 'Cô Lan' })
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      ...googleUser,
      id: 'teacher-uuid',
      email: 'giaovien@gmail.com',
      passwordHash: 'bcrypt-hash',
      role: UserRole.TEACHER,
    } as any)

    const res = await request(app).post('/api/v1/auth/google').send({ idToken: 'token', role: 'STUDENT' })

    expect(res.status).toBe(200)
    expect(res.body.token).toBeDefined()
    expect(res.body.user.role).toBe('TEACHER')
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: 'giaovien@gmail.com' } })
    expect(prisma.user.create).not.toHaveBeenCalled()
  })

  it('Tài khoản chưa có và không chọn vai trò: trả về 404 GOOGLE_ACCOUNT_NOT_REGISTERED', async () => {
    vi.mocked(verifyGoogleIdToken).mockResolvedValueOnce({ email: 'moi@gmail.com', name: 'Người Mới' })
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null)

    const res = await request(app).post('/api/v1/auth/google').send({ idToken: 'token' })

    expect(res.status).toBe(404)
    expect(res.body.error).toBe('GOOGLE_ACCOUNT_NOT_REGISTERED')
    expect(prisma.user.create).not.toHaveBeenCalled()
  })

  it('Tài khoản chưa có và đã chọn vai trò: tạo tài khoản không mật khẩu, lấy tên từ Google', async () => {
    vi.mocked(verifyGoogleIdToken).mockResolvedValueOnce({ email: 'hocsinh.google@gmail.com', name: 'Học Sinh Google' })
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null)
    vi.mocked(prisma.user.create).mockImplementationOnce(async ({ data }: any) => ({ ...googleUser, ...data }))

    const res = await request(app).post('/api/v1/auth/google').send({ idToken: 'token', role: 'STUDENT' })

    expect(res.status).toBe(200)
    expect(res.body.user.role).toBe('STUDENT')
    expect(res.body.user.displayName).toBe('Học Sinh Google')
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: {
        email: 'hocsinh.google@gmail.com',
        passwordHash: null,
        displayName: 'Học Sinh Google',
        role: UserRole.STUDENT,
      },
    })
  })

  it('Không cho tạo tài khoản ADMIN qua Google: trả về 400', async () => {
    const res = await request(app).post('/api/v1/auth/google').send({ idToken: 'token', role: 'ADMIN' })

    expect(res.status).toBe(400)
    expect(verifyGoogleIdToken).not.toHaveBeenCalled()
  })

  it('ID token không hợp lệ: trả về 401 và không truy vấn người dùng', async () => {
    vi.mocked(verifyGoogleIdToken).mockRejectedValueOnce(
      new AppError(401, 'INVALID_GOOGLE_TOKEN', 'Không xác minh được tài khoản Google. Vui lòng thử lại.')
    )

    const res = await request(app).post('/api/v1/auth/google').send({ idToken: 'forged' })

    expect(res.status).toBe(401)
    expect(res.body.error).toBe('INVALID_GOOGLE_TOKEN')
    expect(prisma.user.findUnique).not.toHaveBeenCalled()
  })

  it('Tài khoản Google không có mật khẩu thì không đăng nhập bằng mật khẩu được', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(googleUser as any)

    const res = await request(app).post('/api/v1/auth/login').send({
      email: 'hocsinh.google@gmail.com',
      password: 'bat-ky-mat-khau',
    })

    expect(res.status).toBe(401)
    expect(res.body.error).toBe('GOOGLE_ACCOUNT')
  })
})
