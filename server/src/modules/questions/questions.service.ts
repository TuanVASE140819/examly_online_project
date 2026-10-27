import { randomUUID } from 'node:crypto'
import { ExamStatus, ParticipantStatus, UserRole } from '@prisma/client'
import { prisma } from '../../lib/prisma.js'
import { AppError } from '../../middleware/errorHandler.js'
import type { CreateQuestionInput, ImportQuestionsInput } from './questions.schemas.js'

export class QuestionsService {
  // Dành cho giáo viên: Trả về đầy đủ câu hỏi và cờ isCorrect
  static async getQuestionsForTeacher(userId: string, role: UserRole, examId: string) {
    const exam = await prisma.exam.findUnique({ where: { id: examId } })
    if (!exam) {
      throw new AppError(404, 'EXAM_NOT_FOUND', 'Không tìm thấy kỳ thi.')
    }

    if (role !== UserRole.ADMIN && exam.ownerId !== userId) {
      throw new AppError(403, 'FORBIDDEN', 'Bạn không có quyền xem câu hỏi của kỳ thi này.')
    }

    const questions = await prisma.question.findMany({
      where: { examId },
      orderBy: { position: 'asc' },
      include: {
        options: {
          orderBy: { position: 'asc' },
        },
      },
    })

    return { questions }
  }

  // Dành cho học sinh: Tuyệt đối KHÔNG trả về isCorrect
  static async getQuestionsForStudent(participantId: string, examId: string) {
    const participant = await prisma.participant.findUnique({
      where: { id: participantId },
      include: { exam: true },
    })

    if (!participant || participant.examId !== examId) {
      throw new AppError(403, 'FORBIDDEN', 'Bạn không thuộc kỳ thi này.')
    }

    if (participant.status !== ParticipantStatus.APPROVED && participant.status !== ParticipantStatus.IN_PROGRESS) {
      throw new AppError(403, 'NOT_APPROVED', 'Bạn chưa được duyệt để xem đề thi.')
    }

    if (participant.exam.status !== ExamStatus.ACTIVE) {
      throw new AppError(409, 'EXAM_NOT_ACTIVE', 'Kỳ thi chưa bắt đầu hoặc đã kết thúc.')
    }

    // Đổi trạng thái sang IN_PROGRESS nếu mới là APPROVED
    if (participant.status === ParticipantStatus.APPROVED) {
      await prisma.participant.update({
        where: { id: participantId },
        data: { status: ParticipantStatus.IN_PROGRESS },
      })
    }

    const questions = await prisma.question.findMany({
      where: { examId },
      orderBy: { position: 'asc' },
      select: {
        id: true,
        type: true,
        topic: true,
        prompt: true,
        position: true,
        points: true,
        options: {
          orderBy: { position: 'asc' },
          select: {
            id: true,
            text: true,
            position: true,
            // isCorrect bị LOẠI BỎ hoàn toàn!
          },
        },
      },
    })

    return {
      questions: questions.map((q) => ({
        id: q.id,
        type: q.type,
        topic: q.topic,
        text: q.prompt,
        points: q.points,
        position: q.position,
        options: q.options.map((opt) => ({
          id: opt.id,
          text: opt.text,
          position: opt.position,
        })),
      })),
      exam: {
        id: participant.exam.id,
        title: participant.exam.title,
        durationSeconds: participant.exam.durationSeconds,
        startsAt: participant.exam.startsAt,
        endsAt: participant.exam.endsAt,
      },
    }
  }

