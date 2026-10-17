import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { prisma } from '../src/lib/prisma.js'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { env } from '../src/config/env.js'
import { UserRole } from '@prisma/client'

vi.mock('../src/lib/prisma.js', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    exam: {
      create: vi.fn(),
      findUnique: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  },
}))

describe('Kịch bản 1 & 2: Xác thực (Auth) và Phân quyền (RBAC)', () => {
  const app = createApp()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('1.1. Đăng nhập hợp lệ: Trả về HTTP 200 kèm JWT token và thông tin user', async () => {
    const passwordHash = await bcrypt.hash('Password123@', 10)
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: 'teacher-uuid-1',
      email: 'teacher@examly.vn',
      displayName: 'Thầy Hoàng Anh',
      passwordHash,
      role: UserRole.TEACHER,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)

    const res = await request(app).post('/api/v1/auth/login').send({
      email: 'teacher@examly.vn',
      password: 'Password123@',
    })

    expect(res.status).toBe(200)
    expect(res.body.token).toBeDefined()
    expect(res.body.user.email).toBe('teacher@examly.vn')
    expect(res.body.user.role).toBe('TEACHER')
  })

  it('1.2. Đăng nhập không hợp lệ: Sai mật khẩu trả về HTTP 401 INVALID_CREDENTIALS', async () => {
    const passwordHash = await bcrypt.hash('Password123@', 10)
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: 'teacher-uuid-1',
      email: 'teacher@examly.vn',
      displayName: 'Thầy Hoàng Anh',
      passwordHash,
      role: UserRole.TEACHER,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)

    const res = await request(app).post('/api/v1/auth/login').send({
      email: 'teacher@examly.vn',
      password: 'WrongPassword999',
    })

    expect(res.status).toBe(401)
    expect(res.body.error).toBe('INVALID_CREDENTIALS')
  })

  it('2. Student không thể tạo kỳ thi: Trả về HTTP 403 FORBIDDEN', async () => {
    // Ký token với vai trò STUDENT
    const studentToken = jwt.sign(
      { sub: 'student-uuid-1', role: UserRole.STUDENT },
      env.JWT_SECRET
    )

    const res = await request(app)
      .post('/api/v1/exams')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        title: 'Kỳ thi không hợp lệ',
        durationMinutes: 30,
      })

    expect(res.status).toBe(403)
    expect(res.body.error).toBe('FORBIDDEN')
  })
})
