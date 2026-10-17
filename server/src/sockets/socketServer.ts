import type { Server as HTTPServer } from 'node:http'
import { Server as SocketIOServer, type Socket } from 'socket.io'
import jwt from 'jsonwebtoken'
import { UserRole } from '@prisma/client'
import { env } from '../config/env.js'
import { prisma } from '../lib/prisma.js'
import { logger } from '../lib/logger.js'
import { setSocketIO, socketRooms } from './socketEmitter.js'
import type { AuthPayload } from '../middleware/auth.js'

export function setupSocketServer(httpServer: HTTPServer): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: env.FRONTEND_ORIGIN,
      methods: ['GET', 'POST'],
      credentials: true,
    },
  })

  // Middleware xác thực JWT trong handshake
  io.use((socket: Socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '')

    if (!token || typeof token !== 'string') {
      return next(new Error('UNAUTHORIZED'))
    }

    try {
      const decoded = jwt.verify(token, env.JWT_SECRET) as AuthPayload
      socket.data.user = decoded
      next()
    } catch {
      return next(new Error('INVALID_TOKEN'))
    }
  })

  io.on('connection', (socket: Socket) => {
    const user = socket.data.user as AuthPayload
    logger.info({ userId: user.sub, role: user.role, socketId: socket.id }, 'Socket client connected')

    // Tự động cho học sinh vào room cá nhân
    if (user.role === UserRole.STUDENT && user.sub) {
      socket.join(socketRooms.participant(user.sub))
    }

    // Xử lý đăng ký nhận tin của phòng thi
    socket.on(
      'exam:subscribe',
      async (payload: { examId?: string }, callback?: (res: { ok: boolean; error?: string }) => void) => {
        try {
          if (!payload?.examId) {
            callback?.({ ok: false, error: 'INVALID_EXAM_ID' })
            return
          }

          const exam = await prisma.exam.findUnique({
            where: { id: payload.examId },
            select: { id: true, ownerId: true },
          })

          if (!exam) {
            callback?.({ ok: false, error: 'EXAM_NOT_FOUND' })
            return
          }

          if (user.role === UserRole.TEACHER || user.role === UserRole.ADMIN) {
            if (user.role !== UserRole.ADMIN && exam.ownerId !== user.sub) {
              callback?.({ ok: false, error: 'FORBIDDEN' })
              return
            }
            await socket.join(socketRooms.teacher(exam.id))
            await socket.join(socketRooms.public(exam.id))
            callback?.({ ok: true })
            return
          }

          if (user.role === UserRole.STUDENT) {
            if (user.examId && user.examId !== exam.id) {
              callback?.({ ok: false, error: 'FORBIDDEN' })
              return
            }
            await socket.join(socketRooms.public(exam.id))
            callback?.({ ok: true })
            return
          }

          callback?.({ ok: false, error: 'FORBIDDEN' })
        } catch (err) {
          logger.error({ err }, 'Error in exam:subscribe')
          callback?.({ ok: false, error: 'SERVER_ERROR' })
        }
      }
    )

    socket.on('disconnect', () => {
      logger.debug({ socketId: socket.id }, 'Socket client disconnected')
    })
  })

  setSocketIO(io)
  return io
}
