import { Router } from 'express'
import { UserRole } from '@prisma/client'
import { QuestionsController } from './questions.controller.js'
import { createQuestionSchema, importQuestionsSchema } from './questions.schemas.js'
import { requireAuth, requireExamParticipant, requireRole } from '../../middleware/auth.js'
import { validateBody } from '../../middleware/validate.js'

export const questionsRoutes = Router()

// Giáo viên xem & tạo & xóa câu hỏi (kèm đáp án đúng)
questionsRoutes.get(
  '/exams/:examId/questions',
  requireAuth,
  requireRole(UserRole.TEACHER, UserRole.ADMIN),
  QuestionsController.getQuestionsForTeacher
)

questionsRoutes.post(
  '/exams/:examId/questions',
  requireAuth,
  requireRole(UserRole.TEACHER, UserRole.ADMIN),
  validateBody(createQuestionSchema),
  QuestionsController.createQuestion
)

// Giáo viên nhập nhiều câu hỏi từ file (file được đọc ở trình duyệt, gửi lên dạng JSON)
questionsRoutes.post(
  '/exams/:examId/questions/import',
  requireAuth,
  requireRole(UserRole.TEACHER, UserRole.ADMIN),
  validateBody(importQuestionsSchema),
  QuestionsController.importQuestions
)

questionsRoutes.delete(
  '/exams/:examId/questions/:questionId',
  requireAuth,
  requireRole(UserRole.TEACHER, UserRole.ADMIN),
  QuestionsController.deleteQuestion
)

// Thí sinh lấy đề thi (ĐÃ ẨN ĐÁP ÁN ĐÚNG)
questionsRoutes.get(
  '/exams/:examId/student-questions',
  requireAuth,
  requireExamParticipant,
  QuestionsController.getQuestionsForStudent
)
