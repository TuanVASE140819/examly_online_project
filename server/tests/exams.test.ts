import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { prisma } from '../src/lib/prisma.js'
import jwt from 'jsonwebtoken'
import { env } from '../src/config/env.js'
import { UserRole, ExamStatus, ParticipantStatus } from '@prisma/client'

vi.mock('../src/lib/prisma.js', () => ({
  prisma: {
    exam: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    participant: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  },
}))

describe('Kịch bản 3, 4, 5, 8: Quản lý Kỳ thi & Thí sinh tham gia', () => {
  const app = createApp()

  const teacher1Id = 'teacher-1111'
  const teacher2Id = 'teacher-2222'

  const teacher2Token = jwt.sign(
    { sub: teacher2Id, role: UserRole.TEACHER, email: 't2@examly.vn' },
    env.JWT_SECRET
  )

  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('3. Teacher không thể quản lý kỳ thi không thuộc quyền: Trả về HTTP 403 FORBIDDEN', async () => {
    // Kỳ thi này do teacher1 sở hữu
    vi.mocked(prisma.exam.findUnique).mockResolvedValueOnce({
      id: 'exam-owned-by-teacher-1',
      ownerId: teacher1Id,
      title: 'Thi thử Toán',
      status: ExamStatus.WAITING,
      _count: { participants: 0, questions: 0 },
    } as any)

    // Teacher 2 cố gắng truy cập
    const res = await request(app)
      .get('/api/v1/exams/exam-owned-by-teacher-1')
      .set('Authorization', `Bearer ${teacher2Token}`)

    expect(res.status).toBe(403)
    expect(res.body.error).toBe('FORBIDDEN')
  })

  it('4. Mã phòng không tồn tại: Trả về HTTP 404 ROOM_NOT_FOUND', async () => {
    vi.mocked(prisma.exam.findUnique).mockResolvedValueOnce(null)

    const res = await request(app).post('/api/v1/exams/join').send({
      joinCode: 'EXAM-NON-EXISTENT',
      displayName: 'Nguyễn Văn A',
      className: '12A1',
    })

    expect(res.status).toBe(404)
    expect(res.body.error).toBe('ROOM_NOT_FOUND')
  })

  it('5. Học sinh gửi yêu cầu tham gia hợp lệ: Trả về HTTP 201, trạng thái PENDING và participantToken', async () => {
    vi.mocked(prisma.exam.findUnique).mockResolvedValueOnce({
      id: 'exam-101',
      title: 'Kiểm tra Front-end',
      status: ExamStatus.WAITING,
      durationSeconds: 1800,
      joinCode: 'EXAM-101',
    } as any)

    vi.mocked(prisma.participant.findFirst).mockResolvedValueOnce(null)
    vi.mocked(prisma.participant.create).mockResolvedValueOnce({
      id: 'part-new-1',
      examId: 'exam-101',
      displayName: 'Nguyễn Minh Anh',
      className: '12A1',
      status: ParticipantStatus.PENDING,
      joinedAt: new Date(),
    } as any)

    const res = await request(app).post('/api/v1/exams/join').send({
      joinCode: 'EXAM-101',
      displayName: 'Nguyễn Minh Anh',
      className: '12A1',
    })

    expect(res.status).toBe(201)
    expect(res.body.participantToken).toBeDefined()
    expect(res.body.participant.status).toBe('PENDING')
    expect(res.body.participant.displayName).toBe('Nguyễn Minh Anh')
  })

  it('8. Hai request tham gia trùng lặp: Tái sử dụng phiên tham gia hiện có, không tạo bản ghi trùng', async () => {
    vi.mocked(prisma.exam.findUnique).mockResolvedValueOnce({
      id: 'exam-101',
      title: 'Kiểm tra Front-end',
      status: ExamStatus.WAITING,
      durationSeconds: 1800,
      joinCode: 'EXAM-101',
    } as any)

    // Đã tồn tại thí sinh với cùng tên và lớp
    vi.mocked(prisma.participant.findFirst).mockResolvedValueOnce({
      id: 'part-existing-1',
      examId: 'exam-101',
      displayName: 'Nguyễn Minh Anh',
      className: '12A1',
      status: ParticipantStatus.PENDING,
      joinedAt: new Date(),
    } as any)

    const res = await request(app).post('/api/v1/exams/join').send({
      joinCode: 'EXAM-101',
      displayName: 'Nguyễn Minh Anh',
      className: '12A1',
    })

    expect(res.status).toBe(201)
    expect(prisma.participant.create).not.toHaveBeenCalled()
    expect(res.body.participant.id).toBe('part-existing-1')
  })
})
