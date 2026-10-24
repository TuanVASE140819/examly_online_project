import { ExamStatus, ParticipantStatus, UserRole } from '@prisma/client'
import { prisma } from '../../lib/prisma.js'
import { logger } from '../../lib/logger.js'
import { generateJoinCode, hashJoinCode } from '../../lib/crypto.js'
import { normalizeIp } from '../../lib/network.js'
import { AppError } from '../../middleware/errorHandler.js'
import { socketEmitter } from '../../sockets/socketEmitter.js'
import { SubmissionsService } from '../submissions/submissions.service.js'
import type { CreateExamInput, NetworkPolicyInput, UpdateExamInput } from './exams.schemas.js'

// Hẹn giờ tự động kết thúc kỳ thi khi hết thời gian (theo examId)
const autoFinishTimers = new Map<string, NodeJS.Timeout>()

function clearAutoFinish(examId: string) {
  const timer = autoFinishTimers.get(examId)
  if (timer) {
    clearTimeout(timer)
    autoFinishTimers.delete(examId)
  }
}

function scheduleAutoFinish(examId: string, endsAt: Date) {
  clearAutoFinish(examId)
  const delay = Math.max(0, endsAt.getTime() - Date.now())
  const timer = setTimeout(() => {
    autoFinishTimers.delete(examId)
    ExamsService.closeExam(examId, 'SYSTEM').catch((err) => {
      logger.error({ err, examId }, 'Tự động kết thúc kỳ thi thất bại')
    })
  }, delay)
  timer.unref()
  autoFinishTimers.set(examId, timer)
}

export class ExamsService {
  static async createExam(userId: string, data: CreateExamInput) {
    let joinCode = generateJoinCode()
    let joinCodeHash = hashJoinCode(joinCode)

    // Đảm bảo không trùng mã phòng
    let retry = 0
    while ((await prisma.exam.findUnique({ where: { joinCodeHash } })) && retry < 5) {
      joinCode = generateJoinCode()
      joinCodeHash = hashJoinCode(joinCode)
      retry++
    }

    const exam = await prisma.exam.create({
      data: {
        ownerId: userId,
        title: data.title,
        description: data.description,
        joinCode,
        joinCodeHash,
        durationSeconds: data.durationMinutes * 60,
        status: ExamStatus.WAITING,
      },
    })

    await prisma.auditLog.create({
      data: {
        examId: exam.id,
        actorId: userId,
        action: 'EXAM_CREATED',
        metadata: { title: exam.title, joinCode },
      },
    })

    return {
      exam: {
        id: exam.id,
        title: exam.title,
        description: exam.description,
        joinCode: exam.joinCode,
        status: exam.status,
        durationMinutes: Math.round(exam.durationSeconds / 60),
        durationSeconds: exam.durationSeconds,
        allowExternalNetwork: exam.allowExternalNetwork,
        createdAt: exam.createdAt,
      },
    }
  }

