import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { prisma } from '../src/lib/prisma.js'
import jwt from 'jsonwebtoken'
import { env } from '../src/config/env.js'
import { ExamStatus, UserRole } from '@prisma/client'

vi.mock('../src/lib/prisma.js', () => ({
  prisma: {
    exam: {
      findUnique: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}))

describe('Kịch bản 18: Nhập đề thi từ file', () => {
  const app = createApp()

  const teacherId = 'teacher-1111'
  const examId = 'exam-101'
  const teacherToken = jwt.sign({ sub: teacherId, role: UserRole.TEACHER }, env.JWT_SECRET)
  const otherTeacherToken = jwt.sign({ sub: 'teacher-2222', role: UserRole.TEACHER }, env.JWT_SECRET)

  const sampleQuestions = [
    {
      topic: 'Địa lý',
      prompt: 'Thủ đô của Việt Nam là gì?',
      options: [
        { text: 'Hà Nội', isCorrect: true, position: 0 },
        { text: 'Huế', isCorrect: false, position: 1 },
      ],
    },
    {
      prompt: '2 + 2 bằng bao nhiêu?',
      options: [
        { text: '3', isCorrect: false, position: 0 },
        { text: '4', isCorrect: true, position: 1 },
        { text: '5', isCorrect: false, position: 2 },
      ],
    },
  ]

  // Transaction giả lập: ghi lại các lệnh và trả về câu hỏi vừa tạo
  const mockTransaction = (maxPosition: number | null) => {
    const tx = {
      question: {
        deleteMany: vi.fn().mockResolvedValue({ count: 5 }),
        aggregate: vi.fn().mockResolvedValue({ _max: { position: maxPosition } }),
        createMany: vi.fn().mockResolvedValue({ count: 2 }),
        findMany: vi.fn().mockImplementation(async () =>
          tx.question.createMany.mock.calls[0][0].data.map((q: any) => ({ ...q, options: [] }))
        ),
      },
      option: {
        createMany: vi.fn().mockResolvedValue({ count: 5 }),
      },
    }
    vi.mocked(prisma.$transaction).mockImplementationOnce(async (callback: any) => callback(tx))
    return tx
  }

  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(prisma.exam.findUnique).mockResolvedValue({ id: examId, ownerId: teacherId, status: ExamStatus.WAITING } as any)
  })

  it('18.1. Thêm câu hỏi từ file vào cuối đề hiện có, đánh số tiếp theo', async () => {
    const tx = mockTransaction(5)

    const res = await request(app)
      .post(`/api/v1/exams/${examId}/questions/import`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ questions: sampleQuestions })

    expect(res.status).toBe(201)
    expect(res.body.imported).toBe(2)
    expect(tx.question.deleteMany).not.toHaveBeenCalled()
    const created = tx.question.createMany.mock.calls[0]![0].data
    expect(created.map((q: any) => q.position)).toEqual([6, 7])
    expect(created[1].topic).toBe('Tổng quát')
    // Phương án gắn đúng câu hỏi và giữ thứ tự
    const options = tx.option.createMany.mock.calls[0]![0].data
    expect(options).toHaveLength(5)
    expect(options.filter((o: any) => o.questionId === created[1].id).map((o: any) => o.text)).toEqual(['3', '4', '5'])
  })

  it('18.2. Thay thế toàn bộ đề: xóa câu hỏi cũ và đánh số lại từ 1', async () => {
    const tx = mockTransaction(5)

    const res = await request(app)
      .post(`/api/v1/exams/${examId}/questions/import`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ replace: true, questions: sampleQuestions })

    expect(res.status).toBe(201)
    expect(res.body.replaced).toBe(true)
    expect(tx.question.deleteMany).toHaveBeenCalledWith({ where: { examId } })
    expect(tx.question.createMany.mock.calls[0]![0].data.map((q: any) => q.position)).toEqual([1, 2])
  })

  it('18.3. Câu hỏi không có hoặc có nhiều hơn 1 đáp án đúng bị từ chối: HTTP 400', async () => {
    const res = await request(app)
      .post(`/api/v1/exams/${examId}/questions/import`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        questions: [
          {
            prompt: 'Câu thiếu đáp án đúng?',
            options: [
              { text: 'A', isCorrect: false, position: 0 },
              { text: 'B', isCorrect: false, position: 1 },
            ],
          },
        ],
      })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('VALIDATION_ERROR')
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('18.4. Không thể nhập câu hỏi khi kỳ thi đã bắt đầu: HTTP 409', async () => {
    vi.mocked(prisma.exam.findUnique).mockResolvedValue({ id: examId, ownerId: teacherId, status: ExamStatus.ACTIVE } as any)

    const res = await request(app)
      .post(`/api/v1/exams/${examId}/questions/import`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ questions: sampleQuestions })

    expect(res.status).toBe(409)
    expect(res.body.error).toBe('INVALID_EXAM_STATE')
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('18.5. Giáo viên khác không thể nhập câu hỏi vào kỳ thi không thuộc quyền: HTTP 403', async () => {
    const res = await request(app)
      .post(`/api/v1/exams/${examId}/questions/import`)
      .set('Authorization', `Bearer ${otherTeacherToken}`)
      .send({ questions: sampleQuestions })

    expect(res.status).toBe(403)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })
})
