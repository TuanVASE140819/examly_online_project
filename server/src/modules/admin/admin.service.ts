import { Prisma, UserRole } from '@prisma/client'
import { prisma } from '../../lib/prisma.js'
import { hashPassword } from '../../lib/crypto.js'
import { AppError } from '../../middleware/errorHandler.js'
import type { CreateUserInput, ListUsersQuery, UpdateUserInput } from './admin.schemas.js'

const userSelect = {
  id: true,
  email: true,
  displayName: true,
  role: true,
  passwordHash: true,
  createdAt: true,
  _count: { select: { ownedExams: true, teachingClasses: true, classMemberships: true } },
} satisfies Prisma.UserSelect

type UserRow = Prisma.UserGetPayload<{ select: typeof userSelect }>

// Không bao giờ trả mật khẩu băm về giao diện, chỉ cho biết cách đăng nhập
function toAdminUser(u: UserRow) {
  return {
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    role: u.role,
    loginMethod: u.passwordHash ? ('PASSWORD' as const) : ('GOOGLE' as const),
    createdAt: u.createdAt,
    examCount: u._count.ownedExams,
    classCount: u.role === UserRole.STUDENT ? u._count.classMemberships : u._count.teachingClasses,
  }
}

async function findUserOrThrow(id: string) {
  const user = await prisma.user.findUnique({ where: { id }, select: userSelect })
  if (!user) {
    throw new AppError(404, 'USER_NOT_FOUND', 'Không tìm thấy người dùng.')
  }
  return user
}

export class AdminService {
  static async listUsers(query: ListUsersQuery) {
    const where: Prisma.UserWhereInput = {}
    if (query.role) where.role = query.role
    if (query.q) {
      where.OR = [
        { email: { contains: query.q, mode: 'insensitive' } },
        { displayName: { contains: query.q, mode: 'insensitive' } },
      ]
    }

    const [users, groups] = await Promise.all([
      prisma.user.findMany({ where, select: userSelect, orderBy: [{ role: 'asc' }, { createdAt: 'desc' }], take: 500 }),
      prisma.user.groupBy({ by: ['role'], _count: { _all: true } }),
    ])

    const totals = { ADMIN: 0, TEACHER: 0, STUDENT: 0 }
    for (const g of groups) totals[g.role] = g._count._all

    return { users: users.map(toAdminUser), totals }
  }

  static async createUser(actorId: string, data: CreateUserInput) {
    const existing = await prisma.user.findUnique({ where: { email: data.email }, select: { id: true } })
    if (existing) {
      throw new AppError(409, 'EMAIL_EXISTS', 'Email này đã có tài khoản.')
    }

    const created = await prisma.user.create({
      data: {
        email: data.email,
        displayName: data.displayName,
        role: data.role,
        passwordHash: data.password ? await hashPassword(data.password) : null,
      },
      select: userSelect,
    })

    await prisma.auditLog.create({
      data: { actorId, action: 'USER_CREATED', metadata: { userId: created.id, email: created.email, role: created.role } },
    })

    return { user: toAdminUser(created) }
  }

  static async updateUser(actorId: string, userId: string, data: UpdateUserInput) {
    const user = await findUserOrThrow(userId)

    if (data.role && data.role !== user.role) {
      // Tự hạ quyền của chính mình có thể khóa mất người quản trị cuối cùng
      if (userId === actorId) {
        throw new AppError(409, 'CANNOT_CHANGE_OWN_ROLE', 'Bạn không thể tự đổi vai trò của chính mình.')
      }
      // Học sinh không sở hữu phòng thi hay lớp học
      if (data.role === UserRole.STUDENT && (user._count.ownedExams > 0 || user._count.teachingClasses > 0)) {
        throw new AppError(
          409,
          'USER_HAS_CONTENT',
          `Tài khoản này đang quản lý ${user._count.ownedExams} phòng thi và ${user._count.teachingClasses} lớp học nên không chuyển thành học sinh được.`
        )
      }
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        displayName: data.displayName,
        role: data.role,
        passwordHash: data.password ? await hashPassword(data.password) : undefined,
      },
      select: userSelect,
    })

    await prisma.auditLog.create({
      data: {
        actorId,
        action: 'USER_UPDATED',
        metadata: {
          userId,
          ...(data.role && data.role !== user.role ? { role: { from: user.role, to: data.role } } : {}),
          ...(data.displayName ? { displayName: data.displayName } : {}),
          ...(data.password ? { passwordReset: true } : {}),
        },
      },
    })

    return { user: toAdminUser(updated) }
  }

  static async deleteUser(actorId: string, userId: string) {
    if (userId === actorId) {
      throw new AppError(409, 'CANNOT_DELETE_SELF', 'Bạn không thể tự xóa tài khoản của mình.')
    }
    const user = await findUserOrThrow(userId)

    // Xóa giáo viên sẽ xóa luôn phòng thi và lớp học của họ, nên bắt dọn dẹp trước
    if (user._count.ownedExams > 0 || (user.role !== UserRole.STUDENT && user._count.teachingClasses > 0)) {
      throw new AppError(
        409,
        'USER_HAS_CONTENT',
        `Tài khoản này còn ${user._count.ownedExams} phòng thi và ${user._count.teachingClasses} lớp học. Hãy xóa hoặc chuyển chúng trước khi xóa tài khoản.`
      )
    }

    await prisma.user.delete({ where: { id: userId } })

    await prisma.auditLog.create({
      data: { actorId, action: 'USER_DELETED', metadata: { userId, email: user.email, role: user.role } },
    })

    return { deleted: true }
  }
}
