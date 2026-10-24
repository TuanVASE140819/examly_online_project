import type { Request, Response, NextFunction } from 'express'
import { prisma } from '../lib/prisma.js'
import { isSameNetworkAsServer, isSameNetworkAsTeacher, networkNotAllowedError } from '../lib/network.js'

// Dùng sau requireExamParticipant: chặn thí sinh làm bài từ mạng khác khi giáo viên chỉ cho phép cùng mạng
export async function requireAllowedNetwork(req: Request, _res: Response, next: NextFunction) {
  // Kết nối cùng mạng với máy chủ luôn hợp lệ nên không cần truy vấn kỳ thi
  const examId = req.user?.examId
  if (!examId || isSameNetworkAsServer(req.ip)) return next()

  try {
    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      select: { allowExternalNetwork: true, teacherNetworkIp: true },
    })
    if (exam && !exam.allowExternalNetwork && !isSameNetworkAsTeacher(req.ip, exam.teacherNetworkIp)) {
      return next(networkNotAllowedError())
    }
    next()
  } catch (err) {
    next(err)
  }
}
