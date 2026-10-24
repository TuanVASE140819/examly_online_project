import { z } from 'zod'

export const createExamSchema = z.object({
  title: z.string().trim().min(3, 'Tên kỳ thi tối thiểu 3 ký tự').max(160),
  description: z.string().max(2000).optional(),
  durationMinutes: z.number().int().min(1, 'Thời lượng tối thiểu 1 phút').max(360, 'Thời lượng tối đa 360 phút'),
})

export const updateExamSchema = z.object({
  title: z.string().trim().min(3).max(160).optional(),
  description: z.string().max(2000).optional(),
  durationMinutes: z.number().int().min(1).max(360).optional(),
})

export const networkPolicySchema = z.object({
  allowExternalNetwork: z.boolean(),
})

export type CreateExamInput = z.infer<typeof createExamSchema>
export type UpdateExamInput = z.infer<typeof updateExamSchema>
export type NetworkPolicyInput = z.infer<typeof networkPolicySchema>
