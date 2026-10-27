import { QuestionType } from '@prisma/client'

type GradedQuestion = {
  id: string
  type: QuestionType
  points: number
  // Chỉ cần các phương án đúng (isCorrect = true)
  options: { id: string }[]
}

type GradedAnswer = {
  questionId: string
  selectedOptionId: string | null
  textAnswer?: string | null
  awardedPoints?: number | null
}

// Điểm quy về thang 10 theo số điểm (points) của từng câu.
// Trắc nghiệm chấm tự động; tự luận lấy điểm giáo viên chấm, câu bỏ trống tính 0 điểm.
// Còn câu tự luận chưa chấm thì score = null.
export function gradeAnswers(questions: GradedQuestion[], answers: GradedAnswer[]) {
  const byQuestion = new Map(answers.map((a) => [a.questionId, a]))
  let earned = 0
  let totalPoints = 0
  let correctCount = 0
  let totalQuestions = 0
  let pendingEssays = 0

  for (const q of questions) {
    totalPoints += q.points
    const answer = byQuestion.get(q.id)

    if (q.type === QuestionType.ESSAY) {
      if (!answer?.textAnswer?.trim()) continue
      if (answer.awardedPoints === null || answer.awardedPoints === undefined) pendingEssays++
      else earned += answer.awardedPoints
      continue
    }

    totalQuestions++
    const correctOptId = q.options[0]?.id
    if (correctOptId && answer?.selectedOptionId === correctOptId) {
      correctCount++
      earned += q.points
    }
  }

  const score = totalPoints > 0 ? Math.round((earned / totalPoints) * 10 * 10) / 10 : 0
  return { score: pendingEssays > 0 ? null : score, correctCount, totalQuestions, pendingEssays }
}
