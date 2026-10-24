import { Router } from 'express'
import { SubmissionsController } from './submissions.controller.js'
import { saveAnswerSchema, submitExamSchema } from './submissions.schemas.js'
import { requireAuth, requireExamParticipant } from '../../middleware/auth.js'
import { requireAllowedNetwork } from '../../middleware/network.js'
import { validateBody } from '../../middleware/validate.js'

export const submissionsRoutes = Router()

// Router được mount tại /api/v1 nên phải giới hạn middleware theo prefix,
// nếu không sẽ chặn cả các route của giáo viên phía sau (ví dụ GET/POST /exams)
submissionsRoutes.use('/submissions', requireAuth, requireExamParticipant, requireAllowedNetwork)

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
