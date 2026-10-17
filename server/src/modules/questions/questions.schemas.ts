import { z } from 'zod'

export const optionSchema = z.object({
  text: z.string().trim().min(1, 'Nội dung phương án không được rỗng'),
  isCorrect: z.boolean().default(false),
  position: z.number().int().min(0),
})

export const createQuestionSchema = z.object({
  topic: z.string().trim().min(1).default('Tổng quát'),
  prompt: z.string().trim().min(2, 'Nội dung câu hỏi tối thiểu 2 ký tự'),
  points: z.number().positive().default(1.0),
  position: z.number().int().positive().optional(),
  options: z.array(optionSchema).min(2, 'Tối thiểu 2 phương án lựa chọn'),
})

export const updateQuestionSchema = z.object({
  topic: z.string().trim().min(1).optional(),
  prompt: z.string().trim().min(2).optional(),
  points: z.number().positive().optional(),
  position: z.number().int().positive().optional(),
  options: z.array(optionSchema).min(2).optional(),
})

export type CreateQuestionInput = z.infer<typeof createQuestionSchema>
export type UpdateQuestionInput = z.infer<typeof updateQuestionSchema>
