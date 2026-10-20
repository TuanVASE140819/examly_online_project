import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { prisma } from '../src/lib/prisma.js'
import jwt from 'jsonwebtoken'
import { env } from '../src/config/env.js'
import { UserRole, ExamStatus, ParticipantStatus } from '@prisma/client'

vi.mock('../src/lib/prisma.js', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
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

  const studentUserId = 'student-user-1111'
  const studentToken = jwt.sign(
    { sub: studentUserId, role: UserRole.STUDENT, email: 'student@examly.vn' },
    env.JWT_SECRET
  )
  const studentAccount = {
    id: studentUserId,
    displayName: 'Nguyễn Minh Anh',
    role: UserRole.STUDENT,
  }

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
    // Bị chặn bởi kiểm tra quyền sở hữu, không phải bởi middleware của route thí sinh
    expect(res.body.message).toBe('Bạn không có quyền xem kỳ thi này.')
  })

  it('3b. Teacher xem danh sách kỳ thi của mình: Trả về HTTP 200', async () => {
    vi.mocked(prisma.exam.findMany).mockResolvedValueOnce([])

    const res = await request(app)
      .get('/api/v1/exams')
      .set('Authorization', `Bearer ${teacher2Token}`)

    expect(res.status).toBe(200)
    expect(res.body.exams).toEqual([])
  })

  it('4. Mã phòng không tồn tại: Trả về HTTP 404 ROOM_NOT_FOUND', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(studentAccount as any)
    vi.mocked(prisma.exam.findUnique).mockResolvedValueOnce(null)

    const res = await request(app)
      .post('/api/v1/exams/join')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        joinCode: 'EXAM-NON-EXISTENT',
        className: '12A1',
      })

    expect(res.status).toBe(404)
    expect(res.body.error).toBe('ROOM_NOT_FOUND')
  })

  it('4b. Chưa đăng nhập không thể tham gia phòng thi: Trả về HTTP 401', async () => {
    const res = await request(app).post('/api/v1/exams/join').send({
      joinCode: 'EXAM-101',
      className: '12A1',
    })

    expect(res.status).toBe(401)
    expect(prisma.participant.create).not.toHaveBeenCalled()
  })

  it('4c. Giáo viên không thể tham gia phòng thi như thí sinh: Trả về HTTP 403', async () => {
    const res = await request(app)
      .post('/api/v1/exams/join')
      .set('Authorization', `Bearer ${teacher2Token}`)
      .send({
        joinCode: 'EXAM-101',
        className: '12A1',
      })

    expect(res.status).toBe(403)
    expect(res.body.error).toBe('FORBIDDEN')
  })

  it('4d. Token phiên thi (participantToken) không dùng để tham gia phòng khác: Trả về HTTP 403', async () => {
    const participantToken = jwt.sign(
      { sub: 'part-existing-1', role: UserRole.STUDENT, examId: 'exam-101' },
      env.JWT_SECRET
    )
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null)

    const res = await request(app)
      .post('/api/v1/exams/join')
      .set('Authorization', `Bearer ${participantToken}`)
      .send({
        joinCode: 'EXAM-101',
        className: '12A1',
      })

    expect(res.status).toBe(403)
    expect(res.body.error).toBe('STUDENT_ACCOUNT_REQUIRED')
  })

  it('5. Học sinh gửi yêu cầu tham gia hợp lệ: Trả về HTTP 201, trạng thái PENDING và participantToken', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(studentAccount as any)
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

    const res = await request(app)
      .post('/api/v1/exams/join')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        joinCode: 'EXAM-101',
        displayName: 'Tên giả mạo từ client',
        className: '12A1',
      })

    expect(res.status).toBe(201)
    expect(res.body.participantToken).toBeDefined()
    expect(res.body.participant.status).toBe('PENDING')
    expect(res.body.participant.displayName).toBe('Nguyễn Minh Anh')
    // Thí sinh được gắn với tài khoản và lấy họ tên từ tài khoản, bỏ qua tên client gửi lên
    expect(prisma.participant.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: studentUserId,
        displayName: 'Nguyễn Minh Anh',
        className: '12A1',
      }),
    })
  })

  it('8. Hai request tham gia trùng lặp: Tái sử dụng phiên tham gia hiện có, không tạo bản ghi trùng', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(studentAccount as any)
    vi.mocked(prisma.exam.findUnique).mockResolvedValueOnce({
      id: 'exam-101',
      title: 'Kiểm tra Front-end',
      status: ExamStatus.WAITING,
      durationSeconds: 1800,
      joinCode: 'EXAM-101',
    } as any)

    // Tài khoản này đã có yêu cầu tham gia phòng thi
    vi.mocked(prisma.participant.findFirst).mockResolvedValueOnce({
      id: 'part-existing-1',
      examId: 'exam-101',
      userId: studentUserId,
      displayName: 'Nguyễn Minh Anh',
      className: '12A1',
      status: ParticipantStatus.PENDING,
      joinedAt: new Date(),
    } as any)

    const res = await request(app)
      .post('/api/v1/exams/join')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        joinCode: 'EXAM-101',
        className: '12A1',
      })

    expect(res.status).toBe(201)
    expect(prisma.participant.findFirst).toHaveBeenCalledWith({
      where: { examId: 'exam-101', userId: studentUserId },
    })
    expect(prisma.participant.create).not.toHaveBeenCalled()
    expect(res.body.participant.id).toBe('part-existing-1')
  })
})
