import http from 'node:http'
import { createApp } from './app.js'
import { env } from './config/env.js'
import { setupSocketServer } from './sockets/socketServer.js'
import { logger } from './lib/logger.js'
import { prisma } from './lib/prisma.js'
import { ExamsService } from './modules/exams/exams.service.js'

export function startServer() {
  const app = createApp()
  const httpServer = http.createServer(app)

  setupSocketServer(httpServer)

  const server = httpServer.listen(env.PORT, () => {
    logger.info(`🚀 Examly API đang hoạt động tại http://localhost:${env.PORT}`)
    ExamsService.resumeAutoFinish().catch((err) => {
      logger.error({ err }, 'Không thể khôi phục hẹn giờ kết thúc kỳ thi')
    })
  })

  const shutdown = async (signal: string) => {
    logger.info(`Nhận tín hiệu ${signal}. Đang đóng kết nối an toàn...`)
    await prisma.$disconnect()
    server.close(() => {
      logger.info('Server đã đóng hoàn tất.')
      process.exit(0)
    })
  }

  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))

  return server
}

// Chạy trực tiếp nếu file là entry point
if (process.argv[1]?.includes('server.ts') || process.argv[1]?.includes('server.js')) {
  startServer()
}
