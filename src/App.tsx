import { useEffect, useState, type ReactNode } from 'react'
import {
  ArrowRight,
  Award,
  Bell,
  BookOpenCheck,
  CheckCircle2,
  CircleHelp,
  ClipboardList,
  GraduationCap,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  School,
  UserCog,
  X,
} from 'lucide-react'
import { api } from './api/client'
import { socketClient } from './api/socket'
import type { AuthUser } from './api/types'
import { initials, roleLabels } from './lib/format'
import { AdminUsers } from './pages/AdminUsers'
import { AuthScreen } from './pages/AuthScreen'
import { StudentClasses } from './pages/StudentClasses'
import { StudentGrades } from './pages/StudentGrades'
import { StudentPortal } from './pages/StudentPortal'
import { TeacherClasses } from './pages/TeacherClasses'
import { TeacherDashboard } from './pages/TeacherDashboard'

type View = 'users' | 'exams' | 'classes' | 'grades'

const navByRole: Record<AuthUser['role'], { view: View; label: string; icon: ReactNode }[]> = {
  ADMIN: [
    { view: 'users', label: 'Người dùng', icon: <UserCog size={18} /> },
    { view: 'exams', label: 'Phòng thi', icon: <LayoutDashboard size={18} /> },
    { view: 'classes', label: 'Lớp học & bài tập', icon: <School size={18} /> },
  ],
  TEACHER: [
    { view: 'exams', label: 'Phòng thi', icon: <LayoutDashboard size={18} /> },
    { view: 'classes', label: 'Lớp học & bài tập', icon: <School size={18} /> },
  ],
  STUDENT: [
    { view: 'exams', label: 'Phòng thi', icon: <GraduationCap size={18} /> },
    { view: 'classes', label: 'Lớp học & bài tập', icon: <ClipboardList size={18} /> },
    { view: 'grades', label: 'Bảng điểm', icon: <Award size={18} /> },
  ],
}

const helpText: Record<AuthUser['role'], string> = {
  ADMIN:
    'Quản trị: thêm tài khoản, đổi vai trò, đặt lại mật khẩu ở mục Người dùng. Mục Phòng thi và Lớp học hiển thị dữ liệu của mọi giáo viên.',
  TEACHER:
    'Phòng thi: Tạo phòng → Thêm câu hỏi → Duyệt thí sinh → Bắt đầu → Kết thúc → Công bố điểm. Lớp học: Tạo lớp → Gửi mã lớp → Giao bài tập → Chấm → Công bố điểm.',
  STUDENT:
    'Phòng thi: nhập mã phòng, chờ duyệt rồi làm bài. Lớp học: nhập mã lớp để nhận bài tập. Điểm thi và bài tập hiện ở Bảng điểm khi giáo viên công bố.',
}

function App() {
  // Vai trò được xác định từ tài khoản đăng nhập, không cho phép tự chuyển
  const [user, setUser] = useState<AuthUser | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [slowStart, setSlowStart] = useState(false)
  const [isLiveConnected, setIsLiveConnected] = useState(false)
  const [toast, setToast] = useState('')
  const [pendingCount, setPendingCount] = useState(0)
  const [studentCrumb, setStudentCrumb] = useState('Tham gia thi')
  const [selectedView, setView] = useState<View | null>(null)
  // Trang phòng thi được giữ nguyên khi chuyển mục để không mất bài đang làm hay theo dõi trực tiếp
  const [examsMounted, setExamsMounted] = useState(false)
  const isTeacher = user?.role !== 'STUDENT'
  const nav = user ? navByRole[user.role] : []
  // Chưa chọn mục nào thì mở mục đầu tiên của vai trò (quản trị viên: Người dùng)
  const view: View = nav.find((n) => n.view === selectedView)?.view ?? nav[0]?.view ?? 'exams'

  useEffect(() => {
    if (user && view === 'exams') setExamsMounted(true)
  }, [user, view])

  const logout = () => {
    api.logout()
    socketClient.disconnect()
    setUser(null)
    setPendingCount(0)
    setView(null)
    setExamsMounted(false)
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
    setView(null)
    setUser(me)
    setToast(`Xin chào ${me.displayName}!`)
  }

  // Máy chủ gói miễn phí ngủ khi không có truy cập, lần gọi đầu mất khoảng 1 phút.
  // Chỉ hiện thông báo khi chờ lâu để không nháy màn hình lúc máy chủ đang chạy.
  useEffect(() => {
    if (authChecked) return
    const timer = window.setTimeout(() => setSlowStart(true), 1500)
    return () => window.clearTimeout(timer)
  }, [authChecked])

  if (!authChecked) {
    if (!slowStart) return null
    return (
      <div className="center-wrap boot-wrap">
        <div className="center-card">
          <div className="center-icon">
            <LoaderCircle size={26} className="spin" />
          </div>
          <h2>Đang kết nối máy chủ...</h2>
          <p>Máy chủ đang khởi động lại sau thời gian không hoạt động, việc này mất khoảng 1 phút. Vui lòng không tải lại trang.</p>
        </div>
      </div>
    )
  }

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
                <strong>CBRN-e</strong>
                <span>LEARNING PLATFORM</span>
              </div>
            </div>
            <div className="workspace-label">KHÔNG GIAN LÀM VIỆC</div>
            <nav aria-label="Điều hướng chính">
              {nav.map((item) => (
                <button
                  key={item.view}
                  className={`nav-item ${view === item.view ? 'active' : ''}`}
                  aria-current={view === item.view ? 'page' : undefined}
                  title={item.label}
                  onClick={() => setView(item.view)}
                >
                  {item.icon}
                  <span>{item.label}</span>
                  {item.view === 'exams' && isTeacher && pendingCount > 0 && <span className="nav-dot" />}
                </button>
              ))}
            </nav>
            <div className="sidebar-bottom">
              <div className="help-card">
                <div className="help-icon">
                  <CircleHelp size={18} />
                </div>
                <strong>Cần trợ giúp?</strong>
                <p>Hệ thống thi trắc nghiệm thời gian thực, chấm điểm tự động trên máy chủ.</p>
                <button onClick={() => setToast(helpText[user.role])}>
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
              <div className="credit">Credit: VuBinDev</div>
            </div>
          </aside>

          <main className="main-area">
            <header className="topbar">
              <div className="breadcrumb">
                <span>Không gian làm việc</span>
                <span className="crumb-slash">/</span>
                <strong>{view === 'exams' && !isTeacher ? studentCrumb : nav.find((n) => n.view === view)?.label}</strong>
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
              {examsMounted && (
                <div hidden={view !== 'exams'}>
                  {isTeacher ? (
                    <TeacherDashboard user={user} isLiveConnected={isLiveConnected} notify={setToast} onPendingChange={setPendingCount} />
                  ) : (
                    <StudentPortal user={user} notify={setToast} onPageChange={setStudentCrumb} />
                  )}
                </div>
              )}
              {view === 'users' && user.role === 'ADMIN' && <AdminUsers currentUser={user} notify={setToast} />}
              {view === 'classes' && (isTeacher ? <TeacherClasses user={user} notify={setToast} /> : <StudentClasses notify={setToast} />)}
              {view === 'grades' && !isTeacher && <StudentGrades notify={setToast} />}
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
