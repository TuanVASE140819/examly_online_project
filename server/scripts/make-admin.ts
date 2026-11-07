// Tạo (hoặc nâng quyền) tài khoản quản trị viên đầu tiên. Các quản trị viên sau
// được thêm ngay trong giao diện Quản lý người dùng.
//
//   npm run admin:create -- <email> "<Họ tên>" [mật khẩu]
//
// Không truyền mật khẩu: người đó đăng nhập bằng "Tiếp tục với Google" với đúng email này.
// Dùng DATABASE_URL trong server/.env (hoặc biến môi trường khi chạy cho máy chủ thật).
import { PrismaClient, UserRole } from '@prisma/client'
import { hashPassword } from '../src/lib/crypto.js'

const [emailArg, nameArg, password] = process.argv.slice(2)
const email = emailArg?.trim().toLowerCase()
const displayName = nameArg?.trim()

if (!email || !/^\S+@\S+\.\S+$/.test(email) || !displayName) {
  console.error('Cách dùng: npm run admin:create -- <email> "<Họ tên>" [mật khẩu]')
  process.exit(1)
}
if (password !== undefined && password.length < 8) {
  console.error('Mật khẩu phải từ 8 ký tự trở lên.')
  process.exit(1)
}

const prisma = new PrismaClient()

try {
  const passwordHash = password ? await hashPassword(password) : undefined
  const existing = await prisma.user.findUnique({ where: { email } })

  const user = existing
    ? await prisma.user.update({
        where: { email },
        data: { role: UserRole.ADMIN, displayName, ...(passwordHash ? { passwordHash } : {}) },
      })
    : await prisma.user.create({
        data: { email, displayName, role: UserRole.ADMIN, passwordHash: passwordHash ?? null },
      })

  await prisma.auditLog.create({
    data: { action: existing ? 'ADMIN_PROMOTED_BY_SCRIPT' : 'ADMIN_CREATED_BY_SCRIPT', metadata: { userId: user.id, email } },
  })

  console.log(`${existing ? 'Đã nâng quyền' : 'Đã tạo'} quản trị viên: ${user.displayName} <${user.email}>`)
  console.log(user.passwordHash ? 'Đăng nhập bằng email + mật khẩu.' : 'Đăng nhập bằng nút "Tiếp tục với Google".')
} finally {
  await prisma.$disconnect()
}
