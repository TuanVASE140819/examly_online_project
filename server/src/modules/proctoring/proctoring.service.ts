import { ParticipantStatus } from '@prisma/client'
import { prisma } from '../../lib/prisma.js'
import { AppError } from '../../middleware/errorHandler.js'
import { socketEmitter } from '../../sockets/socketEmitter.js'
import { WARNING_EVENTS, type ProctoringEventInput } from './proctoring.schemas.js'

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

    // Đếm tổng số lượt cảnh báo (rời trang, mở công cụ nhà phát triển) của thí sinh này
    const totalWarnings = await prisma.proctoringEvent.count({
      where: {
        participantId: participant.id,
        eventType: { in: [...WARNING_EVENTS] },
      },
    })

    // Bắn cảnh báo thời gian thực tới giáo viên
    if ((WARNING_EVENTS as readonly string[]).includes(data.eventType)) {
      socketEmitter.proctoringWarning(participant.examId, {
        participantId: participant.id,
        displayName: participant.displayName,
        eventType: data.eventType,
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
