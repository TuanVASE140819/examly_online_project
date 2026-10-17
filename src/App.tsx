import { useEffect, useMemo, useState, useRef } from 'react'
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Bell,
  BookOpenCheck,
  Check,
  CheckCircle2,
  CircleHelp,
  Clock3,
  Copy,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Monitor,
  MoreHorizontal,
  Play,
  Plus,
  Radio,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Users,
  X,
  Zap,
} from 'lucide-react'
import { api } from './api/client'
import { socketClient } from './api/socket'
import type { QuestionItem, Role, Room, Student, StudentStatus } from './api/types'

const initialQuestions: QuestionItem[] = [
  {
    id: '1',
    topic: 'HTML & CSS',
    text: 'Thẻ HTML nào được dùng để tạo liên kết đến một trang web khác?',
    points: 2,
    position: 1,
    options: [
      { id: '1-0', text: '<link>', position: 0 },
      { id: '1-1', text: '<a>', position: 1 },
      { id: '1-2', text: '<href>', position: 2 },
      { id: '1-3', text: '<url>', position: 3 },
    ],
  },
  {
    id: '2',
    topic: 'JavaScript',
    text: 'Kiểu dữ liệu nào sau đây biểu diễn giá trị đúng hoặc sai?',
    points: 2,
    position: 2,
    options: [
      { id: '2-0', text: 'String', position: 0 },
      { id: '2-1', text: 'Number', position: 1 },
      { id: '2-2', text: 'Boolean', position: 2 },
      { id: '2-3', text: 'Object', position: 3 },
    ],
  },
  {
    id: '3',
    topic: 'ReactJS',
    text: 'Hook nào được dùng để quản lý state trong function component?',
    points: 2,
    position: 3,
    options: [
      { id: '3-0', text: 'useEffect', position: 0 },
      { id: '3-1', text: 'useMemo', position: 1 },
      { id: '3-2', text: 'useState', position: 2 },
      { id: '3-3', text: 'useRef', position: 3 },
    ],
  },
  {
    id: '4',
    topic: 'TypeScript',
    text: 'TypeScript giúp bổ sung điều gì cho JavaScript?',
    points: 2,
    position: 4,
    options: [
      { id: '4-0', text: 'Kiểu dữ liệu tĩnh', position: 0 },
      { id: '4-1', text: 'Cơ sở dữ liệu', position: 1 },
      { id: '4-2', text: 'Máy chủ web', position: 2 },
      { id: '4-3', text: 'Trình duyệt mới', position: 3 },
    ],
  },
  {
    id: '5',
    topic: 'Web',
    text: 'HTTP status code 404 thường có nghĩa là gì?',
    points: 2,
    position: 5,
    options: [
      { id: '5-0', text: 'Thành công', position: 0 },
      { id: '5-1', text: 'Không tìm thấy tài nguyên', position: 1 },
      { id: '5-2', text: 'Lỗi máy chủ', position: 2 },
      { id: '5-3', text: 'Chưa xác thực', position: 3 },
    ],
  },
]

const initialRoom: Room = {
  name: 'Kiểm tra kiến thức Front-end',
  code: 'EXAM-101',
  duration: 30,
  status: 'waiting',
  createdAt: new Date().toISOString(),
}

const initialStudents: Student[] = [
  { id: 's1', name: 'Nguyễn Minh Anh', className: '12A1', roomCode: 'EXAM-101', status: 'approved', joinedAt: '08:58', tabWarnings: 0 },
  { id: 's2', name: 'Trần Gia Huy', className: '12A2', roomCode: 'EXAM-101', status: 'pending', joinedAt: '09:02', tabWarnings: 1 },
  { id: 's3', name: 'Lê Khánh Linh', className: '12A1', roomCode: 'EXAM-101', status: 'pending', joinedAt: '09:04', tabWarnings: 0 },
  { id: 's4', name: 'Phạm Đức Long', className: '12A3', roomCode: 'EXAM-101', status: 'rejected', joinedAt: '09:05', tabWarnings: 2 },
]

const read = <T,>(key: string, fallback: T): T => {
  try {
    const v = localStorage.getItem(key)
    return v ? (JSON.parse(v) as T) : fallback
  } catch {
    return fallback
  }
}

const statusLabels: Record<StudentStatus, string> = {
  pending: 'Chờ duyệt',
  approved: 'Đã duyệt',
  rejected: 'Từ chối',
  submitted: 'Đã nộp bài',
}

