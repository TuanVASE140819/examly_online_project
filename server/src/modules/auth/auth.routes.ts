import { Router } from 'express'
import { AuthController } from './auth.controller.js'
import { googleLoginSchema, loginSchema, registerSchema } from './auth.schemas.js'
import { validateBody } from '../../middleware/validate.js'
import { requireAuth } from '../../middleware/auth.js'
import { authLimiter } from '../../middleware/rateLimiter.js'

export const authRoutes = Router()

authRoutes.post('/login', authLimiter, validateBody(loginSchema), AuthController.login)
authRoutes.post('/register', authLimiter, validateBody(registerSchema), AuthController.register)
authRoutes.post('/google', authLimiter, validateBody(googleLoginSchema), AuthController.loginWithGoogle)
authRoutes.get('/me', requireAuth, AuthController.getMe)
