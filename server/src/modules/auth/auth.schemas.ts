import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().trim().email('Email không đúng định dạng').max(254),
  password: z.string().min(6, 'Mật khẩu phải từ 6 ký tự trở lên').max(128),
})

export const registerSchema = z.object({
  email: z.string().trim().email('Email không đúng định dạng').max(254),
  password: z.string().min(8, 'Mật khẩu phải từ 8 ký tự trở lên').max(128),
  displayName: z.string().trim().min(2, 'Họ tên phải từ 2 ký tự').max(120),
})

export type LoginInput = z.infer<typeof loginSchema>
export type RegisterInput = z.infer<typeof registerSchema>
