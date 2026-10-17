import express, { type Express } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { env } from './config/env.js'
import { errorHandler } from './middleware/errorHandler.js'
import { authRoutes } from './modules/auth/auth.routes.js'
import { examsRoutes } from './modules/exams/exams.routes.js'
import { questionsRoutes } from './modules/questions/questions.routes.js'
import { participantsRoutes } from './modules/participants/participants.routes.js'
import { submissionsRoutes } from './modules/submissions/submissions.routes.js'
import { proctoringRoutes } from './modules/proctoring/proctoring.routes.js'

export function createApp(): Express {
  const app = express()

  app.use(helmet())
  app.use(
    cors({
      origin: env.FRONTEND_ORIGIN,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    })
  )
  app.use(express.json({ limit: '200kb' }))

  // Health check endpoint
  app.get('/api/v1/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'examly-api',
      timestamp: new Date().toISOString(),
    })
  })

  // Đăng ký các router REST API (ưu tiên các route con của participants/questions trước)
  app.use('/api/v1/auth', authRoutes)
  app.use('/api/v1', participantsRoutes)
  app.use('/api/v1', questionsRoutes)
  app.use('/api/v1', submissionsRoutes)
  app.use('/api/v1', proctoringRoutes)
  app.use('/api/v1/exams', examsRoutes)

  // 404 handler cho các route không tồn tại
  app.use((_req, res) => {
    res.status(404).json({
      error: 'NOT_FOUND',
      message: 'Tài nguyên API không tồn tại.',
    })
  })

  // Global error handler
  app.use(errorHandler)

  return app
}
