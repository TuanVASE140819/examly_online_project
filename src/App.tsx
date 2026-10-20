import { useEffect, useState } from 'react'
import { ArrowRight, Bell, BookOpenCheck, CheckCircle2, CircleHelp, GraduationCap, LayoutDashboard, LogOut, X } from 'lucide-react'
import { api } from './api/client'
import { socketClient } from './api/socket'
import type { AuthUser } from './api/types'
import { initials, roleLabels } from './lib/format'
import { AuthScreen } from './pages/AuthScreen'
import { StudentPortal } from './pages/StudentPortal'
import { TeacherDashboard } from './pages/TeacherDashboard'

const helpText = {
  teacher: 'Quy trình: Tạo phòng thi → Thêm câu hỏi → Gửi mã phòng cho học sinh → Duyệt thí sinh → Bắt đầu kỳ thi → Theo dõi và xem điểm.',
  student: 'Quy trình: Nhập lớp và mã phòng do giáo viên cung cấp → Chờ duyệt → Làm bài khi kỳ thi bắt đầu → Nộp bài và xem điểm.',
}

function App() {
  // Vai trò được xác định từ tài khoản đăng nhập, không cho phép tự chuyển
  const [user, setUser] = useState<AuthUser | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [isLiveConnected, setIsLiveConnected] = useState(false)
  const [toast, setToast] = useState('')
  const [pendingCount, setPendingCount] = useState(0)
  const [studentCrumb, setStudentCrumb] = useState('Tham gia thi')
  const isTeacher = user?.role !== 'STUDENT'

  const logout = () => {
    api.logout()
    socketClient.disconnect()
    setUser(null)
    setPendingCount(0)
  }

  // Kiểm tra kết nối Backend API
  useEffect(() => {
    let isMounted = true
    const checkBackend = async () => {
      const ok = await api.checkHealth()
      if (isMounted) setIsLiveConnected(ok)
    }
    void checkBackend()
    const interval = setInterval(checkBackend, 10000)
    return () => {
      isMounted = false
      clearInterval(interval)
    }
  }, [])

  // Khôi phục phiên đăng nhập khi tải lại trang
  useEffect(() => {
    api.setUnauthorizedHandler(() => {
      logout()
      setToast('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.')
    })
    if (!api.getAuthToken()) {
      setAuthChecked(true)
      return
    }
    api
      .getMe()
      .then(setUser)
      .catch(() => undefined)
      .finally(() => setAuthChecked(true))
  }, [])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 4500)
    return () => window.clearTimeout(timer)
  }, [toast])

  const handleAuthenticated = (me: AuthUser) => {
    // Phiên làm bài cũ (nếu còn) không thuộc lần đăng nhập mới
    api.setParticipantToken(null)
    setUser(me)
    setToast(`Xin chào ${me.displayName}!`)
  }

  if (!authChecked) return null

  return (
    <>
      {!user ? (
        <AuthScreen isLiveConnected={isLiveConnected} onAuthenticated={handleAuthenticated} />
      ) : (
        <div className="app-shell">
          <aside className="sidebar">
            <div className="brand">
              <div className="brand-mark">
                <BookOpenCheck size={22} />
              </div>
              <div>
                <strong>examly</strong>
                <span>LEARNING PLATFORM</span>
              </div>
            </div>
            <div className="workspace-label">KHÔNG GIAN LÀM VIỆC</div>
            <button className="nav-item active">
              {isTeacher ? <LayoutDashboard size={18} /> : <GraduationCap size={18} />}
              <span>{isTeacher ? 'Tổng quan' : 'Phòng thi'}</span>
              {isTeacher && <span className="nav-dot" />}
            </button>
            <div className="sidebar-bottom">
              <div className="help-card">
                <div className="help-icon">
                  <CircleHelp size={18} />
                </div>
                <strong>Cần trợ giúp?</strong>
                <p>Hệ thống thi trắc nghiệm thời gian thực, chấm điểm tự động trên máy chủ.</p>
                <button onClick={() => setToast(isTeacher ? helpText.teacher : helpText.student)}>
                  Xem hướng dẫn <ArrowRight size={14} />
                </button>
              </div>
              <div className="profile">
                <div className="avatar">{initials(user.displayName)}</div>
                <div className="profile-copy">
                  <strong>{user.displayName}</strong>
                  <span>{roleLabels[user.role]}</span>
                </div>
                <button className="icon-button small" title="Đăng xuất" onClick={logout}>
                  <LogOut size={17} />
                </button>
              </div>
            </div>
          </aside>

          <main className="main-area">
            <header className="topbar">
              <div className="breadcrumb">
                <span>Không gian làm việc</span>
                <span className="crumb-slash">/</span>
                <strong>{isTeacher ? 'Tổng quan' : studentCrumb}</strong>
              </div>
              <div className="topbar-actions">
                <span className={`status-chip ${isLiveConnected ? 'online' : 'offline'}`}>
                  <span /> {isLiveConnected ? 'MÁY CHỦ TRỰC TUYẾN' : 'MẤT KẾT NỐI'}
                </span>
                {isTeacher && (
                  <button
                    className="icon-button"
                    title="Thông báo"
                    onClick={() => setToast(pendingCount ? `${pendingCount} yêu cầu đang chờ duyệt.` : 'Không có yêu cầu nào đang chờ duyệt.')}
                  >
                    <Bell size={18} />
                    {pendingCount > 0 && <i />}
                  </button>
                )}
                <div className="top-avatar" title={`${user.displayName} (${user.email})`}>
                  {initials(user.displayName)}
                </div>
              </div>
            </header>

            <div className="content">
              {isTeacher ? (
                <TeacherDashboard user={user} isLiveConnected={isLiveConnected} notify={setToast} onPendingChange={setPendingCount} />
              ) : (
                <StudentPortal user={user} notify={setToast} onPageChange={setStudentCrumb} />
              )}
            </div>
          </main>
        </div>
      )}

      {toast && (
        <div className="toast">
          <CheckCircle2 size={18} />
          {toast}
          <button onClick={() => setToast('')}>
            <X size={15} />
          </button>
        </div>
      )}
    </>
  )
}

export default App
