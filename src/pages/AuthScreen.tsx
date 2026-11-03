import { useState } from 'react'
import { BookOpenCheck, GraduationCap, LayoutDashboard, Lock, LogIn, Mail, ShieldAlert, ShieldCheck, UserPlus, UserRound } from 'lucide-react'
import { api, ApiError } from '../api/client'
import type { AuthUser } from '../api/types'
import { getGoogleIdToken, isGoogleSignInEnabled } from '../lib/firebase'

type Mode = 'login' | 'register'

export function AuthScreen({ isLiveConnected, onAuthenticated }: { isLiveConnected: boolean; onAuthenticated: (user: AuthUser) => void }) {
  const [mode, setMode] = useState<Mode>('login')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'TEACHER' | 'STUDENT'>('STUDENT')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const switchMode = (next: Mode) => {
    setMode(next)
    setError('')
  }

  const submit = async () => {
    setError('')
    if (!email.trim() || !password || (mode === 'register' && !displayName.trim())) {
      setError('Vui lòng nhập đầy đủ thông tin.')
      return
    }
    if (mode === 'register' && password.length < 8) {
      setError('Mật khẩu phải từ 8 ký tự trở lên.')
      return
    }
    setLoading(true)
    try {
      const user =
        mode === 'login'
          ? await api.login(email.trim(), password)
          : await api.register({ email: email.trim(), password, displayName: displayName.trim(), role })
      onAuthenticated(user)
    } catch (err: any) {
      setError(err.message)
      setLoading(false)
    }
  }

  const signInWithGoogle = async () => {
    setError('')
    setLoading(true)
    try {
      const idToken = await getGoogleIdToken()
      if (!idToken) {
        setLoading(false)
        return
      }
      // Chỉ gửi vai trò ở mục Đăng ký; tài khoản đã có thì giữ nguyên vai trò cũ
      onAuthenticated(await api.loginWithGoogle(idToken, mode === 'register' ? role : undefined))
    } catch (err: any) {
      // Tài khoản Google mới: chuyển sang Đăng ký để chọn vai trò trước khi tạo tài khoản
      if (err instanceof ApiError && err.code === 'GOOGLE_ACCOUNT_NOT_REGISTERED') setMode('register')
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <div className="login-shell">
      <div className="join-card login-card">
        <div className="brand">
          <div className="brand-mark">
            <BookOpenCheck size={22} />
          </div>
          <div>
            <strong>CBRN-e</strong>
            <span>LEARNING PLATFORM</span>
          </div>
        </div>
        <div className="auth-tabs" role="tablist">
          <button role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'active' : ''} onClick={() => switchMode('login')}>
            Đăng nhập
          </button>
          <button role="tab" aria-selected={mode === 'register'} className={mode === 'register' ? 'active' : ''} onClick={() => switchMode('register')}>
            Đăng ký
          </button>
        </div>
        <h2>{mode === 'login' ? 'Chào mừng trở lại!' : 'Tạo tài khoản mới'}</h2>
        <p className="form-subtitle">
          {mode === 'login'
            ? 'Đăng nhập để hệ thống xác định bạn là giáo viên hay học sinh.'
            : 'Chọn vai trò của bạn. Giáo viên tạo và quản lý phòng thi, học sinh tham gia làm bài.'}
        </p>
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          {mode === 'register' && (
            <>
              <label>Vai trò</label>
              <div className="duration-options role-options">
                <button type="button" className={role === 'STUDENT' ? 'selected' : ''} onClick={() => setRole('STUDENT')}>
                  <GraduationCap size={15} /> Học sinh
                </button>
                <button type="button" className={role === 'TEACHER' ? 'selected' : ''} onClick={() => setRole('TEACHER')}>
                  <LayoutDashboard size={15} /> Giáo viên
                </button>
              </div>
              <label>
                Họ và tên <span>*</span>
              </label>
              <div className="input-with-icon">
                <UserRound size={17} />
                <input autoComplete="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Ví dụ: Nguyễn Minh Anh" />
              </div>
            </>
          )}
          <label>
            Email <span>*</span>
          </label>
          <div className="input-with-icon">
            <Mail size={17} />
            <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ten@truonghoc.vn" />
          </div>
          <label>
            Mật khẩu <span>*</span>
          </label>
          <div className="input-with-icon">
            <Lock size={17} />
            <input
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === 'login' ? 'Nhập mật khẩu' : 'Tối thiểu 8 ký tự'}
            />
          </div>
          {error && (
            <div className="error-message">
              <ShieldAlert size={15} />
              {error}
            </div>
          )}
          <button className="button primary full-button" type="submit" disabled={loading}>
            {loading ? (
              'Đang xử lý...'
            ) : mode === 'login' ? (
              <>
                Đăng nhập <LogIn size={17} />
              </>
            ) : (
              <>
                Tạo tài khoản <UserPlus size={17} />
              </>
            )}
          </button>
        </form>
        {isGoogleSignInEnabled && (
          <>
            <div className="auth-divider">hoặc</div>
            <button type="button" className="button secondary full-button google-button" disabled={loading} onClick={() => void signInWithGoogle()}>
              <GoogleLogo /> Tiếp tục với Google
            </button>
          </>
        )}
        <div className="privacy-note">
          <ShieldCheck size={15} /> {isLiveConnected ? 'Đã kết nối máy chủ — phiên đăng nhập được bảo vệ bằng JWT.' : 'Đang chờ máy chủ khởi động (có thể mất khoảng 1 phút)...'}
        </div>
        <div className="credit">Credit: VuBinDev</div>
      </div>
    </div>
  )
}

function GoogleLogo() {
  return (
    <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}
