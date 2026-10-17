import { z } from 'zod'

export const proctoringEventSchema = z.object({
  eventType: z.enum(['TAB_HIDDEN', 'TAB_VISIBLE', 'WINDOW_BLUR']),
  metadata: z.record(z.unknown()).optional(),
})

export type ProctoringEventInput = z.infer<typeof proctoringEventSchema>
