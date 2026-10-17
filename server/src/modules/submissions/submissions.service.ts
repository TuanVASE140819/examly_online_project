import { ExamStatus, ParticipantStatus, SubmitReason } from '@prisma/client'
import { prisma } from '../../lib/prisma.js'
import { AppError } from '../../middleware/errorHandler.js'
import { socketEmitter } from '../../sockets/socketEmitter.js'
import type { SaveAnswerInput, SubmitExamInput } from './submissions.schemas.js'

export class SubmissionsService {
  // Lấy danh sách câu trả lời đã lưu và thông tin thời gian làm bài
  static async getCurrentSubmission(participantId: string) {
    const participant = await prisma.participant.findUnique({
      where: { id: participantId },
      include: {
        exam: true,
        submission: true,
        answers: {
          select: {
            questionId: true,
            selectedOptionId: true,
            savedAt: true,
          },
        },
      },
    })

    if (!participant) {
      throw new AppError(404, 'PARTICIPANT_NOT_FOUND', 'Không tìm thấy thí sinh.')
    }

    let secondsRemaining = participant.exam.durationSeconds
    if (participant.exam.endsAt) {
      const ms = new Date(participant.exam.endsAt).getTime() - Date.now()
      secondsRemaining = Math.max(0, Math.floor(ms / 1000))
    }

    const answersMap: Record<string, string | null> = {}
    for (const a of participant.answers) {
      answersMap[a.questionId] = a.selectedOptionId
    }

    return {
      submitted: participant.status === ParticipantStatus.SUBMITTED,
      submission: participant.submission,
      answers: answersMap,
      secondsRemaining,
      examStatus: participant.exam.status,
    }
  }

  // Autosave đáp án từng câu
  static async saveAnswer(participantId: string, questionId: string, data: SaveAnswerInput) {
    const participant = await prisma.participant.findUnique({
      where: { id: participantId },
      include: { exam: true },
    })

    if (!participant) {
      throw new AppError(404, 'PARTICIPANT_NOT_FOUND', 'Không tìm thấy thí sinh.')
    }

    if (participant.status === ParticipantStatus.SUBMITTED) {
      throw new AppError(409, 'ALREADY_SUBMITTED', 'Bài thi đã được nộp. Không thể thay đổi đáp án.')
    }

    if (participant.status !== ParticipantStatus.APPROVED && participant.status !== ParticipantStatus.IN_PROGRESS) {
      throw new AppError(403, 'NOT_APPROVED', 'Thí sinh chưa được duyệt để làm bài.')
    }

    if (participant.exam.status !== ExamStatus.ACTIVE) {
      throw new AppError(409, 'EXAM_NOT_ACTIVE', 'Kỳ thi chưa bắt đầu hoặc đã kết thúc.')
    }

    // Kiểm tra hết giờ
    if (participant.exam.endsAt && new Date() > new Date(participant.exam.endsAt)) {
      throw new AppError(409, 'EXAM_TIMEOUT', 'Thời gian làm bài đã kết thúc.')
    }

    // Xác nhận câu hỏi thuộc về kỳ thi này
    const question = await prisma.question.findFirst({
      where: { id: questionId, examId: participant.examId },
    })

    if (!question) {
      throw new AppError(404, 'QUESTION_NOT_FOUND', 'Câu hỏi không thuộc kỳ thi này.')
    }

    // Cập nhật trạng thái sang IN_PROGRESS nếu đang là APPROVED
    if (participant.status === ParticipantStatus.APPROVED) {
      await prisma.participant.update({
        where: { id: participantId },
        data: { status: ParticipantStatus.IN_PROGRESS },
      })
    }

    // Upsert đáp án
    const answer = await prisma.answer.upsert({
      where: {
        participantId_questionId: {
          participantId,
          questionId,
        },
      },
      update: {
        selectedOptionId: data.selectedOptionId,
      },
      create: {
        participantId,
        questionId,
        selectedOptionId: data.selectedOptionId,
      },
    })

    return {
      saved: true,
      savedAt: answer.savedAt,
    }
  }

  // Nộp bài và chấm điểm server-side trong transaction
  static async submitExam(participantId: string, data: SubmitExamInput) {
    const participant = await prisma.participant.findUnique({
      where: { id: participantId },
      include: {
        exam: true,
        submission: true,
      },
    })

    if (!participant) {
      throw new AppError(404, 'PARTICIPANT_NOT_FOUND', 'Không tìm thấy thí sinh.')
    }

    // Chống nộp lặp lại (Idempotency)
    if (participant.submission) {
      return {
        submission: participant.submission,
        alreadySubmitted: true,
      }
    }

    const examId = participant.examId

    // Thực hiện chấm điểm trong Transaction
    const result = await prisma.$transaction(async (tx) => {
      // 1. Lấy tất cả câu hỏi và đáp án đúng
      const questions = await tx.question.findMany({
        where: { examId },
        include: {
          options: {
            where: { isCorrect: true },
          },
        },
      })

      // 2. Lấy tất cả câu trả lời của thí sinh
      const answers = await tx.answer.findMany({
        where: { participantId },
      })

      const answerMap = new Map<string, string | null>()
      for (const a of answers) {
        answerMap.set(a.questionId, a.selectedOptionId)
      }

      // 3. Tính điểm
      let correctCount = 0
      const totalQuestions = questions.length

      for (const q of questions) {
        const correctOptId = q.options[0]?.id
        const userChoice = answerMap.get(q.id)
        if (correctOptId && userChoice === correctOptId) {
          correctCount++
        }
      }

      const score = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 10 * 10) / 10 : 0

      // 4. Tạo bản ghi Submission
      const submission = await tx.submission.create({
        data: {
          participantId,
          examId,
          reason: data.reason === 'TIMEOUT' ? SubmitReason.TIMEOUT : SubmitReason.MANUAL,
          score,
          maxScore: 10.0,
          correctCount,
          totalQuestions,
          gradedAt: new Date(),
        },
      })

      // 5. Cập nhật trạng thái Participant sang SUBMITTED
      await tx.participant.update({
        where: { id: participantId },
        data: { status: ParticipantStatus.SUBMITTED },
      })

      // 6. Ghi Audit Log
      await tx.auditLog.create({
        data: {
          examId,
          actorId: participantId,
          action: 'EXAM_SUBMITTED',
          metadata: { score, correctCount, totalQuestions, reason: data.reason },
        },
      })

      return submission
    })

    // Thông báo realtime tới giáo viên và học sinh
    socketEmitter.participantSubmitted(examId, {
      participantId: participant.id,
      score: result.score,
      submittedAt: result.submittedAt.toISOString(),
    })

    return {
      submission: result,
      alreadySubmitted: false,
    }
  }
}
