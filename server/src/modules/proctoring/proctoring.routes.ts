import { Router } from 'express'
import { ProctoringController } from './proctoring.controller.js'
import { proctoringEventSchema } from './proctoring.schemas.js'
import { requireAuth, requireExamParticipant } from '../../middleware/auth.js'
import { validateBody } from '../../middleware/validate.js'
import { proctoringLimiter } from '../../middleware/rateLimiter.js'

export const proctoringRoutes = Router()

proctoringRoutes.use(requireAuth, requireExamParticipant)

// Ghi nhận sự kiện chuyển tab/ẩn màn hình
proctoringRoutes.post(
  '/proctoring/events',
  proctoringLimiter,
  validateBody(proctoringEventSchema),
  ProctoringController.recordEvent
)
