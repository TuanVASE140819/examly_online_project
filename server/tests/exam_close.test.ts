import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { prisma } from '../src/lib/prisma.js'
import jwt from 'jsonwebtoken'
import { env } from '../src/config/env.js'
import { ExamStatus, ParticipantStatus, UserRole } from '@prisma/client'
import { ExamsService } from '../src/modules/exams/exams.service.js'
import { SubmissionsService } from '../src/modules/submissions/submissions.service.js'

vi.mock('../src/lib/prisma.js', () => ({
  prisma: {
    exam: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    participant: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  },
}))

describe('Kịch bản 16 & 17: Kết thúc kỳ thi và tự động nộp bài khi hết giờ', () => {
  const app = createApp()

  const teacherId = 'teacher-1111'
  const examId = 'exam-101'
  const teacherToken = jwt.sign({ sub: teacherId, role: UserRole.TEACHER }, env.JWT_SECRET)

  beforeEach(() => {
    vi.resetAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('16. Giáo viên kết thúc kỳ thi: thí sinh đang làm được tự nộp bài, thí sinh chưa vào thi bị đánh dấu vắng', async () => {
    const activeExam = { id: examId, ownerId: teacherId, status: ExamStatus.ACTIVE }
    vi.mocked(prisma.exam.findUnique).mockResolvedValueOnce(activeExam as any).mockResolvedValueOnce(activeExam as any)
    vi.mocked(prisma.exam.update).mockResolvedValueOnce({ ...activeExam, status: ExamStatus.ENDED } as any)
    vi.mocked(prisma.participant.findMany).mockResolvedValueOnce([{ id: 'part-1' }, { id: 'part-2' }] as any)
    vi.mocked(prisma.participant.updateMany).mockResolvedValueOnce({ count: 1 })
    const submitSpy = vi.spyOn(SubmissionsService, 'submitExam').mockResolvedValue({} as any)

    const res = await request(app)
      .post(`/api/v1/exams/${examId}/finish`)
      .set('Authorization', `Bearer ${teacherToken}`)

    expect(res.status).toBe(200)
    expect(res.body.exam.status).toBe('ENDED')
    expect(submitSpy).toHaveBeenCalledTimes(2)
    expect(submitSpy).toHaveBeenCalledWith('part-1', { reason: 'TIMEOUT' })
    expect(submitSpy).toHaveBeenCalledWith('part-2', { reason: 'TIMEOUT' })
    expect(prisma.participant.updateMany).toHaveBeenCalledWith({
      where: { examId, status: ParticipantStatus.APPROVED },
      data: { status: ParticipantStatus.ABSENT },
    })
  })

  it('17. Bắt đầu kỳ thi sẽ hẹn giờ tự động kết thúc đúng thời lượng', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })

    vi.mocked(prisma.exam.findUnique).mockResolvedValueOnce({
      id: examId,
      ownerId: teacherId,
      status: ExamStatus.WAITING,
      durationSeconds: 600,
      _count: { questions: 5 },
    } as any)
    vi.mocked(prisma.exam.update).mockResolvedValueOnce({ id: examId, status: ExamStatus.ACTIVE } as any)
    const closeSpy = vi.spyOn(ExamsService, 'closeExam').mockResolvedValue(null)

    await ExamsService.startExam(teacherId, UserRole.TEACHER, examId)

    await vi.advanceTimersByTimeAsync(599_000)
    expect(closeSpy).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1_000)
    expect(closeSpy).toHaveBeenCalledWith(examId, 'SYSTEM')
  })
})
