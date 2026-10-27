import { z } from 'zod'

// Trắc nghiệm gửi selectedOptionId, tự luận gửi textAnswer
export const saveAnswerSchema = z
  .object({
    selectedOptionId: z.string().trim().min(1, 'ID phương án không được rỗng').nullable().optional(),
    textAnswer: z.string().max(10000, 'Câu trả lời tối đa 10.000 ký tự').nullable().optional(),
  })
  .refine((d) => d.selectedOptionId !== undefined || d.textAnswer !== undefined, 'Thiếu đáp án cần lưu')

export const submitExamSchema = z.object({
  reason: z.enum(['MANUAL', 'TIMEOUT']).default('MANUAL'),
})

export const gradeEssaySchema = z.object({
  points: z.number().min(0, 'Điểm không được âm'),
})

export type SaveAnswerInput = z.infer<typeof saveAnswerSchema>
export type SubmitExamInput = z.infer<typeof submitExamSchema>
export type GradeEssayInput = z.infer<typeof gradeEssaySchema>
