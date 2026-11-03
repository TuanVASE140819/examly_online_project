import { getApps, initializeApp } from 'firebase-admin/app'
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth'
import { env } from '../config/env.js'
import { AppError } from '../middleware/errorHandler.js'

export type GoogleIdentity = {
  email: string
  name?: string
}

// Chỉ dùng Firebase để xác minh ID token Google do trình duyệt gửi lên.
// Việc này chỉ cần project ID (khóa công khai của Google được tải và cache tự động), không cần service account.
function firebaseAuth() {
  if (!env.FIREBASE_PROJECT_ID) {
    throw new AppError(503, 'GOOGLE_AUTH_DISABLED', 'Máy chủ chưa bật đăng nhập bằng Google.')
  }
  const app = getApps()[0] ?? initializeApp({ projectId: env.FIREBASE_PROJECT_ID })
  return getAuth(app)
}

export async function verifyGoogleIdToken(idToken: string): Promise<GoogleIdentity> {
  const auth = firebaseAuth()

  let decoded: DecodedIdToken
  try {
    decoded = await auth.verifyIdToken(idToken)
  } catch {
    throw new AppError(401, 'INVALID_GOOGLE_TOKEN', 'Không xác minh được tài khoản Google. Vui lòng thử lại.')
  }

  // Chỉ nhận đăng nhập Google với email đã được Google xác minh, vì tài khoản được liên kết theo email
  if (decoded.firebase.sign_in_provider !== 'google.com' || !decoded.email || !decoded.email_verified) {
    throw new AppError(401, 'INVALID_GOOGLE_TOKEN', 'Tài khoản Google chưa có email đã xác minh.')
  }

  return { email: decoded.email, name: typeof decoded.name === 'string' ? decoded.name : undefined }
}
