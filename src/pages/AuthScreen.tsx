import { useState } from 'react'
import { BookOpenCheck, GraduationCap, LayoutDashboard, Lock, LogIn, Mail, ShieldAlert, ShieldCheck, UserPlus, UserRound } from 'lucide-react'
import { api } from '../api/client'
import type { AuthUser } from '../api/types'

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
        <div className="privacy-note">
          <ShieldCheck size={15} /> {isLiveConnected ? 'Đã kết nối máy chủ — phiên đăng nhập được bảo vệ bằng JWT.' : 'Đang chờ máy chủ khởi động (có thể mất khoảng 1 phút)...'}
        </div>
        <div className="credit">Credit: VuBinDev</div>
      </div>
    </div>
  )
}
