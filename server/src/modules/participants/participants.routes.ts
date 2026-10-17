import { Router } from 'express'
import { UserRole } from '@prisma/client'
import { ParticipantsController } from './participants.controller.js'
import { decisionSchema, joinRoomSchema } from './participants.schemas.js'
import { requireAuth, requireRole } from '../../middleware/auth.js'
import { validateBody } from '../../middleware/validate.js'
import { joinLimiter } from '../../middleware/rateLimiter.js'

export const participantsRoutes = Router()

// Học sinh tham gia phòng thi (Public + Rate limit)
participantsRoutes.post('/exams/join', joinLimiter, validateBody(joinRoomSchema), ParticipantsController.joinRoom)

// Học sinh kiểm tra trạng thái duyệt và thời gian thi
participantsRoutes.get('/exams/my-status', requireAuth, ParticipantsController.getMyStatus)

// Giáo viên xem danh sách thí sinh trong kỳ thi
participantsRoutes.get(
  '/exams/:examId/participants',
  requireAuth,
  requireRole(UserRole.TEACHER, UserRole.ADMIN),
  ParticipantsController.getExamParticipants
)

// Giáo viên duyệt hoặc từ chối thí sinh
participantsRoutes.post(
  '/exams/:examId/participants/:participantId/decision',
  requireAuth,
  requireRole(UserRole.TEACHER, UserRole.ADMIN),
  validateBody(decisionSchema),
  ParticipantsController.decideParticipant
)