  static async createQuestion(userId: string, role: UserRole, examId: string, data: CreateQuestionInput) {
    const exam = await prisma.exam.findUnique({ where: { id: examId } })
    if (!exam) {
      throw new AppError(404, 'EXAM_NOT_FOUND', 'Không tìm thấy kỳ thi.')
    }

    if (role !== UserRole.ADMIN && exam.ownerId !== userId) {
      throw new AppError(403, 'FORBIDDEN', 'Bạn không có quyền sửa câu hỏi của kỳ thi này.')
    }

    if (exam.status !== ExamStatus.WAITING && exam.status !== ExamStatus.DRAFT) {
      throw new AppError(409, 'INVALID_EXAM_STATE', 'Không thể thêm câu hỏi khi kỳ thi đã bắt đầu hoặc kết thúc.')
    }

    // Xác định position nếu không truyền
    let position = data.position
    if (!position) {
      const max = await prisma.question.aggregate({
        where: { examId },
        _max: { position: true },
      })
      position = (max._max.position ?? 0) + 1
    }

    const question = await prisma.question.create({
      data: {
        examId,
        type: data.type,
        topic: data.topic,
        prompt: data.prompt,
        points: data.points,
        position,
        options:
          data.type === 'MULTIPLE_CHOICE'
            ? {
                create: data.options.map((opt, idx) => ({
                  text: opt.text,
                  isCorrect: opt.isCorrect,
                  position: opt.position ?? idx,
                })),
              }
            : undefined,
      },
      include: {
        options: { orderBy: { position: 'asc' } },
      },
    })

    return { question }
  }

  // Nhập hàng loạt câu hỏi (từ file) trong một transaction: thêm vào cuối đề hoặc thay thế toàn bộ đề
  static async importQuestions(userId: string, role: UserRole, examId: string, data: ImportQuestionsInput) {
    const exam = await prisma.exam.findUnique({ where: { id: examId } })
    if (!exam) {
      throw new AppError(404, 'EXAM_NOT_FOUND', 'Không tìm thấy kỳ thi.')
    }

    if (role !== UserRole.ADMIN && exam.ownerId !== userId) {
      throw new AppError(403, 'FORBIDDEN', 'Bạn không có quyền sửa câu hỏi của kỳ thi này.')
    }

    if (exam.status !== ExamStatus.WAITING && exam.status !== ExamStatus.DRAFT) {
      throw new AppError(409, 'INVALID_EXAM_STATE', 'Không thể nhập câu hỏi khi kỳ thi đã bắt đầu hoặc kết thúc.')
    }

    const questions = await prisma.$transaction(async (tx) => {
      if (data.replace) {
        await tx.question.deleteMany({ where: { examId } })
      }

      const max = data.replace
        ? null
        : await tx.question.aggregate({
            where: { examId },
            _max: { position: true },
          })
      const startPosition = (max?._max.position ?? 0) + 1

      // Tạo sẵn id để ghi câu hỏi và phương án bằng 2 lệnh createMany thay vì hàng trăm lệnh lẻ
      const rows = data.questions.map((q, idx) => ({
        id: randomUUID(),
        examId,
        type: q.type,
        topic: q.topic,
        prompt: q.prompt,
        points: q.points,
        position: startPosition + idx,
      }))

      await tx.question.createMany({ data: rows })
      await tx.option.createMany({
        data: data.questions.flatMap((q, idx) =>
          (q.type === 'MULTIPLE_CHOICE' ? q.options : []).map((opt, optIdx) => ({
            questionId: rows[idx]!.id,
            text: opt.text,
            isCorrect: opt.isCorrect,
            position: optIdx,
          }))
        ),
      })

      return tx.question.findMany({
        where: { id: { in: rows.map((r) => r.id) } },
        orderBy: { position: 'asc' },
        include: { options: { orderBy: { position: 'asc' } } },
      })
    })

    await prisma.auditLog.create({
      data: {
        examId,
        actorId: userId,
        action: 'QUESTIONS_IMPORTED',
        metadata: { count: questions.length, replace: data.replace },
      },
    })

    return { questions, imported: questions.length, replaced: data.replace }
  }

  static async deleteQuestion(userId: string, role: UserRole, examId: string, questionId: string) {
    const exam = await prisma.exam.findUnique({ where: { id: examId } })
    if (!exam) {
      throw new AppError(404, 'EXAM_NOT_FOUND', 'Không tìm thấy kỳ thi.')
    }

    if (role !== UserRole.ADMIN && exam.ownerId !== userId) {
      throw new AppError(403, 'FORBIDDEN', 'Bạn không có quyền xóa câu hỏi của kỳ thi này.')
    }

    if (exam.status !== ExamStatus.WAITING && exam.status !== ExamStatus.DRAFT) {
      throw new AppError(409, 'INVALID_EXAM_STATE', 'Không thể xóa câu hỏi khi kỳ thi đã bắt đầu hoặc kết thúc.')
    }

    await prisma.question.delete({
      where: { id: questionId },
    })

    return { ok: true }
  }
}
