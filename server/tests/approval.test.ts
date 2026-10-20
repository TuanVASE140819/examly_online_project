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
    },
    participant: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
    question: {
      findMany: vi.fn(),
    },
  },
}))

describe('Kịch bản 6, 7, 13: Quy trình Phê duyệt Thí sinh & Quyền truy cập Đề', () => {
  const app = createApp()

  const teacherId = 'teacher-101'
  const examId = 'exam-101'
  const participantId = 'part-1'

  const teacherToken = jwt.sign(
    { sub: teacherId, role: UserRole.TEACHER, email: 'gv@examly.vn' },
    env.JWT_SECRET
  )

  const studentPendingToken = jwt.sign(
    { sub: participantId, role: UserRole.STUDENT, examId },
    env.JWT_SECRET
  )

  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('6.3. Không thể đổi trạng thái thí sinh đã nộp bài: Trả về HTTP 409 ALREADY_SUBMITTED', async () => {
    vi.mocked(prisma.exam.findUnique).mockResolvedValueOnce({
      id: examId,
      ownerId: teacherId,
      status: ExamStatus.ACTIVE,
    } as any)

    vi.mocked(prisma.participant.findFirst).mockResolvedValueOnce({
      id: participantId,
      examId,
      status: ParticipantStatus.SUBMITTED,
    } as any)

    const res = await request(app)
      .post(`/api/v1/exams/${examId}/participants/${participantId}/decision`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ decision: 'PENDING' })

    expect(res.status).toBe(409)
    expect(res.body.error).toBe('ALREADY_SUBMITTED')
    expect(prisma.participant.update).not.toHaveBeenCalled()
  })

  it('6.1. Giáo viên duyệt thí sinh: Cập nhật status thành APPROVED', async () => {
    vi.mocked(prisma.exam.findUnique).mockResolvedValueOnce({
      id: examId,
      ownerId: teacherId,
      status: ExamStatus.WAITING,
    } as any)

    vi.mocked(prisma.participant.findFirst).mockResolvedValueOnce({
      id: participantId,
      examId,
      status: ParticipantStatus.PENDING,
    } as any)

    vi.mocked(prisma.participant.update).mockResolvedValueOnce({
      id: participantId,
      status: ParticipantStatus.APPROVED,
      approvedById: teacherId,
      approvedAt: new Date(),
    } as any)

    const res = await request(app)
      .post(`/api/v1/exams/${examId}/participants/${participantId}/decision`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ decision: 'APPROVED' })

    expect(res.status).toBe(200)
    expect(res.body.participant.status).toBe('APPROVED')
    expect(prisma.participant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'APPROVED' }),
      })
    )
  })

  it('6.2. Giáo viên từ chối thí sinh: Cập nhật status thành REJECTED', async () => {
    vi.mocked(prisma.exam.findUnique).mockResolvedValueOnce({
      id: examId,
      ownerId: teacherId,
      status: ExamStatus.WAITING,
    } as any)

    vi.mocked(prisma.participant.findFirst).mockResolvedValueOnce({
      id: participantId,
      examId,
      status: ParticipantStatus.PENDING,
    } as any)

    vi.mocked(prisma.participant.update).mockResolvedValueOnce({
      id: participantId,
      status: ParticipantStatus.REJECTED,
      approvedById: null,
      approvedAt: null,
    } as any)

    const res = await request(app)
      .post(`/api/v1/exams/${examId}/participants/${participantId}/decision`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ decision: 'REJECTED' })

    expect(res.status).toBe(200)
    expect(res.body.participant.status).toBe('REJECTED')
  })

  it('7. Học sinh chưa duyệt không thể lấy đề thi: Trả về HTTP 403 NOT_APPROVED', async () => {
    vi.mocked(prisma.participant.findUnique).mockResolvedValueOnce({
      id: participantId,
      examId,
      status: ParticipantStatus.PENDING, // Vẫn là PENDING
      exam: {
        id: examId,
        status: ExamStatus.ACTIVE,
      },
    } as any)

    const res = await request(app)
      .get(`/api/v1/exams/${examId}/student-questions`)
      .set('Authorization', `Bearer ${studentPendingToken}`)

    expect(res.status).toBe(403)
    expect(res.body.error).toBe('NOT_APPROVED')
  })

  it('13. Học sinh không được truy cập danh sách thí sinh hoặc đề thi của kỳ thi khác: Trả về 403', async () => {
    // Học sinh của exam-101 cố lấy đề của exam-202
    const res = await request(app)
      .get(`/api/v1/exams/exam-202/student-questions`)
      .set('Authorization', `Bearer ${studentPendingToken}`)

    expect(res.status).toBe(403)
    expect(res.body.error).toBe('FORBIDDEN')
  })
})