  static async listTeacherExams(userId: string, role: UserRole) {
    const where = role === UserRole.ADMIN ? {} : { ownerId: userId }

    const exams = await prisma.exam.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            participants: true,
            questions: true,
          },
        },
      },
    })

    return {
      exams: exams.map((e) => ({
        id: e.id,
        title: e.title,
        description: e.description,
        joinCode: e.joinCode,
        status: e.status,
        durationMinutes: Math.round(e.durationSeconds / 60),
        durationSeconds: e.durationSeconds,
        participantCount: e._count.participants,
        questionCount: e._count.questions,
        allowExternalNetwork: e.allowExternalNetwork,
        teacherNetworkIp: e.teacherNetworkIp,
        createdAt: e.createdAt,
        startsAt: e.startsAt,
        endsAt: e.endsAt,
      })),
    }
  }

  static async getExamById(userId: string, role: UserRole, examId: string) {
    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      include: {
        _count: {
          select: {
            participants: true,
            questions: true,
          },
        },
      },
    })

    if (!exam) {
      throw new AppError(404, 'EXAM_NOT_FOUND', 'Không tìm thấy kỳ thi.')
    }

    if (role !== UserRole.ADMIN && exam.ownerId !== userId) {
      throw new AppError(403, 'FORBIDDEN', 'Bạn không có quyền xem kỳ thi này.')
    }

    return {
      exam: {
        id: exam.id,
        title: exam.title,
        description: exam.description,
        joinCode: exam.joinCode,
        status: exam.status,
        durationMinutes: Math.round(exam.durationSeconds / 60),
        durationSeconds: exam.durationSeconds,
        participantCount: exam._count.participants,
        questionCount: exam._count.questions,
        allowExternalNetwork: exam.allowExternalNetwork,
        teacherNetworkIp: exam.teacherNetworkIp,
        startsAt: exam.startsAt,
        endsAt: exam.endsAt,
        createdAt: exam.createdAt,
      },
    }
  }

  static async updateExam(userId: string, role: UserRole, examId: string, data: UpdateExamInput) {
    const exam = await prisma.exam.findUnique({ where: { id: examId } })
    if (!exam) {
      throw new AppError(404, 'EXAM_NOT_FOUND', 'Không tìm thấy kỳ thi.')
    }

    if (role !== UserRole.ADMIN && exam.ownerId !== userId) {
      throw new AppError(403, 'FORBIDDEN', 'Bạn không có quyền sửa kỳ thi này.')
    }

    if (exam.status !== ExamStatus.WAITING && exam.status !== ExamStatus.DRAFT) {
      throw new AppError(409, 'INVALID_EXAM_STATE', 'Chỉ có thể sửa khi kỳ thi đang ở trạng thái chờ.')
    }

    const updated = await prisma.exam.update({
      where: { id: examId },
      data: {
        title: data.title,
        description: data.description,
        durationSeconds: data.durationMinutes ? data.durationMinutes * 60 : undefined,
      },
    })

    return { exam: updated }
  }

  // Cho phép đổi cả khi kỳ thi đang diễn ra (ví dụ mở cho học sinh ở nhà vào thi muộn).
  // Khi khóa mạng, ghi nhận IP hiện tại của giáo viên làm "mạng của lớp".
  static async setNetworkPolicy(userId: string, role: UserRole, examId: string, data: NetworkPolicyInput, clientIp?: string) {
    const exam = await prisma.exam.findUnique({ where: { id: examId }, select: { id: true, ownerId: true, status: true } })
    if (!exam) {
      throw new AppError(404, 'EXAM_NOT_FOUND', 'Không tìm thấy kỳ thi.')
    }

    if (role !== UserRole.ADMIN && exam.ownerId !== userId) {
      throw new AppError(403, 'FORBIDDEN', 'Bạn không có quyền sửa kỳ thi này.')
    }

    if (exam.status === ExamStatus.ENDED || exam.status === ExamStatus.CANCELLED) {
      throw new AppError(409, 'INVALID_EXAM_STATE', 'Kỳ thi đã kết thúc, không thể đổi chế độ mạng.')
    }

    const updated = await prisma.exam.update({
      where: { id: examId },
      data: {
        allowExternalNetwork: data.allowExternalNetwork,
        teacherNetworkIp: data.allowExternalNetwork ? null : normalizeIp(clientIp),
      },
      select: { id: true, allowExternalNetwork: true, teacherNetworkIp: true },
    })

    await prisma.auditLog.create({
      data: {
        examId,
        actorId: userId,
        action: 'EXAM_NETWORK_POLICY_CHANGED',
        metadata: { allowExternalNetwork: updated.allowExternalNetwork, teacherNetworkIp: updated.teacherNetworkIp },
      },
    })

    return { exam: updated }
  }

  static async startExam(userId: string, role: UserRole, examId: string) {
    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      include: { _count: { select: { questions: true } } },
    })

    if (!exam) {
      throw new AppError(404, 'EXAM_NOT_FOUND', 'Không tìm thấy kỳ thi.')
    }

    if (role !== UserRole.ADMIN && exam.ownerId !== userId) {
      throw new AppError(403, 'FORBIDDEN', 'Bạn không có quyền bắt đầu kỳ thi này.')
    }

    if (exam.status === ExamStatus.ACTIVE) {
      throw new AppError(409, 'ALREADY_ACTIVE', 'Kỳ thi đã đang diễn ra.')
    }

    if (exam.status === ExamStatus.ENDED || exam.status === ExamStatus.CANCELLED) {
      throw new AppError(409, 'EXAM_CLOSED', 'Kỳ thi đã kết thúc hoặc bị hủy.')
    }

    if (exam._count.questions === 0) {
      throw new AppError(400, 'NO_QUESTIONS', 'Kỳ thi chưa có câu hỏi nào để bắt đầu.')
    }

    const now = new Date()
    const endsAt = new Date(now.getTime() + exam.durationSeconds * 1000)

    const updated = await prisma.exam.update({
      where: { id: examId },
      data: {
        status: ExamStatus.ACTIVE,
        startsAt: now,
        endsAt,
      },
    })

    // Phát sự kiện realtime
    socketEmitter.examStarted(exam.id, {
      startsAt: now.toISOString(),
      endsAt: endsAt.toISOString(),
      durationSeconds: exam.durationSeconds,
    })

    await prisma.auditLog.create({
      data: {
        examId: exam.id,
        actorId: userId,
        action: 'EXAM_STARTED',
        metadata: { startsAt: now, endsAt },
      },
    })

    scheduleAutoFinish(exam.id, endsAt)

    return { exam: updated }
  }

  static async finishExam(userId: string, role: UserRole, examId: string) {
    const exam = await prisma.exam.findUnique({ where: { id: examId } })
    if (!exam) {
      throw new AppError(404, 'EXAM_NOT_FOUND', 'Không tìm thấy kỳ thi.')
    }

    if (role !== UserRole.ADMIN && exam.ownerId !== userId) {
      throw new AppError(403, 'FORBIDDEN', 'Bạn không có quyền kết thúc kỳ thi này.')
    }

    if (exam.status === ExamStatus.ENDED) {
      return { exam }
    }

    const updated = await ExamsService.closeExam(examId, userId)
    return { exam: updated ?? exam }
  }

  // Đóng kỳ thi (giáo viên bấm kết thúc hoặc hết giờ):
  // - Thí sinh đang làm bài được tự động nộp và chấm điểm (TIMEOUT)
  // - Thí sinh đã duyệt nhưng chưa vào làm bài bị đánh dấu vắng (ABSENT)
  static async closeExam(examId: string, actorId: string) {
    clearAutoFinish(examId)

    const exam = await prisma.exam.findUnique({ where: { id: examId } })
    if (!exam || exam.status === ExamStatus.ENDED || exam.status === ExamStatus.CANCELLED) {
      return exam
    }

    const now = new Date()
    const updated = await prisma.exam.update({
      where: { id: examId },
      data: {
        status: ExamStatus.ENDED,
        endsAt: now,
      },
    })

    const inProgress = await prisma.participant.findMany({
      where: { examId, status: ParticipantStatus.IN_PROGRESS },
      select: { id: true },
    })

    for (const p of inProgress) {
      try {
        await SubmissionsService.submitExam(p.id, { reason: 'TIMEOUT' })
      } catch (err) {
        logger.error({ err, examId, participantId: p.id }, 'Không thể tự động nộp bài cho thí sinh')
      }
    }

    await prisma.participant.updateMany({
      where: { examId, status: ParticipantStatus.APPROVED },
      data: { status: ParticipantStatus.ABSENT },
    })

    // Phát sau khi đã chấm xong để client tải được kết quả cuối cùng
    socketEmitter.examEnded(examId, now.toISOString())

    await prisma.auditLog.create({
      data: {
        examId,
        actorId,
        action: 'EXAM_ENDED',
        metadata: { endedAt: now, autoSubmitted: inProgress.length },
      },
    })

    return updated
  }

  // Khôi phục hẹn giờ tự kết thúc cho các kỳ thi đang diễn ra khi server khởi động lại
  static async resumeAutoFinish() {
    const active = await prisma.exam.findMany({
      where: { status: ExamStatus.ACTIVE, endsAt: { not: null } },
      select: { id: true, endsAt: true },
    })

    for (const exam of active) {
      scheduleAutoFinish(exam.id, exam.endsAt!)
    }

    if (active.length) {
      logger.info(`Đã khôi phục hẹn giờ tự kết thúc cho ${active.length} kỳ thi đang diễn ra`)
    }
  }
}