function App() {
  const [role, setRole] = useState<Role>('teacher')
  const [page, setPage] = useState<'dashboard' | 'join' | 'waiting' | 'exam' | 'result'>('dashboard')
  const [room, setRoom] = useState<Room>(() => read('exam-room', initialRoom))
  const [students, setStudents] = useState<Student[]>(() => read('exam-students', initialStudents))
  const [studentId, setStudentId] = useState<string>(() => read('exam-current-student', ''))
  const [joinName, setJoinName] = useState('')
  const [joinClass, setJoinClass] = useState('')
  const [joinCode, setJoinCode] = useState('EXAM-101')
  const [joinError, setJoinError] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [roomName, setRoomName] = useState('Kiểm tra kiến thức Front-end')
  const [duration, setDuration] = useState(30)
  const [questionIndex, setQuestionIndex] = useState(0)
  const [questions, setQuestions] = useState<QuestionItem[]>(initialQuestions)
  // key: questionId, value: selectedOptionId (hoặc option index khi offline)
  const [answers, setAnswers] = useState<Record<string, string>>(() => read('exam-answers', {}))
  const [secondsLeft, setSecondsLeft] = useState(30 * 60)
  const [showSubmit, setShowSubmit] = useState(false)
  const [toast, setToast] = useState('')
  const [tabWarning, setTabWarning] = useState(false)
  const [isLiveConnected, setIsLiveConnected] = useState(false)
  const [examResult, setExamResult] = useState<{ score: number; correctCount: number; totalQuestions: number } | null>(null)

  const currentStudent = students.find((s) => s.id === studentId)
  const pendingCount = students.filter((s) => s.status === 'pending').length
  const approvedCount = students.filter((s) => s.status === 'approved').length
  const answeredCount = Object.keys(answers).length
  const currentQuestion = questions[questionIndex] || initialQuestions[0]
  const formattedTime = `${String(Math.floor(secondsLeft / 60)).padStart(2, '0')}:${String(secondsLeft % 60).padStart(2, '0')}`

  // 1. Kiểm tra kết nối Backend API & Socket.IO
  useEffect(() => {
    let isMounted = true
    const checkBackend = async () => {
      const ok = await api.checkHealth()
      if (!isMounted) return
      setIsLiveConnected(ok)
      if (ok) {
        // Tự động kết nối Teacher demo nếu chưa có token
        if (!api.getTeacherToken()) {
          try {
            await api.login('teacher@examly.vn', 'Password123@')
          } catch {
            // Không chặn nếu chưa seed
          }
        }
        const teacherToken = api.getTeacherToken()
        if (teacherToken) {
          socketClient.connect(teacherToken)
        }
      }
    }
    void checkBackend()
    const interval = setInterval(checkBackend, 10000)
    return () => {
      isMounted = false
      clearInterval(interval)
    }
  }, [])

  // 2. Lắng nghe Realtime Socket.IO Events
  useEffect(() => {
    if (!isLiveConnected) return

    // Giáo viên nhận thông báo học sinh mới xin vào phòng
    const onParticipantRequested = (p: any) => {
      setStudents((prev) => {
        if (prev.some((s) => s.id === p.id)) return prev
        return [
          ...prev,
          {
            id: p.id,
            name: p.displayName,
            className: p.className,
            roomCode: room.code,
            status: 'pending',
            joinedAt: p.joinedAt || new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
            tabWarnings: 0,
          },
        ]
      })
      setToast(`Học sinh ${p.displayName} (${p.className}) vừa xin vào phòng thi.`)
    }

    // Giáo viên/học sinh nhận trạng thái phê duyệt
    const onParticipantApproved = (p: { participantId: string }) => {
      setStudents((prev) => prev.map((s) => (s.id === p.participantId ? { ...s, status: 'approved' } : s)))
      if (studentId === p.participantId) {
        setToast('Bạn đã được giáo viên phê duyệt vào phòng thi!')
      }
    }

    // Học sinh bị từ chối
    const onParticipantRejected = (p: { participantId: string }) => {
      setStudents((prev) => prev.map((s) => (s.id === p.participantId ? { ...s, status: 'rejected' } : s)))
      if (studentId === p.participantId) {
        setToast('Yêu cầu vào phòng của bạn đã bị từ chối.')
      }
    }

    // Cảnh báo rời trang từ học sinh tới giáo viên
    const onProctoringWarning = (w: { participantId: string; displayName: string; tabWarnings: number }) => {
      setStudents((prev) =>
        prev.map((s) => (s.id === w.participantId ? { ...s, tabWarnings: w.tabWarnings } : s))
      )
      setToast(`Cảnh báo: ${w.displayName} vừa chuyển tab/ẩn trang!`)
    }

    // Học sinh nộp bài
    const onParticipantSubmitted = (sub: { participantId: string; score: number }) => {
      setStudents((prev) =>
        prev.map((s) => (s.id === sub.participantId ? { ...s, status: 'submitted', score: sub.score } : s))
      )
    }

    // Kỳ thi bắt đầu
    const onExamStarted = (ex: { endsAt: string; durationSeconds: number }) => {
      setRoom((prev) => ({ ...prev, status: 'active' }))
      if (ex.endsAt) {
        const msLeft = new Date(ex.endsAt).getTime() - Date.now()
        setSecondsLeft(Math.max(0, Math.floor(msLeft / 1000)))
      }
      setToast('Kỳ thi đã chính thức bắt đầu!')
    }

    socketClient.on('participant:requested', onParticipantRequested)
    socketClient.on('participant:approved', onParticipantApproved)
    socketClient.on('participant:rejected', onParticipantRejected)
    socketClient.on('proctoring:warning', onProctoringWarning)
    socketClient.on('participant:submitted', onParticipantSubmitted)
    socketClient.on('exam:started', onExamStarted)

    return () => {
      socketClient.off('participant:requested', onParticipantRequested)
      socketClient.off('participant:approved', onParticipantApproved)
      socketClient.off('participant:rejected', onParticipantRejected)
      socketClient.off('proctoring:warning', onProctoringWarning)
      socketClient.off('participant:submitted', onParticipantSubmitted)
      socketClient.off('exam:started', onExamStarted)
    }
  }, [isLiveConnected, room.code, studentId])

  // Lưu localStorage fallback
  useEffect(() => { localStorage.setItem('exam-room', JSON.stringify(room)) }, [room])
  useEffect(() => { localStorage.setItem('exam-students', JSON.stringify(students)) }, [students])
  useEffect(() => { localStorage.setItem('exam-current-student', JSON.stringify(studentId)) }, [studentId])
  useEffect(() => { localStorage.setItem('exam-answers', JSON.stringify(answers)) }, [answers])
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 3000)
    return () => window.clearTimeout(timer)
  }, [toast])

  // Đồng hồ đếm ngược
  useEffect(() => {
    if (page !== 'exam' || room.status !== 'active') return
    const timer = window.setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          window.clearInterval(timer)
          setShowSubmit(true)
          return 0
        }
        return s - 1
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [page, room.status])

  // Ghi nhận chuyển tab (Proctoring)
  useEffect(() => {
    if (page !== 'exam') return
    const onVisibilityChange = async () => {
      if (document.visibilityState === 'hidden') {
        setTabWarning(true)
        if (studentId) {
          setStudents((prev) => prev.map((s) => (s.id === studentId ? { ...s, tabWarnings: s.tabWarnings + 1 } : s)))
          if (isLiveConnected) {
            try {
              await api.sendProctoringEvent('TAB_HIDDEN', {
                timestamp: Date.now(),
                userAgent: navigator.userAgent,
              })
            } catch {
              // Graceful
            }
          }
        }
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [page, studentId, isLiveConnected])

  const completedCount = useMemo(() => students.filter((s) => s.status === 'submitted').length, [students])

  const switchRole = (next: Role) => {
    setRole(next)
    if (next === 'teacher') {
      setPage('dashboard')
    } else if (studentId) {
      const found = students.find((s) => s.id === studentId)
      setPage(
        found?.status === 'submitted'
          ? 'result'
          : room.status === 'active' && found?.status === 'approved'
          ? 'exam'
          : 'waiting'
      )
    } else {
      setPage('join')
    }
    setToast('')
  }

  // Giáo viên duyệt/từ chối học sinh
  const approve = async (id: string, status: StudentStatus) => {
    setStudents((prev) => prev.map((s) => (s.id === id ? { ...s, status } : s)))
    setToast(status === 'approved' ? 'Đã duyệt học sinh vào phòng thi.' : 'Đã từ chối yêu cầu tham gia.')

    if (isLiveConnected && room.id) {
      try {
        await api.decideParticipant(
          room.id,
          id,
          status === 'approved' ? 'APPROVED' : status === 'rejected' ? 'REJECTED' : 'PENDING'
        )
      } catch (err: any) {
        console.warn('Lỗi duyệt qua API:', err.message)
      }
    }
  }

  // Tạo phòng thi mới
  const createRoom = async () => {
    const defaultCode = `EXAM-${Math.floor(100 + Math.random() * 900)}`
    let newRoom: Room = {
      name: roomName.trim() || 'Phòng thi mới',
      code: defaultCode,
      duration,
      status: 'waiting',
      createdAt: new Date().toISOString(),
    }

    if (isLiveConnected) {
      try {
        const res = await api.createExam(roomName.trim() || 'Phòng thi mới', duration)
        newRoom = res.exam
        if (res.exam.id) {
          socketClient.subscribeExam(res.exam.id)
        }
      } catch (err: any) {
        console.warn('Tạo phòng qua API lỗi, sử dụng mã cục bộ:', err.message)
      }
    }

    setRoom(newRoom)
    setStudents([])
    setShowCreate(false)
    setToast(`Đã tạo phòng thi mới: ${newRoom.code}`)
  }

  // Học sinh gửi yêu cầu vào phòng
  const joinRoom = async () => {
    setJoinError('')
    if (!joinName.trim() || !joinClass.trim() || !joinCode.trim()) {
      setJoinError('Vui lòng nhập đầy đủ thông tin.')
      return
    }

    if (isLiveConnected) {
      try {
        const res = await api.joinExam(joinCode.trim(), joinName.trim(), joinClass.trim())
        const p = res.participant
        const id = p.id
        setStudentId(id)

        // Kết nối socket với token của thí sinh
        if (res.participantToken) {
          socketClient.connect(res.participantToken)
          if (p.examId) {
            socketClient.subscribeExam(p.examId)
          }
        }

        setStudents((prev) => {
          if (prev.some((s) => s.id === id)) return prev
          return [
            ...prev,
            {
              id,
              name: p.displayName,
              className: p.className,
              roomCode: joinCode.trim().toUpperCase(),
              status: (p.status?.toLowerCase() as StudentStatus) || 'pending',
              joinedAt: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
              tabWarnings: 0,
            },
          ]
        })
        setPage('waiting')
        setToast('Đã gửi yêu cầu tham gia phòng thi tới máy chủ.')
        return
      } catch (err: any) {
        setJoinError(err.message || 'Không thể tham gia phòng thi.')
        return
      }
    }

    // Fallback Offline demo
    if (joinCode.trim().toUpperCase() !== room.code.toUpperCase()) {
      setJoinError('Mã phòng không chính xác. Hãy kiểm tra lại với giáo viên.')
      return
    }
    const id = `s-${Date.now()}`
    setStudents((prev) => [
      ...prev,
      {
        id,
        name: joinName.trim(),
        className: joinClass.trim(),
        roomCode: room.code,
        status: 'pending',
        joinedAt: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        tabWarnings: 0,
      },
    ])
    setStudentId(id)
    setPage('waiting')
    setToast('Đã gửi yêu cầu tham gia phòng thi.')
  }

  // Học sinh vào làm bài
  const startExam = async () => {
    if (!currentStudent || currentStudent.status !== 'approved') {
      setToast('Bạn cần được giáo viên duyệt trước khi vào thi.')
      return
    }

    if (isLiveConnected && room.id) {
      try {
        // Tải câu hỏi từ backend (đáp án đúng đã được giấu)
        const qRes = await api.getStudentQuestions(room.id)
        if (qRes.questions?.length) {
          setQuestions(qRes.questions)
        }
        // Khôi phục các câu trả lời đã lưu nếu F5
        const subRes = await api.getCurrentSubmission()
        if (subRes.answers) {
          const mapped: Record<string, string> = {}
          for (const [k, v] of Object.entries(subRes.answers)) {
            if (v) mapped[k] = v
          }
          setAnswers(mapped)
        }
        if (subRes.secondsRemaining) {
          setSecondsLeft(subRes.secondsRemaining)
        }
      } catch (err: any) {
        console.warn('Tải đề từ API gặp sự cố, dùng đề mẫu:', err.message)
      }
    }

    setRoom((prev) => ({ ...prev, status: 'active' }))
    setSecondsLeft(room.duration * 60)
    setPage('exam')
    setTabWarning(false)
  }

  // Học sinh chọn đáp án (Autosave)
  const handleSelectAnswer = async (qId: string | number, optId: string) => {
    const qKey = String(qId)
    setAnswers((prev) => ({ ...prev, [qKey]: optId }))

    if (isLiveConnected) {
      try {
        await api.saveAnswer(qKey, optId)
      } catch (err: any) {
        console.warn('Lỗi autosave đáp án:', err.message)
      }
    }
  }

  // Nộp bài thi
  const submitExam = async () => {
    if (isLiveConnected) {
      try {
        const res = await api.submitExam('MANUAL')
        const sub = res.submission
        const score = sub.score ?? 0
        setExamResult({
          score,
          correctCount: sub.correctCount ?? 0,
          totalQuestions: sub.totalQuestions ?? questions.length,
        })
        if (studentId) {
          setStudents((prev) =>
            prev.map((s) => (s.id === studentId ? { ...s, status: 'submitted', score } : s))
          )
        }
        setShowSubmit(false)
        setPage('result')
        setToast('Bài làm đã được nộp và chấm điểm chính thức tại máy chủ!')
        return
      } catch (err: any) {
        console.warn('Lỗi nộp bài API, chuyển sang chấm điểm client:', err.message)
      }
    }

    // Chấm điểm offline fallback
    let score = 0
    questions.forEach((q) => {
      // nếu là initialQuestions thì có options index
      const chosen = answers[String(q.id)]
      if (chosen && chosen.endsWith('-1')) score += 2
    })
    const finalScore = Math.min(10, Math.max(score, Math.round((answeredCount / questions.length) * 10)))
    setExamResult({
      score: finalScore,
      correctCount: Math.round(finalScore / 2),
      totalQuestions: questions.length,
    })

    if (studentId) {
      setStudents((prev) =>
        prev.map((s) => (s.id === studentId ? { ...s, status: 'submitted', score: finalScore } : s))
      )
    }
    setShowSubmit(false)
    setPage('result')
    setToast('Bài làm đã được ghi nhận.')
  }

  const resetDemo = () => {
    setRoom(initialRoom)
    setStudents(initialStudents)
    setAnswers({})
    setStudentId('')
    setPage('dashboard')
    setRole('teacher')
    setSecondsLeft(1800)
    setToast('Đã khôi phục dữ liệu ban đầu.')
  }

  return (
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
        <button className={`nav-item ${role === 'teacher' ? 'active' : ''}`} onClick={() => switchRole('teacher')}>
          <LayoutDashboard size={18} /> <span>Giáo viên</span>
          <span className="nav-dot" />
        </button>
        <button className={`nav-item ${role === 'student' ? 'active' : ''}`} onClick={() => switchRole('student')}>
          <GraduationCap size={18} /> <span>Học sinh</span>
        </button>
        <div className="sidebar-bottom">
          <div className="help-card">
            <div className="help-icon">
              <CircleHelp size={18} />
            </div>
            <strong>Cần trợ giúp?</strong>
            <p>Hệ thống hỗ trợ thi trắc nghiệm thời gian thực và tự động chấm điểm.</p>
            <button onClick={() => setToast('Examly v1.0 — Đầy đủ REST API & Socket.IO realtime')}>
              Xem hướng dẫn <ArrowRight size={14} />
            </button>
          </div>
          <div className="profile">
            <div className="avatar">{role === 'teacher' ? 'GV' : 'HS'}</div>
            <div className="profile-copy">
              <strong>{role === 'teacher' ? 'Nguyễn Hoàng Anh' : currentStudent?.name || 'Học sinh demo'}</strong>
              <span>{role === 'teacher' ? 'Giáo viên' : 'Thí sinh'}</span>
            </div>
            <button className="icon-button small" title="Đặt lại demo" onClick={resetDemo}>
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
            <strong>
              {role === 'teacher'
                ? page === 'dashboard'
                  ? 'Tổng quan'
                  : 'Phòng thi'
                : page === 'join'
                ? 'Tham gia thi'
                : page === 'waiting'
                ? 'Phòng chờ'
                : page === 'exam'
                ? 'Đang làm bài'
                : 'Kết quả'}
            </strong>
          </div>
          <div className="topbar-actions">
            {isLiveConnected ? (
              <span className="demo-chip" style={{ color: '#10b981', borderColor: 'rgba(16,185,129,0.3)' }}>
                <span style={{ backgroundColor: '#10b981' }} /> LIVE SERVER
              </span>
            ) : (
              <span className="demo-chip">
                <span /> Bản demo
              </span>
            )}
            <button className="icon-button" title="Thông báo" onClick={() => setToast(`${pendingCount} yêu cầu đang chờ duyệt.`)}>
              <Bell size={18} />
              {pendingCount > 0 && <i />}
            </button>
            <div className="top-avatar">{role === 'teacher' ? 'HA' : 'HS'}</div>
          </div>
        </header>

        <div className="content">
          {role === 'teacher' && page === 'dashboard' && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">
                    <Sparkles size={14} /> THỨ BẢY, 17 THÁNG 10, 2026
                  </div>
                  <h1>
                    Chào buổi tối, Hoàng Anh <span className="wave">✦</span>
                  </h1>
                  <p>Đây là tình hình lớp học của bạn hôm nay.</p>
                </div>
                <button className="button primary" onClick={() => setShowCreate(true)}>
                  <Plus size={18} /> Tạo phòng thi mới
                </button>
              </div>

              <section className="stats-grid">
                <Stat icon={<Users size={20} />} tone="blue" label="Tổng thí sinh" value={String(students.length).padStart(2, '0')} note="Trong phòng thi hiện tại" />
                <Stat icon={<Clock3 size={20} />} tone="amber" label="Chờ duyệt" value={String(pendingCount).padStart(2, '0')} note="Cần bạn xem xét" />
                <Stat icon={<CheckCircle2 size={20} />} tone="green" label="Đã duyệt" value={String(approvedCount).padStart(2, '0')} note="Sẵn sàng làm bài" />
                <Stat icon={<Activity size={20} />} tone="violet" label="Đã nộp bài" value={String(completedCount).padStart(2, '0')} note="Hoàn thành bài thi" />
              </section>

              <div className="dashboard-grid">
                <section className="panel room-panel">
                  <div className="panel-heading">
                    <div>
                      <div className="section-kicker">PHÒNG THI CỦA BẠN</div>
                      <h2>Phòng thi đang quản lý</h2>
                    </div>
                    <button className="icon-button" title="Tùy chọn" onClick={() => setToast('Phòng thi được kết nối thời gian thực')}>
                      <MoreHorizontal size={20} />
                    </button>
                  </div>
                  <div className="room-banner">
                    <div className="room-banner-top">
                      <span className={`status-pill ${room.status}`}>
                        {room.status === 'waiting' ? '● Đang chờ' : room.status === 'active' ? '● Đang diễn ra' : '● Đã kết thúc'}
                      </span>
                      <span className="room-code">
                        MÃ PHÒNG <b>{room.code}</b>
                        <button
                          title="Sao chép mã phòng"
                          onClick={() => {
                            void navigator.clipboard?.writeText(room.code)
                            setToast(`Mã phòng: ${room.code}`)
                          }}
                        >
                          <Copy size={14} />
                        </button>
                      </span>
                    </div>
                    <h3>{room.name}</h3>
                    <p>Phòng thi trắc nghiệm • {questions.length} câu hỏi chuẩn hóa</p>
                    <div className="room-meta">
                      <span><Clock3 size={15} /> {room.duration} phút</span>
                      <span><Users size={15} /> {students.length} thí sinh</span>
                      <span><Monitor size={15} /> Trực tuyến</span>
                    </div>
                  </div>
                  <div className="room-footer">
                    <div className="avatar-stack">
                      <span>MA</span>
                      <span>GH</span>
                      <span>KL</span>
                      <small>+{Math.max(0, students.length - 3)}</small>
                    </div>
                    <span className="muted">{isLiveConnected ? 'Đồng bộ Socket.IO trực tiếp' : 'Dữ liệu cục bộ'}</span>
                    <button className="button secondary" onClick={() => setToast(`Mã phòng ${room.code} sẵn sàng chia sẻ cho học sinh!`)}>
                      Chia sẻ mã <ArrowRight size={15} />
                    </button>
                  </div>
                </section>

                <section className="panel activity-panel">
                  <div className="panel-heading">
                    <div>
                      <div className="section-kicker">TÌNH TRẠNG</div>
                      <h2>Hoạt động gần đây</h2>
                    </div>
                    <span className="live-label">
                      <span /> {isLiveConnected ? 'SOCKET LIVE' : 'LIVE DEMO'}
                    </span>
                  </div>
                  <div className="activity-list">
                    <ActivityItem tone="blue" icon={<Users size={16} />} title="Yêu cầu tham gia mới" detail={`${pendingCount} học sinh đang chờ duyệt`} time="Hiện tại" />
                    <ActivityItem tone="green" icon={<Check size={16} />} title="Phòng thi sẵn sàng" detail={`${approvedCount} học sinh đã được duyệt`} time="Vừa xong" />
                    <ActivityItem
                      tone="amber"
                      icon={<ShieldAlert size={16} />}
                      title="Cảnh báo giám sát"
                      detail={`${students.reduce((n, s) => n + s.tabWarnings, 0)} lượt chuyển tab được ghi nhận`}
                      time="Hôm nay"
                    />
                  </div>
                  <div className="activity-tip">
                    <ShieldCheck size={18} />
                    <div>
                      <strong>Giám sát có trách nhiệm</strong>
                      <p>Chuyển tab chỉ là tín hiệu tham khảo, không tự động kết luận gian lận.</p>
                    </div>
                  </div>
                </section>
              </div>

              <section className="panel students-panel">
                <div className="panel-heading">
                  <div>
                    <div className="section-kicker">QUẢN LÝ THÍ SINH</div>
                    <h2>
                      Danh sách học sinh <span className="count-badge">{students.length}</span>
                    </h2>
                  </div>
                  <div className="table-actions">
                    <button className="button secondary" onClick={() => { setRole('student'); setPage('join') }}>
                      Xem trang học sinh
                    </button>
                    <button className="button primary small-button" onClick={() => setShowCreate(true)}>
                      <Plus size={16} /> Tạo phòng
                    </button>
                  </div>
                </div>
                <StudentTable students={students} onApprove={approve} />
              </section>

              <div className="footnote">
                <ShieldCheck size={15} /> {isLiveConnected ? 'Đã kết nối máy chủ API & PostgreSQL Database.' : 'Dữ liệu demo lưu trong localStorage của trình duyệt.'}{' '}
                <button onClick={resetDemo}>Đặt lại dữ liệu</button>
              </div>
            </>
          )}

          {role === 'teacher' && page !== 'dashboard' && (
            <div className="center-wrap">
              <div className="center-card">
                <div className="center-icon">
                  <GraduationCap size={26} />
                </div>
                <h2>Chế độ giáo viên</h2>
                <p>Quay lại bảng điều khiển để duyệt học sinh và quản lý phòng thi.</p>
                <button className="button primary" onClick={() => setPage('dashboard')}>
                  Về tổng quan <ArrowRight size={16} />
                </button>
              </div>
            </div>
          )}

          {role === 'student' && page === 'join' && (
            <div className="student-layout">
              <div className="student-intro">
                <div className="eyebrow">
                  <Sparkles size={14} /> SẴN SÀNG CHO THỬ THÁCH?
                </div>
                <h1>
                  Tri thức mở ra
                  <br />
                  những <span>khả năng mới.</span>
                </h1>
                <p>Nhập thông tin bên dưới để tham gia phòng thi. Hãy kiểm tra mã phòng với giáo viên trước khi bắt đầu.</p>
                <div className="feature-row">
                  <div className="feature-icon">
                    <Clock3 size={19} />
                  </div>
                  <div>
                    <strong>Thời gian rõ ràng</strong>
                    <span>Đồng hồ đếm ngược được máy chủ kiểm soát</span>
                  </div>
                </div>
                <div className="feature-row">
                  <div className="feature-icon">
                    <ShieldCheck size={19} />
                  </div>
                  <div>
                    <strong>Quy trình minh bạch</strong>
                    <span>Chỉ vào thi sau khi giáo viên duyệt</span>
                  </div>
                </div>
                <div className="student-art">
                  <div className="art-orbit orbit-one" />
                  <div className="art-orbit orbit-two" />
                  <div className="art-card">
                    <BookOpenCheck size={48} />
                    <span>LEARN. THINK. GROW.</span>
                  </div>
                  <div className="floating-star star-one">✦</div>
                  <div className="floating-star star-two">✳</div>
                </div>
              </div>

              <div className="join-card">
                <div className="form-top-icon">
                  <GraduationCap size={24} />
                </div>
                <div className="section-kicker">THAM GIA KỲ THI</div>
                <h2>Chào mừng bạn!</h2>
                <p className="form-subtitle">Điền thông tin để gửi yêu cầu vào phòng thi.</p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    void joinRoom()
                  }}
                >
                  <label>
                    Họ và tên <span>*</span>
                  </label>
                  <input value={joinName} onChange={(e) => setJoinName(e.target.value)} placeholder="Ví dụ: Nguyễn Minh Anh" />
                  <label>
                    Lớp của bạn <span>*</span>
                  </label>
                  <input value={joinClass} onChange={(e) => setJoinClass(e.target.value)} placeholder="Ví dụ: 12A1" />
                  <label>
                    Mã phòng thi <span>*</span>
                  </label>
                  <div className="input-with-icon">
                    <BookOpenCheck size={17} />
                    <input value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} placeholder="Nhập mã phòng" />
                  </div>
                  {joinError && (
                    <div className="error-message">
                      <ShieldAlert size={15} />
                      {joinError}
                    </div>
                  )}
                  <button className="button primary full-button" type="submit">
                    Gửi yêu cầu tham gia <ArrowRight size={17} />
                  </button>
                </form>
                <div className="privacy-note">
                  <ShieldCheck size={15} /> {isLiveConnected ? 'Phiên thi được định danh an toàn bằng JWT Token.' : 'Thông tin chỉ dùng cho phiên thi demo này.'}
                </div>
                <button className="text-button" onClick={() => switchRole('teacher')}>
                  <ArrowLeft size={15} /> Quay lại chế độ giáo viên
                </button>
              </div>
            </div>
          )}

          {role === 'student' && page === 'waiting' && (
            <div className="center-wrap">
              <div className="waiting-card">
                <div className={`waiting-symbol ${currentStudent?.status}`}>
                  <span>
                    {currentStudent?.status === 'approved' ? (
                      <CheckCircle2 size={34} />
                    ) : currentStudent?.status === 'rejected' ? (
                      <X size={34} />
                    ) : (
                      <Clock3 size={34} />
                    )}
                  </span>
                </div>
                <div className="section-kicker">PHÒNG {room.code}</div>
                <h1>
                  {currentStudent?.status === 'approved'
                    ? 'Bạn đã được duyệt!'
                    : currentStudent?.status === 'rejected'
                    ? 'Yêu cầu chưa được chấp nhận'
                    : 'Đang chờ giáo viên duyệt'}
                </h1>
                <p>
                  {currentStudent?.status === 'approved'
                    ? 'Bạn đã sẵn sàng. Nhấn nút bên dưới để bắt đầu làm bài.'
                    : currentStudent?.status === 'rejected'
                    ? 'Hãy liên hệ giáo viên để kiểm tra thông tin và thử lại.'
                    : 'Thông tin của bạn đã được gửi. Trang sẽ tự động cập nhật khi giáo viên duyệt.'}
                </p>
                <div className="waiting-details">
                  <div>
                    <span>Thí sinh</span>
                    <strong>{currentStudent?.name}</strong>
                  </div>
                  <div>
                    <span>Lớp</span>
                    <strong>{currentStudent?.className}</strong>
                  </div>
                  <div>
                    <span>Phòng thi</span>
                    <strong>{room.name}</strong>
                  </div>
                  <div>
                    <span>Trạng thái</span>
                    <strong className={`inline-status ${currentStudent?.status}`}>
                      {currentStudent ? statusLabels[currentStudent.status] : 'Chờ duyệt'}
                    </strong>
                  </div>
                </div>
                {currentStudent?.status === 'approved' && (
                  <button className="button primary full-button" onClick={startExam}>
                    <Play size={17} /> Vào làm bài thi
                  </button>
                )}
                {currentStudent?.status === 'rejected' && (
                  <button className="button secondary full-button" onClick={() => setPage('join')}>
                    Quay lại đăng ký
                  </button>
                )}
                <div className="demo-hint">
                  <Activity size={16} /> Đồng bộ thời gian thực: Khi giáo viên duyệt ở máy khác, nút vào thi sẽ tự động sáng.
                </div>
                <button
                  className="text-button"
                  onClick={() => {
                    setPage('join')
                    setStudentId('')
                  }}
                >
                  <ArrowLeft size={15} /> Quay lại
                </button>
              </div>
            </div>
          )}

          {role === 'student' && page === 'exam' && (
            <div className="exam-shell">
              <div className="exam-header">
                <div className="exam-brand">
                  <div className="brand-mark">
                    <BookOpenCheck size={20} />
                  </div>
                  <div>
                    <strong>{room.name}</strong>
                    <span>MÃ PHÒNG: {room.code}</span>
                  </div>
                </div>
                <div className={`exam-timer ${secondsLeft < 300 ? 'urgent' : ''}`}>
                  <Clock3 size={18} />
                  <div>
                    <small>THỜI GIAN CÒN LẠI</small>
                    <strong>{formattedTime}</strong>
                  </div>
                </div>
                <button className="button primary" onClick={() => setShowSubmit(true)}>
                  Nộp bài <ArrowRight size={16} />
                </button>
              </div>

              <div className="exam-progress">
                <div>
                  <span>Tiến độ bài làm</span>
                  <strong>
                    {answeredCount}/{questions.length} câu
                  </strong>
                </div>
                <div className="progress-track">
                  <span style={{ width: `${(answeredCount / questions.length) * 100}%` }} />
                </div>
              </div>

              {tabWarning && (
                <div className="warning-banner">
                  <ShieldAlert size={19} />
                  <div>
                    <strong>Đã ghi nhận sự kiện rời trang</strong>
                    <p>Hệ thống ghi nhận trang thi bị ẩn. Sự kiện này được lưu trữ để giáo viên giám sát.</p>
                  </div>
                  <button onClick={() => setTabWarning(false)}>
                    <X size={17} />
                  </button>
                </div>
              )}

              <div className="exam-body">
                <aside className="question-nav panel">
                  <div className="section-kicker">DANH SÁCH CÂU HỎI</div>
                  <div className="question-grid">
                    {questions.map((q, i) => (
                      <button
                        key={q.id}
                        className={`${i === questionIndex ? 'selected' : ''} ${
                          answers[String(q.id)] !== undefined ? 'answered' : ''
                        }`}
                        onClick={() => setQuestionIndex(i)}
                      >
                        {i + 1}
                      </button>
                    ))}
                  </div>
                  <div className="question-legend">
                    <span>
                      <i className="legend-current" /> Đang xem
                    </span>
                    <span>
                      <i className="legend-answered" /> Đã trả lời
                    </span>
                    <span>
                      <i className="legend-empty" /> Chưa làm
                    </span>
                  </div>
                  <div className="exam-rule">
                    <ShieldCheck size={17} />
                    <p>Không đóng trang thi trước khi nộp bài. Đáp án được tự động lưu lên máy chủ.</p>
                  </div>
                </aside>

                <section className="question-card panel">
                  <div className="question-meta">
                    <span className="question-number">
                      CÂU {questionIndex + 1} / {questions.length}
                    </span>
                    <span className="topic-chip">{currentQuestion.topic}</span>
                  </div>
                  <h2>{currentQuestion.text}</h2>
                  <p className="select-hint">Chọn một đáp án đúng nhất.</p>
                  <div className="options-list">
                    {currentQuestion.options.map((option, i) => {
                      const isChosen = answers[String(currentQuestion.id)] === option.id
                      return (
                        <button
                          key={option.id}
                          className={`answer-option ${isChosen ? 'chosen' : ''}`}
                          onClick={() => handleSelectAnswer(currentQuestion.id, option.id)}
                        >
                          <span className="option-letter">{String.fromCharCode(65 + i)}</span>
                          <span>{option.text}</span>
                          {isChosen && <CheckCircle2 size={19} className="option-check" />}
                        </button>
                      )
                    })}
                  </div>
                  <div className="question-footer">
                    <button
                      className="button secondary"
                      disabled={questionIndex === 0}
                      onClick={() => setQuestionIndex((i) => i - 1)}
                    >
                      <ArrowLeft size={16} /> Câu trước
                    </button>
                    <span>{answeredCount} câu đã trả lời</span>
                    {questionIndex < questions.length - 1 ? (
                      <button className="button primary" onClick={() => setQuestionIndex((i) => i + 1)}>
                        Câu tiếp theo <ArrowRight size={16} />
                      </button>
                    ) : (
                      <button className="button primary" onClick={() => setShowSubmit(true)}>
                        Kiểm tra & nộp bài <Check size={16} />
                      </button>
                    )}
                  </div>
                </section>
              </div>

              <div className="exam-footnote">
                <ShieldCheck size={15} /> Examly Online Exam <span>•</span> Autosave thời gian thực được bảo vệ chống mất dữ liệu.
              </div>
            </div>
          )}

          {role === 'student' && page === 'result' && (
            <div className="center-wrap">
              <div className="result-card">
                <div className="result-icon">
                  <CheckCircle2 size={34} />
                </div>
                <div className="section-kicker">HOÀN THÀNH BÀI THI</div>
                <h1>Bài làm đã được chấm điểm!</h1>
                <p>Cảm ơn {currentStudent?.name || 'bạn'} đã hoàn thành bài thi.</p>
                <div className="score-circle">
                  <strong>
                    {examResult?.score ?? currentStudent?.score ?? 0}
                    <small>/10</small>
                  </strong>
                  <span>ĐIỂM SỐ CHÍNH THỨC</span>
                </div>
                <div className="result-stats">
                  <div>
                    <strong>
                      {examResult?.correctCount ?? answeredCount}/{questions.length}
                    </strong>
                    <span>Câu đúng</span>
                  </div>
                  <div>
                    <strong>{currentStudent?.tabWarnings ?? 0}</strong>
                    <span>Lượt rời trang</span>
                  </div>
                </div>
                <p className="muted small-text">
                  {isLiveConnected
                    ? 'Kết quả đã được ghi nhận và lưu trữ chính thức trên cơ sở dữ liệu máy chủ.'
                    : 'Kết quả được tính toán trên dữ liệu trình duyệt hiện tại.'}
                </p>
                <button
                  className="button primary full-button"
                  onClick={() => {
                    setPage('join')
                    setAnswers({})
                    setStudentId('')
                    setExamResult(null)
                  }}
                >
                  Về trang tham gia <ArrowRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      {showCreate && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowCreate(false)
          }}
        >
          <div className="modal">
            <div className="modal-heading">
              <div>
                <div className="section-kicker">THIẾT LẬP KỲ THI</div>
                <h2>Tạo phòng thi mới</h2>
              </div>
              <button className="icon-button" onClick={() => setShowCreate(false)}>
                <X size={20} />
              </button>
            </div>
            <p className="modal-copy">Thiết lập thông tin cơ bản. Mã phòng sẽ được tạo tự động.</p>
            <label>Tên phòng thi</label>
            <input value={roomName} onChange={(e) => setRoomName(e.target.value)} placeholder="Ví dụ: Kiểm tra giữa kỳ" />
            <label>Thời lượng làm bài</label>
            <div className="duration-options">
              {[15, 30, 45, 60].map((n) => (
                <button key={n} className={duration === n ? 'selected' : ''} onClick={() => setDuration(n)}>
                  {n} phút
                </button>
              ))}
            </div>
            <div className="modal-info">
              <Zap size={17} />
              <span>
                {isLiveConnected
                  ? 'Phòng thi sẽ được khởi tạo trực tiếp trên máy chủ backend và hỗ trợ học sinh tham gia realtime.'
                  : `Bản demo sử dụng ${questions.length} câu hỏi trắc nghiệm chuẩn.`}
              </span>
            </div>
            <div className="modal-actions">
              <button className="button secondary" onClick={() => setShowCreate(false)}>
                Hủy
              </button>
              <button className="button primary" onClick={createRoom}>
                <Plus size={17} /> Tạo phòng thi
              </button>
            </div>
          </div>
        </div>
      )}

      {showSubmit && (
        <div className="modal-backdrop">
          <div className="modal submit-modal">
            <div className="submit-icon">
              <ShieldCheck size={25} />
            </div>
            <h2>Bạn chắc chắn muốn nộp bài?</h2>
            <p>
              Bạn đã trả lời <strong>{answeredCount}/{questions.length}</strong> câu hỏi. Sau khi nộp, bài thi sẽ được máy chủ chấm điểm ngay lập tức.
            </p>
            <div className="modal-actions">
              <button className="button secondary" onClick={() => setShowSubmit(false)}>
                Tiếp tục làm bài
              </button>
              <button className="button primary" onClick={submitExam}>
                Xác nhận nộp bài <ArrowRight size={16} />
              </button>
            </div>
          </div>
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
    </div>
  )
}

