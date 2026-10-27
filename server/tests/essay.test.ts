import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { ExamStatus, ParticipantStatus, QuestionType, UserRole } from '@prisma/client'
import { createApp } from '../src/app.js'
import { prisma } from '../src/lib/prisma.js'
import { env } from '../src/config/env.js'
import { gradeAnswers } from '../src/modules/submissions/grading.js'

vi.mock('../src/lib/prisma.js', () => ({
  prisma: {
    exam: { findUnique: vi.fn() },
    question: { create: vi.fn(), aggregate: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
    participant: { findUnique: vi.fn(), update: vi.fn() },
    answer: { upsert: vi.fn(), findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    submission: { create: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}))

const MCQ = QuestionType.MULTIPLE_CHOICE
const ESSAY = QuestionType.ESSAY

describe('Câu hỏi tự luận: soạn đề, làm bài, chấm điểm', () => {
  const app = createApp()

  const examId = 'exam-essay-1'
  const teacherId = 'teacher-essay-1'
  const participantId = 'part-essay-1'
  const teacherToken = jwt.sign({ sub: teacherId, role: UserRole.TEACHER }, env.JWT_SECRET)
  const otherTeacherToken = jwt.sign({ sub: 'teacher-essay-2', role: UserRole.TEACHER }, env.JWT_SECRET)
  const participantToken = jwt.sign({ sub: participantId, role: UserRole.STUDENT, examId }, env.JWT_SECRET)

  // Đề: 2 câu trắc nghiệm (1 điểm) + 1 câu tự luận (2 điểm) => tổng 4 điểm
  const questions = [
    { id: 'q1', type: MCQ, points: 1, options: [{ id: 'q1-correct' }] },
    { id: 'q2', type: MCQ, points: 1, options: [{ id: 'q2-correct' }] },
    { id: 'q3', type: ESSAY, points: 2, options: [] },
  ]

  const activeParticipant = {
    id: participantId,
    examId,
    status: ParticipantStatus.IN_PROGRESS,
    submission: null,
    exam: { id: examId, status: ExamStatus.ACTIVE, endsAt: new Date(Date.now() + 600000) },
  }

  beforeEach(() => {
    vi.resetAllMocks()
    // Transaction chạy thẳng trên client giả lập
    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => callback(prisma))
  })

  it('Tính điểm theo số điểm từng câu: tự luận chưa chấm thì chưa có điểm, bỏ trống tính 0', () => {
    const answers = [
      { questionId: 'q1', selectedOptionId: 'q1-correct' },
      { questionId: 'q2', selectedOptionId: 'q2-wrong' },
      { questionId: 'q3', selectedOptionId: null, textAnswer: 'Bài làm', awardedPoints: null },
    ]
    expect(gradeAnswers(questions, answers)).toEqual({ score: null, correctCount: 1, totalQuestions: 2, pendingEssays: 1 })

    answers[2]!.awardedPoints = 1.5 as any
    // (1 + 1.5) / 4 * 10 = 6.25 -> 6.3
    expect(gradeAnswers(questions, answers)).toEqual({ score: 6.3, correctCount: 1, totalQuestions: 2, pendingEssays: 0 })

    // Câu tự luận bỏ trống: không phải chờ chấm, được 0 điểm
    const blank = [{ questionId: 'q1', selectedOptionId: 'q1-correct' }, { questionId: 'q3', selectedOptionId: null, textAnswer: '   ' }]
    expect(gradeAnswers(questions, blank)).toEqual({ score: 2.5, correctCount: 1, totalQuestions: 2, pendingEssays: 0 })
  })

  it('Giáo viên tạo câu tự luận không cần phương án; câu trắc nghiệm thiếu phương án bị từ chối', async () => {
    vi.mocked(prisma.exam.findUnique).mockResolvedValue({ id: examId, ownerId: teacherId, status: ExamStatus.WAITING } as any)
    vi.mocked(prisma.question.aggregate).mockResolvedValue({ _max: { position: 2 } } as any)
    vi.mocked(prisma.question.create).mockResolvedValueOnce({ id: 'q-new', type: ESSAY, options: [] } as any)

    const essay = await request(app)
      .post(`/api/v1/exams/${examId}/questions`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ type: 'ESSAY', prompt: 'Trình bày cảm nhận về bài thơ Sóng.', points: 3 })

    expect(essay.status).toBe(201)
    expect(prisma.question.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'ESSAY', points: 3, position: 3, options: undefined }) })
    )

    const mcqWithoutOptions = await request(app)
      .post(`/api/v1/exams/${examId}/questions`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ prompt: 'Câu trắc nghiệm thiếu phương án?' })

    expect(mcqWithoutOptions.status).toBe(400)
  })

  it('Học sinh lưu bài làm tự luận dạng văn bản; gửi phương án cho câu tự luận bị từ chối', async () => {
    vi.mocked(prisma.participant.findUnique).mockResolvedValue(activeParticipant as any)
    vi.mocked(prisma.question.findFirst).mockResolvedValue({ id: 'q3', examId, type: ESSAY } as any)
    vi.mocked(prisma.answer.upsert).mockResolvedValueOnce({ savedAt: new Date() } as any)

    const saved = await request(app)
      .put('/api/v1/submissions/current/answers/q3')
      .set('Authorization', `Bearer ${participantToken}`)
      .send({ textAnswer: 'Sóng là bài thơ về tình yêu...' })

    expect(saved.status).toBe(200)
    expect(prisma.answer.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { textAnswer: 'Sóng là bài thơ về tình yêu...' } })
    )

    const wrongKind = await request(app)
      .put('/api/v1/submissions/current/answers/q3')
      .set('Authorization', `Bearer ${participantToken}`)
      .send({ selectedOptionId: 'some-option' })

    expect(wrongKind.status).toBe(400)
    expect(wrongKind.body.error).toBe('INVALID_ANSWER')
  })

  it('Nộp bài có câu tự luận: trắc nghiệm chấm ngay, điểm tổng chờ giáo viên chấm', async () => {
    vi.mocked(prisma.participant.findUnique).mockResolvedValueOnce(activeParticipant as any)
    vi.mocked(prisma.question.findMany).mockResolvedValueOnce(questions as any)
    vi.mocked(prisma.answer.findMany).mockResolvedValueOnce([
      { questionId: 'q1', selectedOptionId: 'q1-correct', textAnswer: null, awardedPoints: null },
      { questionId: 'q3', selectedOptionId: null, textAnswer: 'Bài làm tự luận', awardedPoints: null },
    ] as any)
    vi.mocked(prisma.submission.create).mockResolvedValueOnce({ id: 'sub-1', score: null, pendingEssays: 1, submittedAt: new Date() } as any)

    const res = await request(app)
      .post('/api/v1/submissions/current/submit')
      .set('Authorization', `Bearer ${participantToken}`)
      .send({ reason: 'MANUAL' })

    expect(res.status).toBe(200)
    expect(prisma.submission.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ score: null, correctCount: 1, totalQuestions: 2, pendingEssays: 1, gradedAt: null }),
    })
  })

  describe('Giáo viên chấm câu tự luận', () => {
    const essayAnswer = (overrides: Record<string, unknown> = {}) => ({
      id: 'answer-q3',
      textAnswer: 'Bài làm tự luận',
      question: { id: 'q3', examId, type: ESSAY, points: 2 },
      participant: { id: participantId, examId, submission: { id: 'sub-1' } },
      ...overrides,
    })

    const grade = (points: number, token = teacherToken) =>
      request(app)
        .put(`/api/v1/exams/${examId}/participants/${participantId}/answers/q3/grade`)
        .set('Authorization', `Bearer ${token}`)
        .send({ points })

    beforeEach(() => {
      vi.mocked(prisma.exam.findUnique).mockResolvedValue({ ownerId: teacherId } as any)
    })

    it('Chấm xong câu tự luận cuối cùng thì bài có điểm chính thức', async () => {
      vi.mocked(prisma.answer.findUnique).mockResolvedValueOnce(essayAnswer() as any)
      vi.mocked(prisma.question.findMany).mockResolvedValueOnce(questions as any)
      vi.mocked(prisma.answer.findMany).mockResolvedValueOnce([
        { questionId: 'q1', selectedOptionId: 'q1-correct' },
        { questionId: 'q2', selectedOptionId: 'q2-correct' },
        { questionId: 'q3', selectedOptionId: null, textAnswer: 'Bài làm tự luận', awardedPoints: 1.5 },
      ] as any)
      vi.mocked(prisma.submission.update).mockResolvedValueOnce({ id: 'sub-1', score: 8.8, pendingEssays: 0 } as any)

      const res = await grade(1.5)

      expect(res.status).toBe(200)
      expect(prisma.answer.update).toHaveBeenCalledWith({ where: { id: 'answer-q3' }, data: { awardedPoints: 1.5 } })
      // (1 + 1 + 1.5) / 4 * 10 = 8.75 -> 8.8
      expect(prisma.submission.update).toHaveBeenCalledWith({
        where: { participantId },
        data: expect.objectContaining({ score: 8.8, pendingEssays: 0, gradedAt: expect.any(Date) }),
      })
    })

    it('Từ chối điểm vượt quá số điểm của câu, câu trắc nghiệm và bài chưa nộp', async () => {
      vi.mocked(prisma.answer.findUnique).mockResolvedValueOnce(essayAnswer() as any)
      const tooMany = await grade(2.5)
      expect(tooMany.status).toBe(400)
      expect(tooMany.body.error).toBe('POINTS_EXCEEDED')

      vi.mocked(prisma.answer.findUnique).mockResolvedValueOnce(essayAnswer({ question: { id: 'q1', examId, type: MCQ, points: 1 } }) as any)
      const mcq = await grade(1)
      expect(mcq.body.error).toBe('NOT_ESSAY')

      vi.mocked(prisma.answer.findUnique).mockResolvedValueOnce(
        essayAnswer({ participant: { id: participantId, examId, submission: null } }) as any
      )
      const notSubmitted = await grade(1)
      expect(notSubmitted.status).toBe(409)

      expect(prisma.submission.update).not.toHaveBeenCalled()
    })

    it('Giáo viên khác và học sinh không chấm được bài', async () => {
      const other = await grade(1, otherTeacherToken)
      expect(other.status).toBe(403)

      const student = await grade(2, participantToken)
      expect(student.status).toBe(403)

      expect(prisma.answer.update).not.toHaveBeenCalled()
    })
  })
})
