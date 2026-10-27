import jwt from 'jsonwebtoken'
import { ExamStatus, ParticipantStatus, UserRole } from '@prisma/client'
import { prisma } from '../../lib/prisma.js'
import { env } from '../../config/env.js'
import { hashJoinCode } from '../../lib/crypto.js'
import { isSameNetworkAsTeacher, networkNotAllowedError } from '../../lib/network.js'
import { AppError } from '../../middleware/errorHandler.js'
import { socketEmitter } from '../../sockets/socketEmitter.js'
import type { DecisionInput, JoinRoomInput } from './participants.schemas.js'

export class ParticipantsService {
  static async joinRoom(userId: string, data: JoinRoomInput, clientIp?: string) {
    // Token phiên thi (participantToken) cũng mang role STUDENT nhưng sub là participantId,
    // nên phải đối chiếu với bảng users để chắc chắn đây là tài khoản học sinh thật.
    const account = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, displayName: true, role: true },
    })

    if (!account || account.role !== UserRole.STUDENT) {
      throw new AppError(403, 'STUDENT_ACCOUNT_REQUIRED', 'Vui lòng đăng nhập bằng tài khoản học sinh để tham gia phòng thi.')
    }

    const joinCodeHash = hashJoinCode(data.joinCode)

    const exam = await prisma.exam.findUnique({
      where: { joinCodeHash },
      select: {
        id: true,
        title: true,
        status: true,
        durationSeconds: true,
        joinCode: true,
        allowExternalNetwork: true,
        teacherNetworkIp: true,
      },
    })

    if (!exam) {
      throw new AppError(404, 'ROOM_NOT_FOUND', 'Mã phòng không chính xác. Hãy kiểm tra lại với giáo viên.')
    }

    if (exam.status === ExamStatus.ENDED || exam.status === ExamStatus.CANCELLED) {
      throw new AppError(409, 'EXAM_CLOSED', 'Kỳ thi đã kết thúc hoặc không còn nhận học sinh.')
    }

    if (!exam.allowExternalNetwork && !isSameNetworkAsTeacher(clientIp, exam.teacherNetworkIp)) {
      throw networkNotAllowedError()
    }

    // Kiểm tra xem tài khoản này đã gửi yêu cầu vào phòng trước đó chưa (tránh trùng lặp)
    let participant = await prisma.participant.findFirst({
      where: {
        examId: exam.id,
        userId: account.id,
      },
    })

    if (!participant) {
      participant = await prisma.participant.create({
        data: {
          examId: exam.id,
          userId: account.id,
          displayName: account.displayName,
          className: data.className,
          status: ParticipantStatus.PENDING,
        },
      })

      // Thông báo cho giáo viên có học sinh mới xin vào
      socketEmitter.participantRequested(exam.id, {
        id: participant.id,
        displayName: participant.displayName,
        className: participant.className,
        status: participant.status,
        joinedAt: participant.joinedAt.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        tabWarnings: 0,
      })
    }

    // Ký JWT Token riêng cho phiên làm bài của thí sinh
    const participantToken = jwt.sign(
      {
        sub: participant.id,
        role: UserRole.STUDENT,
        examId: exam.id,
        displayName: participant.displayName,
      },
      env.JWT_SECRET,
      { expiresIn: '1d' }
    )

    return {
      participantToken,
      participant: {
        id: participant.id,
        examId: participant.examId,
        displayName: participant.displayName,
        className: participant.className,
        status: participant.status,
        joinedAt: participant.joinedAt,
      },
      exam: {
        id: exam.id,
        title: exam.title,
        status: exam.status,
        durationMinutes: Math.round(exam.durationSeconds / 60),
      },
    }
  }

  static async getExamParticipants(userId: string, role: UserRole, examId: string) {
    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      select: { id: true, ownerId: true },
    })

    if (!exam) {
      throw new AppError(404, 'EXAM_NOT_FOUND', 'Không tìm thấy kỳ thi.')
    }

    if (role !== UserRole.ADMIN && exam.ownerId !== userId) {
      throw new AppError(403, 'FORBIDDEN', 'Bạn không có quyền xem danh sách thí sinh của kỳ thi này.')
    }

    const participants = await prisma.participant.findMany({
      where: { examId },
      orderBy: { joinedAt: 'asc' },
      include: {
        submission: {
          select: { score: true, submittedAt: true, pendingEssays: true },
        },
        _count: {
          select: {
            events: {
              where: { eventType: 'TAB_HIDDEN' },
            },
          },
        },
      },
    })

    return {
      participants: participants.map((p) => ({
        id: p.id,
        name: p.displayName,
        className: p.className,
        roomCode: exam.id,
        status: p.status.toLowerCase(),
        rawStatus: p.status,
        joinedAt: p.joinedAt.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        tabWarnings: p._count.events,
        score: p.submission?.score ?? undefined,
        pendingEssays: p.submission?.pendingEssays ?? 0,
      })),
    }
  }

  static async decideParticipant(
    userId: string,
    role: UserRole,
    examId: string,
    participantId: string,
    data: DecisionInput
  ) {
    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      select: { id: true, ownerId: true, status: true },
    })

    if (!exam) {
      throw new AppError(404, 'EXAM_NOT_FOUND', 'Không tìm thấy kỳ thi.')
    }

    if (role !== UserRole.ADMIN && exam.ownerId !== userId) {
      throw new AppError(403, 'FORBIDDEN', 'Bạn không có quyền duyệt thí sinh của kỳ thi này.')
    }

    const participant = await prisma.participant.findFirst({
      where: { id: participantId, examId },
    })

    if (!participant) {
      throw new AppError(404, 'PARTICIPANT_NOT_FOUND', 'Không tìm thấy thí sinh.')
    }

    if (exam.status === ExamStatus.ENDED || exam.status === ExamStatus.CANCELLED) {
      throw new AppError(409, 'EXAM_CLOSED', 'Kỳ thi đã kết thúc, không thể thay đổi trạng thái thí sinh.')
    }

    if (participant.status === ParticipantStatus.SUBMITTED) {
      throw new AppError(409, 'ALREADY_SUBMITTED', 'Thí sinh đã nộp bài, không thể thay đổi trạng thái.')
    }

    const nextStatus =
      data.decision === 'APPROVED'
        ? ParticipantStatus.APPROVED
        : data.decision === 'REJECTED'
        ? ParticipantStatus.REJECTED
        : ParticipantStatus.PENDING

    const updated = await prisma.participant.update({
      where: { id: participantId },
      data: {
        status: nextStatus,
        approvedById: nextStatus === ParticipantStatus.APPROVED ? userId : null,
        approvedAt: nextStatus === ParticipantStatus.APPROVED ? new Date() : null,
      },
    })

    // Phát sự kiện realtime tới học sinh và giáo viên
    if (nextStatus === ParticipantStatus.APPROVED) {
      socketEmitter.participantApproved(examId, participant.id, updated.approvedAt?.toISOString() ?? new Date().toISOString())
    } else if (nextStatus === ParticipantStatus.REJECTED) {
      socketEmitter.participantRejected(examId, participant.id)
    } else {
      socketEmitter.participantStatusChanged(examId, participant.id, nextStatus)
    }

    await prisma.auditLog.create({
      data: {
        examId,
        actorId: userId,
        action: `PARTICIPANT_${data.decision}`,
        metadata: { participantId },
      },
    })

    return { participant: updated }
  }

  static async getMyStatus(participantId: string) {
    const participant = await prisma.participant.findUnique({
      where: { id: participantId },
      include: {
        exam: {
          select: {
            id: true,
            title: true,
            joinCode: true,
            status: true,
            durationSeconds: true,
            startsAt: true,
            endsAt: true,
          },
        },
        submission: {
          select: { score: true, submittedAt: true, pendingEssays: true },
        },
        _count: {
          select: {
            events: {
              where: { eventType: 'TAB_HIDDEN' },
            },
          },
        },
      },
    })

    if (!participant) {
      throw new AppError(404, 'PARTICIPANT_NOT_FOUND', 'Không tìm thấy phiên thí sinh.')
    }

    let secondsRemaining = participant.exam.durationSeconds
    if (participant.exam.endsAt) {
      const msLeft = new Date(participant.exam.endsAt).getTime() - Date.now()
      secondsRemaining = Math.max(0, Math.floor(msLeft / 1000))
    }

    return {
      participant: {
        id: participant.id,
        displayName: participant.displayName,
        className: participant.className,
        status: participant.status,
        examStatus: participant.exam.status,
        startsAt: participant.exam.startsAt,
        endsAt: participant.exam.endsAt,
        secondsRemaining,
        tabWarnings: participant._count.events,
        score: participant.submission?.score,
      },
      exam: participant.exam,
    }
  }
}
