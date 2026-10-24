import { Router } from 'express'
import { UserRole } from '@prisma/client'
import { ExamsController } from './exams.controller.js'
import { createExamSchema, networkPolicySchema, updateExamSchema } from './exams.schemas.js'
import { requireAuth, requireRole } from '../../middleware/auth.js'
import { validateBody } from '../../middleware/validate.js'

export const examsRoutes = Router()

const teacherAuth = [requireAuth, requireRole(UserRole.TEACHER, UserRole.ADMIN)]

examsRoutes.post('/', ...teacherAuth, validateBody(createExamSchema), ExamsController.createExam)
examsRoutes.get('/', ...teacherAuth, ExamsController.listTeacherExams)
examsRoutes.get('/:examId', ...teacherAuth, ExamsController.getExamById)
examsRoutes.patch('/:examId', ...teacherAuth, validateBody(updateExamSchema), ExamsController.updateExam)
examsRoutes.patch('/:examId/network', ...teacherAuth, validateBody(networkPolicySchema), ExamsController.setNetworkPolicy)
examsRoutes.post('/:examId/start', ...teacherAuth, ExamsController.startExam)
examsRoutes.post('/:examId/finish', ...teacherAuth, ExamsController.finishExam)
