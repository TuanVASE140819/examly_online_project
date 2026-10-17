import { Router } from 'express'
import { SubmissionsController } from './submissions.controller.js'
import { saveAnswerSchema, submitExamSchema } from './submissions.schemas.js'
import { requireAuth, requireExamParticipant } from '../../middleware/auth.js'
import { validateBody } from '../../middleware/validate.js'

export const submissionsRoutes = Router()

submissionsRoutes.use(requireAuth, requireExamParticipant)

// Lấy thông tin bài làm hiện tại (phục vụ khôi phục khi F5)
submissionsRoutes.get('/submissions/current', SubmissionsController.getCurrentSubmission)

// Autosave đáp án từng câu
submissionsRoutes.put(
  '/submissions/current/answers/:questionId',
  validateBody(saveAnswerSchema),
  SubmissionsController.saveAnswer
)

// Nộp bài thi
submissionsRoutes.post(
  '/submissions/current/submit',
  validateBody(submitExamSchema),
  SubmissionsController.submitExam
)
