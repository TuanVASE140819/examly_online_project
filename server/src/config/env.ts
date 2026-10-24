import 'dotenv/config'
import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  FRONTEND_ORIGIN: z.string().default('http://localhost:5173'),
  // Số lớp proxy (vd "1" trên Render) hoặc dải địa chỉ được tin để đọc IP thật từ X-Forwarded-For
  TRUST_PROXY: z
    .string()
    .default('loopback')
    .transform((v) => (/^\d+$/.test(v) ? Number(v) : v)),
  // Thư mục frontend đã build; khi đặt, backend phục vụ luôn giao diện web (triển khai một dịch vụ)
  FRONTEND_DIST: z.string().optional(),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('❌ Cấu hình biến môi trường không hợp lệ:', parsed.error.format())
  throw new Error('Invalid environment variables')
}

export const env = parsed.data
