import { z } from 'zod'

export const classSchema = z.object({
  name: z.string().trim().min(2, 'Tên lớp tối thiểu 2 ký tự').max(120),
  description: z.string().trim().max(1000).optional(),
})

export const addMembersSchema = z.object({
  emails: z
    .array(z.string().trim().toLowerCase().email('Có email không đúng định dạng').max(254))
    .min(1, 'Nhập ít nhất một email')
    .max(200, 'Mỗi lần thêm tối đa 200 học sinh'),
})

export const joinClassSchema = z.object({
  joinCode: z.string().trim().toUpperCase().min(4, 'Mã lớp không hợp lệ').max(20),
})

const dueAt = z.coerce.date({ invalid_type_error: 'Hạn nộp không hợp lệ' }).nullable().optional()

// Yêu cầu bài tập có thể để trống khi đề nằm trong tệp PDF / Word đính kèm
const instructions = z.string().trim().max(10000, 'Yêu cầu bài tập tối đa 10.000 ký tự')

export const createAssignmentSchema = z.object({
  title: z.string().trim().min(3, 'Tiêu đề tối thiểu 3 ký tự').max(200),
  instructions: instructions.default(''),
  dueAt,
  maxScore: z.number().positive('Thang điểm phải lớn hơn 0').max(100).default(10),
})

export const updateAssignmentSchema = z.object({
  title: z.string().trim().min(3, 'Tiêu đề tối thiểu 3 ký tự').max(200).optional(),
  instructions: instructions.optional(),
  dueAt,
  maxScore: z.number().positive('Thang điểm phải lớn hơn 0').max(100).optional(),
})

export const gradeAssignmentSchema = z.object({
  score: z.number().min(0, 'Điểm không được âm'),
  feedback: z.string().trim().max(5000).optional(),
})

export const publishSchema = z.object({
  published: z.boolean(),
})

// Bài làm có thể chỉ gồm tệp đính kèm; service kiểm tra bài nộp không trống hoàn toàn
export const submitAssignmentSchema = z.object({
  content: z.string().trim().max(20000, 'Bài làm tối đa 20.000 ký tự').default(''),
})

export type ClassInput = z.infer<typeof classSchema>
export type AddMembersInput = z.infer<typeof addMembersSchema>
export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>
export type UpdateAssignmentInput = z.infer<typeof updateAssignmentSchema>
export type GradeAssignmentInput = z.infer<typeof gradeAssignmentSchema>
