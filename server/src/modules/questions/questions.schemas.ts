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

const questionBase = {
  topic: z.string().trim().min(1).max(120).default('Tổng quát'),
  prompt: z.string().trim().min(2, 'Nội dung câu hỏi tối thiểu 2 ký tự').max(4000),
  points: z.number().positive('Số điểm phải lớn hơn 0').max(100, 'Số điểm tối đa 100').default(1.0),
  position: z.number().int().positive().optional(),
}

// Trắc nghiệm có phương án; tự luận học sinh tự viết câu trả lời, giáo viên chấm tay.
// Không gửi type thì mặc định là trắc nghiệm (tương thích client cũ).
export const createQuestionSchema = z.preprocess(
  (value) => (value && typeof value === 'object' && !('type' in value) ? { ...value, type: 'MULTIPLE_CHOICE' } : value),
  z.discriminatedUnion('type', [
    z.object({ type: z.literal('MULTIPLE_CHOICE'), ...questionBase, options: optionsSchema }),
    z.object({ type: z.literal('ESSAY'), ...questionBase }),
  ])
)

// Nhập nhiều câu hỏi từ file (Excel/CSV/Word) trong một lần
export const importQuestionsSchema = z.object({
  replace: z.boolean().default(false),
  questions: z
    .array(createQuestionSchema)
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
