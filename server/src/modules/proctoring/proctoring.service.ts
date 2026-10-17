import { ParticipantStatus } from '@prisma/client'
import { prisma } from '../../lib/prisma.js'
import { AppError } from '../../middleware/errorHandler.js'
import { socketEmitter } from '../../sockets/socketEmitter.js'
import type { ProctoringEventInput } from './proctoring.schemas.js'

export class ProctoringService {
  static async recordEvent(participantId: string, data: ProctoringEventInput) {
    const participant = await prisma.participant.findUnique({
      where: { id: participantId },
      include: { exam: true },
    })

    if (!participant) {
      throw new AppError(404, 'PARTICIPANT_NOT_FOUND', 'Không tìm thấy thí sinh.')
    }

    if (participant.status === ParticipantStatus.SUBMITTED) {
      return { ok: true, ignored: true }
    }

    // Ghi nhận sự kiện vào database
    const event = await prisma.proctoringEvent.create({
      data: {
        examId: participant.examId,
        participantId: participant.id,
        eventType: data.eventType,
        metadata: data.metadata as any,
      },
    })

    // Đếm tổng số lần TAB_HIDDEN của thí sinh này
    const totalWarnings = await prisma.proctoringEvent.count({
      where: {
        participantId: participant.id,
        eventType: 'TAB_HIDDEN',
      },
    })

    // Bắn cảnh báo thời gian thực tới giáo viên
    if (data.eventType === 'TAB_HIDDEN') {
      socketEmitter.proctoringWarning(participant.examId, {
        participantId: participant.id,
        displayName: participant.displayName,
        tabWarnings: totalWarnings,
        occurredAt: event.occurredAt.toISOString(),
      })
    }

    return {
      ok: true,
      tabWarnings: totalWarnings,
      eventId: event.id,
    }
  }
}
