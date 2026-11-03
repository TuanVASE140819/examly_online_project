import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().trim().email('Email không đúng định dạng').max(254),
  password: z.string().min(6, 'Mật khẩu phải từ 6 ký tự trở lên').max(128),
})

export const registerSchema = z.object({
  email: z.string().trim().email('Email không đúng định dạng').max(254),
  password: z.string().min(8, 'Mật khẩu phải từ 8 ký tự trở lên').max(128),
  displayName: z.string().trim().min(2, 'Họ tên phải từ 2 ký tự').max(120),
  // Chỉ cho phép tự đăng ký Giáo viên hoặc Học sinh (Admin do hệ thống cấp)
  role: z.enum(['TEACHER', 'STUDENT']).default('TEACHER'),
})

export const googleLoginSchema = z.object({
  idToken: z.string().min(1, 'Thiếu ID token của Google').max(4096),
  // Chỉ dùng khi tài khoản Google chưa có trên hệ thống: tạo tài khoản mới với vai trò này
  role: z.enum(['TEACHER', 'STUDENT']).optional(),
})

export type LoginInput = z.infer<typeof loginSchema>
export type RegisterInput = z.infer<typeof registerSchema>
export type GoogleLoginInput = z.infer<typeof googleLoginSchema>
