import { createHash, randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'

export function hashJoinCode(value: string): string {
  return createHash('sha256').update(value.trim().toUpperCase()).digest('hex')
}

export function generateJoinCode(): string {
  const num = Math.floor(100 + Math.random() * 900)
  return `EXAM-${num}`
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10)
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}
