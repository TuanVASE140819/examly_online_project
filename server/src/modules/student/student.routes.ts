import { Router } from 'express'
import { UserRole } from '@prisma/client'
import { requireAuth, requireRole, requireUserAccount } from '../../middleware/auth.js'
import { validateBody } from '../../middleware/validate.js'
import { joinLimiter } from '../../middleware/rateLimiter.js'
import { handle, idParam } from '../../lib/http.js'
import { joinClassSchema, submitAssignmentSchema } from '../classes/classes.schemas.js'
import { StudentService } from './student.service.js'

// Học sinh: lớp học, bài tập về nhà và bảng điểm (theo tài khoản, không theo phiên thi)
export const studentRoutes = Router()

studentRoutes.use('/me', requireAuth, requireUserAccount, requireRole(UserRole.STUDENT))

studentRoutes.post('/me/classes/join', joinLimiter, validateBody(joinClassSchema), handle(async (req, res) => {
  res.json(await StudentService.joinClass(req.user!.sub, req.body.joinCode))
}))

studentRoutes.get('/me/classes', handle(async (req, res) => {
  res.json(await StudentService.listMyClasses(req.user!.sub))
}))

studentRoutes.get('/me/assignments', handle(async (req, res) => {
  res.json(await StudentService.listMyAssignments(req.user!.sub))
}))

studentRoutes.put('/me/assignments/:assignmentId/submission', validateBody(submitAssignmentSchema), handle(async (req, res) => {
  res.json(await StudentService.submitAssignment(req.user!.sub, idParam(req, 'assignmentId'), req.body.content))
}))

studentRoutes.get('/me/grades', handle(async (req, res) => {
  res.json(await StudentService.getMyGrades(req.user!.sub))
}))
