import { z } from 'zod'

// Họ tên thí sinh lấy từ tài khoản học sinh đã đăng nhập, không nhận từ client
export const joinRoomSchema = z.object({
  joinCode: z.string().trim().min(3, 'Mã phòng thi không được rỗng').max(32),
  className: z.string().trim().min(1, 'Lớp học không được rỗng').max(60),
})

export const decisionSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED', 'PENDING']),
})

export type JoinRoomInput = z.infer<typeof joinRoomSchema>
export type DecisionInput = z.infer<typeof decisionSchema>