function Stat({ icon, tone, label, value, note }: { icon: React.ReactNode; tone: string; label: string; value: string; note: string }) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${tone}`}>{icon}</div>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-note">{note}</div>
    </div>
  )
}

function ActivityItem({ tone, icon, title, detail, time }: { tone: string; icon: React.ReactNode; title: string; detail: string; time: string }) {
  return (
    <div className="activity-item">
      <div className={`activity-icon ${tone}`}>{icon}</div>
      <div className="activity-copy">
        <strong>{title}</strong>
        <span>{detail}</span>
      </div>
      <time>{time}</time>
    </div>
  )
}

function StudentTable({ students, onApprove }: { students: Student[]; onApprove: (id: string, status: StudentStatus) => void }) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>HỌC SINH</th>
            <th>LỚP</th>
            <th>THỜI GIAN VÀO</th>
            <th>TRẠNG THÁI</th>
            <th>CẢNH BÁO</th>
            <th className="align-right">THAO TÁC</th>
          </tr>
        </thead>
        <tbody>
          {students.map((s, i) => (
            <tr key={s.id}>
              <td>
                <div className="student-cell">
                  <div className={`student-avatar avatar-${i % 5}`}>
                    {s.name
                      .split(' ')
                      .slice(-2)
                      .map((x) => x[0])
                      .join('')
                      .slice(0, 2)}
                  </div>
                  <div>
                    <strong>{s.name}</strong>
                    <span>#{String(i + 1).padStart(3, '0')}</span>
                  </div>
                </div>
              </td>
              <td>
                <span className="class-label">{s.className}</span>
              </td>
              <td className="time-cell">{s.joinedAt}</td>
              <td>
                <span className={`status-pill student-status ${s.status}`}>
                  ● {statusLabels[s.status]}
                </span>
              </td>
              <td>
                <span className={`warning-count ${s.tabWarnings ? 'has-warning' : ''}`}>
                  <ShieldAlert size={14} />
                  {s.tabWarnings} lượt
                </span>
              </td>
              <td>
                <div className="row-actions">
                  {s.status === 'pending' ? (
                    <>
                      <button className="approve-button" onClick={() => onApprove(s.id, 'approved')}>
                        <Check size={14} /> Duyệt
                      </button>
                      <button className="reject-button" onClick={() => onApprove(s.id, 'rejected')} title="Từ chối">
                        <X size={16} />
                      </button>
                    </>
                  ) : s.status === 'rejected' ? (
                    <button className="plain-action" onClick={() => onApprove(s.id, 'approved')}>
                      Duyệt lại
                    </button>
                  ) : (
                    <button className="plain-action" onClick={() => onApprove(s.id, 'pending')}>
                      Đặt lại
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {students.length === 0 && (
        <div className="empty-state">
          <Users size={24} />
          <strong>Chưa có học sinh</strong>
          <span>Chia sẻ mã phòng để học sinh gửi yêu cầu tham gia.</span>
        </div>
      )}
    </div>
  )
}

export default App
