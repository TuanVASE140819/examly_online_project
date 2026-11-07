import { z } from 'zod'

// Các sự kiện được tính là một lượt cảnh báo gửi tới giáo viên
export const WARNING_EVENTS = ['TAB_HIDDEN', 'DEVTOOLS_OPEN'] as const

export const proctoringEventSchema = z.object({
  eventType: z.enum(['TAB_HIDDEN', 'TAB_VISIBLE', 'WINDOW_BLUR', 'DEVTOOLS_OPEN']),
  metadata: z.record(z.unknown()).optional(),
})

export type ProctoringEventInput = z.infer<typeof proctoringEventSchema>
