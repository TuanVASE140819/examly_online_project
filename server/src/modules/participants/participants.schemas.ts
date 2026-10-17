import { z } from 'zod'

export const joinRoomSchema = z.object({
  joinCode: z.string().trim().min(3, 'Mã phòng thi không được rỗng').max(32),
  displayName: z.string().trim().min(2, 'Họ và tên tối thiểu 2 ký tự').max(120),
  className: z.string().trim().min(1, 'Lớp học không được rỗng').max(60),
})

export const decisionSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED', 'PENDING']),
})

export type JoinRoomInput = z.infer<typeof joinRoomSchema>
export type DecisionInput = z.infer<typeof decisionSchema>
