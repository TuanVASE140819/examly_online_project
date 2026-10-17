import { z } from 'zod'

export const saveAnswerSchema = z.object({
  selectedOptionId: z.string().trim().min(1, 'ID phương án không được rỗng').nullable(),
})

export const submitExamSchema = z.object({
  reason: z.enum(['MANUAL', 'TIMEOUT']).default('MANUAL'),
})

export type SaveAnswerInput = z.infer<typeof saveAnswerSchema>
export type SubmitExamInput = z.infer<typeof submitExamSchema>
