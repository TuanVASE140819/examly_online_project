import { ExamStatus, ParticipantStatus, QuestionType, SubmitReason, UserRole } from '@prisma/client'
import { prisma } from '../../lib/prisma.js'
import { AppError } from '../../middleware/errorHandler.js'
import { socketEmitter } from '../../sockets/socketEmitter.js'
import { gradeAnswers } from './grading.js'
import type { GradeEssayInput, SaveAnswerInput, SubmitExamInput } from './submissions.schemas.js'

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
            textAnswer: true,
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
    const textAnswers: Record<string, string> = {}
    for (const a of participant.answers) {
      answersMap[a.questionId] = a.selectedOptionId
      if (a.textAnswer) textAnswers[a.questionId] = a.textAnswer
    }

    return {
      submitted: participant.status === ParticipantStatus.SUBMITTED,
      submission: participant.submission,
      answers: answersMap,
      textAnswers,
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

    const isEssay = question.type === QuestionType.ESSAY
    if (isEssay ? data.textAnswer === undefined : data.selectedOptionId === undefined) {
      throw new AppError(
        400,
        'INVALID_ANSWER',
        isEssay ? 'Câu tự luận cần gửi nội dung câu trả lời.' : 'Câu trắc nghiệm cần gửi phương án đã chọn.'
      )
    }
    const answerData = isEssay ? { textAnswer: data.textAnswer } : { selectedOptionId: data.selectedOptionId }

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
      update: answerData,
      create: {
        participantId,
        questionId,
        ...answerData,
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

    if (participant.status !== ParticipantStatus.APPROVED && participant.status !== ParticipantStatus.IN_PROGRESS) {
      throw new AppError(403, 'NOT_APPROVED', 'Thí sinh chưa được duyệt để làm bài.')
    }

    // Cho phép nộp khi kỳ thi đang diễn ra hoặc vừa kết thúc (nộp tự động khi hết giờ)
    if (participant.exam.status !== ExamStatus.ACTIVE && participant.exam.status !== ExamStatus.ENDED) {
      throw new AppError(409, 'EXAM_NOT_ACTIVE', 'Kỳ thi chưa bắt đầu.')
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

      // 3. Tính điểm: trắc nghiệm chấm ngay, tự luận chờ giáo viên chấm
      const { score, correctCount, totalQuestions, pendingEssays } = gradeAnswers(questions, answers)

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
          pendingEssays,
          gradedAt: pendingEssays > 0 ? null : new Date(),
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
          metadata: { score, correctCount, totalQuestions, pendingEssays, reason: data.reason },
        },
      })

      return submission
    })

    // Thông báo realtime tới giáo viên và học sinh
    socketEmitter.participantSubmitted(examId, {
      participantId: participant.id,
      score: result.score,
      pendingEssays: result.pendingEssays,
      submittedAt: result.submittedAt.toISOString(),
    })

    return {
      submission: result,
      alreadySubmitted: false,
    }
  }

  // Giáo viên xem bài làm của một thí sinh (kèm đáp án đúng) để chấm câu tự luận
  static async getParticipantSubmission(userId: string, role: UserRole, examId: string, participantId: string) {
    await assertExamOwner(userId, role, examId)

    const participant = await prisma.participant.findFirst({
      where: { id: participantId, examId },
      include: { submission: true, answers: true },
    })
    if (!participant) {
      throw new AppError(404, 'PARTICIPANT_NOT_FOUND', 'Không tìm thấy thí sinh trong kỳ thi này.')
    }

    const questions = await prisma.question.findMany({
      where: { examId },
      orderBy: { position: 'asc' },
      include: { options: { orderBy: { position: 'asc' } } },
    })
    const answers = new Map(participant.answers.map((a) => [a.questionId, a]))

    return {
      participant: {
        id: participant.id,
        name: participant.displayName,
        className: participant.className,
        status: participant.status,
      },
      submission: participant.submission,
      questions: questions.map((q) => {
        const answer = answers.get(q.id)
        return {
          id: q.id,
          type: q.type,
          topic: q.topic,
          prompt: q.prompt,
          points: q.points,
          position: q.position,
          options: q.options.map((o) => ({ id: o.id, text: o.text, position: o.position, isCorrect: o.isCorrect })),
          answer: answer
            ? { selectedOptionId: answer.selectedOptionId, textAnswer: answer.textAnswer, awardedPoints: answer.awardedPoints }
            : null,
        }
      }),
    }
  }

  // Giáo viên chấm (hoặc chấm lại) một câu tự luận rồi tính lại điểm bài thi
  static async gradeEssay(
    userId: string,
    role: UserRole,
    examId: string,
    participantId: string,
    questionId: string,
    data: GradeEssayInput
  ) {
    await assertExamOwner(userId, role, examId)

    const answer = await prisma.answer.findUnique({
      where: { participantId_questionId: { participantId, questionId } },
      include: { question: true, participant: { include: { submission: true } } },
    })
    if (!answer || answer.question.examId !== examId || answer.participant.examId !== examId) {
      throw new AppError(404, 'ANSWER_NOT_FOUND', 'Thí sinh chưa trả lời câu hỏi này.')
    }
    if (answer.question.type !== QuestionType.ESSAY) {
      throw new AppError(400, 'NOT_ESSAY', 'Chỉ chấm tay được câu tự luận; câu trắc nghiệm đã được chấm tự động.')
    }
    if (!answer.participant.submission) {
      throw new AppError(409, 'NOT_SUBMITTED', 'Thí sinh chưa nộp bài.')
    }
    if (!answer.textAnswer?.trim()) {
      throw new AppError(400, 'EMPTY_ANSWER', 'Câu bỏ trống được tính 0 điểm, không cần chấm.')
    }
    if (data.points > answer.question.points) {
      throw new AppError(400, 'POINTS_EXCEEDED', `Điểm tối đa của câu này là ${answer.question.points}.`)
    }

    const points = Math.round(data.points * 100) / 100

    const submission = await prisma.$transaction(async (tx) => {
      await tx.answer.update({ where: { id: answer.id }, data: { awardedPoints: points } })

      const questions = await tx.question.findMany({
        where: { examId },
        include: { options: { where: { isCorrect: true } } },
      })
      const answers = await tx.answer.findMany({ where: { participantId } })
      const graded = gradeAnswers(questions, answers)

      return tx.submission.update({
        where: { participantId },
        data: {
          score: graded.score,
          pendingEssays: graded.pendingEssays,
          gradedAt: graded.pendingEssays > 0 ? null : new Date(),
        },
      })
    })

    await prisma.auditLog.create({
      data: {
        examId,
        actorId: userId,
        action: 'ESSAY_GRADED',
        metadata: { participantId, questionId, points },
      },
    })

    socketEmitter.submissionGraded(examId, {
      participantId,
      score: submission.score,
      pendingEssays: submission.pendingEssays,
    })

    return { submission, awardedPoints: points }
  }
}

async function assertExamOwner(userId: string, role: UserRole, examId: string) {
  const exam = await prisma.exam.findUnique({ where: { id: examId }, select: { ownerId: true } })
  if (!exam) {
    throw new AppError(404, 'EXAM_NOT_FOUND', 'Không tìm thấy kỳ thi.')
  }
  if (role !== UserRole.ADMIN && exam.ownerId !== userId) {
    throw new AppError(403, 'FORBIDDEN', 'Bạn không có quyền xem hoặc chấm bài của kỳ thi này.')
  }
}
