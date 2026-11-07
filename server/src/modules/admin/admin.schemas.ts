import { z } from 'zod'

const role = z.enum(['TEACHER', 'STUDENT', 'ADMIN'])
const password = z.string().min(8, 'Mật khẩu phải từ 8 ký tự trở lên').max(128)

export const createUserSchema = z.object({
  email: z.string().trim().toLowerCase().email('Email không đúng định dạng').max(254),
  displayName: z.string().trim().min(2, 'Họ tên phải từ 2 ký tự').max(120),
  role,
  // Bỏ trống: người dùng đăng nhập bằng Google với đúng email này
  password: password.optional(),
})

export const updateUserSchema = z
  .object({
    displayName: z.string().trim().min(2, 'Họ tên phải từ 2 ký tự').max(120).optional(),
    role: role.optional(),
    password: password.optional(),
  })
  .refine((v) => v.displayName !== undefined || v.role !== undefined || v.password !== undefined, {
    message: 'Không có thông tin nào cần cập nhật',
  })

export const listUsersQuerySchema = z.object({
  role: role.optional(),
  q: z.string().trim().max(120).optional(),
})

export type CreateUserInput = z.infer<typeof createUserSchema>
export type UpdateUserInput = z.infer<typeof updateUserSchema>
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>
