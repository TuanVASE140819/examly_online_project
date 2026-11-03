import { initializeApp } from 'firebase/app'
import {
  browserPopupRedirectResolver,
  GoogleAuthProvider,
  inMemoryPersistence,
  initializeAuth,
  signInWithPopup,
  signOut,
  type Auth,
} from 'firebase/auth'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

// Chưa cấu hình Firebase thì ẩn nút đăng nhập Google
export const isGoogleSignInEnabled = Boolean(firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId)

let auth: Auth | null = null

// Firebase chỉ dùng để lấy ID token Google; phiên đăng nhập vẫn là JWT do backend cấp
// nên không lưu phiên Firebase trong trình duyệt
function getFirebaseAuth(): Auth {
  if (!auth) {
    auth = initializeAuth(initializeApp(firebaseConfig), {
      persistence: inMemoryPersistence,
      popupRedirectResolver: browserPopupRedirectResolver,
    })
  }
  return auth
}

// Mở cửa sổ chọn tài khoản Google và trả về ID token; trả về null nếu người dùng đóng cửa sổ
export async function getGoogleIdToken(): Promise<string | null> {
  const firebaseAuth = getFirebaseAuth()
  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ prompt: 'select_account' })

  try {
    const { user } = await signInWithPopup(firebaseAuth, provider)
    return await user.getIdToken()
  } catch (err: any) {
    switch (err?.code) {
      case 'auth/popup-closed-by-user':
      case 'auth/cancelled-popup-request':
        return null
      case 'auth/popup-blocked':
        throw new Error('Trình duyệt đã chặn cửa sổ đăng nhập Google. Hãy cho phép cửa sổ bật lên rồi thử lại.')
      case 'auth/unauthorized-domain':
        throw new Error(`Tên miền ${location.hostname} chưa được phép đăng nhập Google. Hãy báo quản trị viên thêm vào Firebase.`)
      case 'auth/network-request-failed':
        throw new Error('Không kết nối được tới Google. Vui lòng kiểm tra mạng.')
      default:
        throw new Error('Đăng nhập Google thất bại. Vui lòng thử lại.')
    }
  } finally {
    await signOut(firebaseAuth).catch(() => {})
  }
}
