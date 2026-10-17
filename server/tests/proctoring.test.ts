import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { prisma } from '../src/lib/prisma.js'
import jwt from 'jsonwebtoken'
import { env } from '../src/config/env.js'
import { ParticipantStatus } from '@prisma/client'

vi.mock('../src/lib/prisma.js', () => ({
  prisma: {
    participant: {
      findUnique: vi.fn(),
    },
    proctoringEvent: {
      create: vi.fn(),
      count: vi.fn(),
    },
  },
}))

describe('Giai đoạn 9 — Giám sát & Ghi nhận sự kiện chuyển tab (Proctoring)', () => {
  const app = createApp()
  const participantId = 'part-proc-1'
  const examId = 'exam-proc-1'

  const studentToken = jwt.sign(
    { sub: participantId, role: 'STUDENT', examId },
    env.JWT_SECRET
  )

  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('Ghi nhận sự kiện TAB_HIDDEN thành công và cập nhật tabWarnings', async () => {
    vi.mocked(prisma.participant.findUnique).mockResolvedValueOnce({
      id: participantId,
      examId,
      displayName: 'Nguyễn Minh Anh',
      status: ParticipantStatus.IN_PROGRESS,
    } as any)

    vi.mocked(prisma.proctoringEvent.create).mockResolvedValueOnce({
      id: 'event-1',
      examId,
      participantId,
      eventType: 'TAB_HIDDEN',
      occurredAt: new Date(),
    } as any)

    vi.mocked(prisma.proctoringEvent.count).mockResolvedValueOnce(3)

    const res = await request(app)
      .post('/api/v1/proctoring/events')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        eventType: 'TAB_HIDDEN',
        metadata: { timestamp: Date.now() },
      })

    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.tabWarnings).toBe(3)
  })
})
