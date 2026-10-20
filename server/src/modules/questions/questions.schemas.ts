import { z } from 'zod'

export const optionSchema = z.object({
  text: z.string().trim().min(1, 'Nội dung phương án không được rỗng').max(1000),
  isCorrect: z.boolean().default(false),
  position: z.number().int().min(0),
})

// Câu trắc nghiệm một lựa chọn: 2–6 phương án và đúng 1 đáp án đúng
const optionsSchema = z
  .array(optionSchema)
  .min(2, 'Tối thiểu 2 phương án lựa chọn')
  .max(6, 'Tối đa 6 phương án lựa chọn')
  .refine((options) => options.filter((o) => o.isCorrect).length === 1, 'Mỗi câu hỏi phải có đúng 1 đáp án đúng')

export const createQuestionSchema = z.object({
  topic: z.string().trim().min(1).max(120).default('Tổng quát'),
  prompt: z.string().trim().min(2, 'Nội dung câu hỏi tối thiểu 2 ký tự').max(4000),
  points: z.number().positive().default(1.0),
  position: z.number().int().positive().optional(),
  options: optionsSchema,
})

// Nhập nhiều câu hỏi từ file (Excel/CSV/Word) trong một lần
export const importQuestionsSchema = z.object({
  replace: z.boolean().default(false),
  questions: z
    .array(createQuestionSchema.omit({ position: true }))
    .min(1, 'File không có câu hỏi hợp lệ nào')
    .max(300, 'Mỗi lần chỉ nhập tối đa 300 câu hỏi'),
})

export const updateQuestionSchema = z.object({
  topic: z.string().trim().min(1).optional(),
  prompt: z.string().trim().min(2).optional(),
  points: z.number().positive().optional(),
  position: z.number().int().positive().optional(),
  options: z.array(optionSchema).min(2).optional(),
})

export type CreateQuestionInput = z.infer<typeof createQuestionSchema>
export type ImportQuestionsInput = z.infer<typeof importQuestionsSchema>
export type UpdateQuestionInput = z.infer<typeof updateQuestionSchema>
