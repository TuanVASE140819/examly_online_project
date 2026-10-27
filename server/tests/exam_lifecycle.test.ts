import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { prisma } from '../src/lib/prisma.js'
import jwt from 'jsonwebtoken'
import { env } from '../src/config/env.js'
import { ExamStatus, ParticipantStatus, SubmitReason } from '@prisma/client'

vi.mock('../src/lib/prisma.js', () => ({
  prisma: {
    participant: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    question: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    answer: {
      upsert: vi.fn(),
      findMany: vi.fn(),
    },
    submission: {
      create: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}))

describe('Kịch bản 9, 10, 11, 12, 14, 15: Vòng đời Bài thi, Autosave, Chấm điểm và Bảo mật', () => {
  const app = createApp()

  const participant1Id = 'part-001'
  const examId = 'exam-101'
  const q1Id = 'q-101'
  const optCorrectId = 'opt-102'

  const student1Token = jwt.sign(
    { sub: participant1Id, role: 'STUDENT', examId },
    env.JWT_SECRET
  )

  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('9. Autosave & Khôi phục: Lưu đáp án và đọc lại đầy đủ khi tải lại trang', async () => {
    // 9.1. Lưu đáp án câu 1
    vi.mocked(prisma.participant.findUnique).mockResolvedValueOnce({
      id: participant1Id,
      examId,
      status: ParticipantStatus.APPROVED,
      exam: {
        id: examId,
        status: ExamStatus.ACTIVE,
        endsAt: new Date(Date.now() + 600000),
      },
    } as any)

    vi.mocked(prisma.question.findFirst).mockResolvedValueOnce({
      id: q1Id,
      examId,
    } as any)

    vi.mocked(prisma.participant.update).mockResolvedValueOnce({} as any)

    vi.mocked(prisma.answer.upsert).mockResolvedValueOnce({
      id: 'ans-1',
      participantId: participant1Id,
      questionId: q1Id,
      selectedOptionId: optCorrectId,
      savedAt: new Date(),
    } as any)

    const saveRes = await request(app)
      .put(`/api/v1/submissions/current/answers/${q1Id}`)
      .set('Authorization', `Bearer ${student1Token}`)
      .send({ selectedOptionId: optCorrectId })

    expect(saveRes.status).toBe(200)
    expect(saveRes.body.saved).toBe(true)

    // 9.2. Khôi phục khi F5 (getCurrentSubmission)
    vi.mocked(prisma.participant.findUnique).mockResolvedValueOnce({
      id: participant1Id,
      status: ParticipantStatus.IN_PROGRESS,
      exam: {
        id: examId,
        status: ExamStatus.ACTIVE,
        durationSeconds: 1800,
        endsAt: new Date(Date.now() + 500000),
      },
      submission: null,
      answers: [
        {
          questionId: q1Id,
          selectedOptionId: optCorrectId,
          savedAt: new Date(),
        },
      ],
    } as any)

    const getRes = await request(app)
      .get('/api/v1/submissions/current')
      .set('Authorization', `Bearer ${student1Token}`)

    expect(getRes.status).toBe(200)
    expect(getRes.body.submitted).toBe(false)
    expect(getRes.body.answers[q1Id]).toBe(optCorrectId)
    expect(getRes.body.secondsRemaining).toBeGreaterThan(0)
  })

  it('10. Nộp bài nhiều lần: Idempotency ngăn chặn tạo nhiều kết quả', async () => {
    // Đã có bản ghi submission trước đó
    vi.mocked(prisma.participant.findUnique).mockResolvedValueOnce({
      id: participant1Id,
      examId,
      status: ParticipantStatus.SUBMITTED,
      submission: {
        id: 'sub-existing',
        score: 10,
        reason: SubmitReason.MANUAL,
        submittedAt: new Date(),
      },
      exam: {
        id: examId,
      },
    } as any)

    const res = await request(app)
      .post('/api/v1/submissions/current/submit')
      .set('Authorization', `Bearer ${student1Token}`)
      .send({ reason: 'MANUAL' })

    expect(res.status).toBe(200)
    expect(res.body.alreadySubmitted).toBe(true)
    expect(res.body.submission.id).toBe('sub-existing')
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('11. Lưu đáp án sau khi hết giờ: Trả về HTTP 409 EXAM_TIMEOUT', async () => {
    // Kỳ thi đã quá hạn
    vi.mocked(prisma.participant.findUnique).mockResolvedValueOnce({
      id: participant1Id,
      examId,
      status: ParticipantStatus.IN_PROGRESS,
      exam: {
        id: examId,
        status: ExamStatus.ACTIVE,
        endsAt: new Date(Date.now() - 5000), // Đã hết giờ 5 giây trước
      },
    } as any)

    const res = await request(app)
      .put(`/api/v1/submissions/current/answers/${q1Id}`)
      .set('Authorization', `Bearer ${student1Token}`)
      .send({ selectedOptionId: optCorrectId })

    expect(res.status).toBe(409)
    expect(res.body.error).toBe('EXAM_TIMEOUT')
  })

  it('12b. Thí sinh chưa được duyệt không thể nộp bài: Trả về HTTP 403 NOT_APPROVED', async () => {
    vi.mocked(prisma.participant.findUnique).mockResolvedValueOnce({
      id: participant1Id,
      examId,
      status: ParticipantStatus.PENDING,
      submission: null,
      exam: { id: examId, status: ExamStatus.ACTIVE },
    } as any)

    const res = await request(app)
      .post('/api/v1/submissions/current/submit')
      .set('Authorization', `Bearer ${student1Token}`)
      .send({ reason: 'MANUAL' })

    expect(res.status).toBe(403)
    expect(res.body.error).toBe('NOT_APPROVED')
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('12c. Không thể nộp bài khi kỳ thi chưa bắt đầu: Trả về HTTP 409 EXAM_NOT_ACTIVE', async () => {
    vi.mocked(prisma.participant.findUnique).mockResolvedValueOnce({
      id: participant1Id,
      examId,
      status: ParticipantStatus.APPROVED,
      submission: null,
      exam: { id: examId, status: ExamStatus.WAITING },
    } as any)

    const res = await request(app)
      .post('/api/v1/submissions/current/submit')
      .set('Authorization', `Bearer ${student1Token}`)
      .send({ reason: 'MANUAL' })

    expect(res.status).toBe(409)
    expect(res.body.error).toBe('EXAM_NOT_ACTIVE')
  })

  it('12. Chấm điểm phía server: 4/5 câu đúng được quy đổi chính xác thành 8.0/10', async () => {
    vi.mocked(prisma.participant.findUnique).mockResolvedValueOnce({
      id: participant1Id,
      examId,
      status: ParticipantStatus.IN_PROGRESS,
      submission: null,
      exam: { id: examId, status: ExamStatus.ACTIVE },
    } as any)

    // Giả lập transaction chấm điểm
    const createSubmission = vi.fn().mockResolvedValueOnce({
      id: 'sub-graded',
      score: 8.0,
      correctCount: 4,
      totalQuestions: 5,
      pendingEssays: 0,
      submittedAt: new Date(),
    })
    vi.mocked(prisma.$transaction).mockImplementationOnce(async (callback: any) => {
      const mockTx = {
        question: {
          findMany: vi.fn().mockResolvedValueOnce([
            { id: 'q1', type: 'MULTIPLE_CHOICE', points: 1, options: [{ id: 'opt1-correct' }] },
            { id: 'q2', type: 'MULTIPLE_CHOICE', points: 1, options: [{ id: 'opt2-correct' }] },
            { id: 'q3', type: 'MULTIPLE_CHOICE', points: 1, options: [{ id: 'opt3-correct' }] },
            { id: 'q4', type: 'MULTIPLE_CHOICE', points: 1, options: [{ id: 'opt4-correct' }] },
            { id: 'q5', type: 'MULTIPLE_CHOICE', points: 1, options: [{ id: 'opt5-correct' }] },
          ]),
        },
        answer: {
          findMany: vi.fn().mockResolvedValueOnce([
            { questionId: 'q1', selectedOptionId: 'opt1-correct' }, // Đúng
            { questionId: 'q2', selectedOptionId: 'opt2-correct' }, // Đúng
            { questionId: 'q3', selectedOptionId: 'opt3-correct' }, // Đúng
            { questionId: 'q4', selectedOptionId: 'opt4-correct' }, // Đúng
            { questionId: 'q5', selectedOptionId: 'opt5-WRONG' },   // Sai
          ]),
        },
        submission: {
          create: createSubmission,
        },
        participant: {
          update: vi.fn().mockResolvedValueOnce({}),
        },
        auditLog: {
          create: vi.fn().mockResolvedValueOnce({}),
        },
      }
      return callback(mockTx)
    })

    const res = await request(app)
      .post('/api/v1/submissions/current/submit')
      .set('Authorization', `Bearer ${student1Token}`)
      .send({ reason: 'MANUAL' })

    expect(res.status).toBe(200)
    expect(res.body.submission.score).toBe(8.0)
    expect(res.body.submission.correctCount).toBe(4)
    expect(res.body.submission.totalQuestions).toBe(5)
    // Điểm do server tự tính, không phải giá trị mock trả về
    expect(createSubmission).toHaveBeenCalledWith({
      data: expect.objectContaining({ score: 8, correctCount: 4, totalQuestions: 5, pendingEssays: 0 }),
    })
  })

  it('14 & 15. Server quản lý thời gian thi chính xác, không tin đồng hồ client', async () => {
    const futureEndsAt = new Date(Date.now() + 1200000) // 20 phút nữa

    vi.mocked(prisma.participant.findUnique).mockResolvedValueOnce({
      id: participant1Id,
      status: ParticipantStatus.IN_PROGRESS,
      exam: {
        id: examId,
        status: ExamStatus.ACTIVE,
        durationSeconds: 1800,
        endsAt: futureEndsAt,
      },
      submission: null,
      answers: [],
    } as any)

    const res = await request(app)
      .get('/api/v1/submissions/current')
      .set('Authorization', `Bearer ${student1Token}`)

    expect(res.status).toBe(200)
    expect(res.body.secondsRemaining).toBeGreaterThanOrEqual(1195)
    expect(res.body.secondsRemaining).toBeLessThanOrEqual(1205)
  })
})
