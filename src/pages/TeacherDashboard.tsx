import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  BookOpenCheck,
  Check,
  CheckCircle2,
  Clock3,
  Copy,
  FileUp,
  Flag,
  ListChecks,
  Play,
  Plus,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Square,
  Timer,
  Trash2,
  Users,
  X,
  Zap,
} from 'lucide-react'
import { api, toStudentStatus } from '../api/client'
import { socketClient } from '../api/socket'
import type { AuthUser, ExamStatus, NewQuestionInput, Room, Student, StudentStatus, TeacherQuestion } from '../api/types'
import { ActivityItem, EmptyState, Stat } from '../components/common'
import { ImportQuestionsModal } from '../components/ImportQuestionsModal'
import { examStatusLabels, formatCountdown, formatScore, formatTime, initials, statusLabels } from '../lib/format'

type ActivityKind = 'join' | 'warning' | 'submit' | 'exam'

interface ActivityEntry {
  id: number
  kind: ActivityKind
  title: string
  detail: string
  at: number
}

const activityStyle: Record<ActivityKind, { tone: string; icon: JSX.Element }> = {
  join: { tone: 'blue', icon: <Users size={16} /> },
  warning: { tone: 'amber', icon: <ShieldAlert size={16} /> },
  submit: { tone: 'violet', icon: <CheckCircle2 size={16} /> },
  exam: { tone: 'green', icon: <Flag size={16} /> },
}

const SELECTED_EXAM_KEY = 'examly_teacher_exam'

interface Props {
  user: AuthUser
  isLiveConnected: boolean
  notify: (message: string) => void
  onPendingChange: (count: number) => void
}

export function TeacherDashboard({ user, isLiveConnected, notify, onPendingChange }: Props) {
  const [exams, setExams] = useState<Room[]>([])
  const [examId, setExamId] = useState<string | null>(null)
  const [students, setStudents] = useState<Student[]>([])
  const [questions, setQuestions] = useState<TeacherQuestion[]>([])
  const [activity, setActivity] = useState<ActivityEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [showQuestionForm, setShowQuestionForm] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [confirmFinish, setConfirmFinish] = useState(false)
  const [busy, setBusy] = useState(false)
  // Chỉ dùng để render lại mỗi giây cho đồng hồ đếm ngược
  const [, setTick] = useState(0)

  // Ref giúp listener socket (đăng ký một lần) đọc được phòng thi và danh sách thí sinh hiện tại
  const examIdRef = useRef<string | null>(null)
  const studentsRef = useRef<Student[]>([])
  const activitySeq = useRef(0)
  examIdRef.current = examId
  studentsRef.current = students

  const room = exams.find((e) => e.id === examId) ?? null
  const editable = room?.status === 'waiting' || room?.status === 'draft'
  const secondsLeft = room?.endsAt ? Math.max(0, (Date.parse(room.endsAt) - Date.now()) / 1000) : 0

  const counts = useMemo(() => {
    const count = (status: StudentStatus) => students.filter((s) => s.status === status).length
    const submitted = students.filter((s) => s.status === 'submitted')
    const average = submitted.length ? submitted.reduce((sum, s) => sum + (s.score ?? 0), 0) / submitted.length : null
    return {
      pending: count('pending'),
      ready: count('approved') + count('in_progress'),
      inProgress: count('in_progress'),
      submitted: submitted.length,
      average,
      warnings: students.reduce((sum, s) => sum + s.tabWarnings, 0),
    }
  }, [students])

  const log = (entry: Omit<ActivityEntry, 'id' | 'at'>) => {
    activitySeq.current += 1
    const item = { ...entry, id: activitySeq.current, at: Date.now() }
    setActivity((prev) => [item, ...prev].slice(0, 20))
  }

  const updateExam = (id: string, patch: Partial<Room>) => {
    setExams((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)))
  }

  // Tải danh sách phòng thi của giáo viên
  useEffect(() => {
    const token = api.getAuthToken()
    if (token) socketClient.connect(token)
    api
      .listExams()
      .then((list) => {
        setExams(list)
        const stored = localStorage.getItem(SELECTED_EXAM_KEY)
        setExamId(list.find((e) => e.id === stored)?.id ?? list[0]?.id ?? null)
        if (!list.length) setShowCreate(true)
      })
      .catch((err) => notify(err.message))
      .finally(() => setLoading(false))
  }, [])

  // Tải thí sinh + câu hỏi khi đổi phòng thi, đăng ký nhận sự kiện realtime của phòng
  useEffect(() => {
    if (!examId) {
      setStudents([])
      setQuestions([])
      return
    }
    localStorage.setItem(SELECTED_EXAM_KEY, examId)
    setActivity([])
    let cancelled = false
    Promise.all([api.getParticipants(examId), api.getTeacherQuestions(examId)])
      .then(([participantList, questionList]) => {
        if (cancelled) return
        setStudents(participantList)
        setQuestions(questionList)
      })
      .catch((err) => notify(err.message))
    socketClient.subscribeExam(examId)
    return () => {
      cancelled = true
    }
  }, [examId])

  useEffect(() => {
    onPendingChange(counts.pending)
  }, [counts.pending])

  // Đồng hồ đếm ngược khi kỳ thi đang diễn ra
  useEffect(() => {
    if (room?.status !== 'active') return
    const timer = window.setInterval(() => setTick((t) => t + 1), 1000)
    return () => window.clearInterval(timer)
  }, [room?.status])

  useEffect(() => {
    const isCurrent = (payload: { examId?: string }) => payload.examId === examIdRef.current

    const onRequested = (p: { examId: string; id: string; displayName: string; className: string; joinedAt: string }) => {
      if (!isCurrent(p)) return
      setStudents((prev) =>
        prev.some((s) => s.id === p.id)
          ? prev
          : [...prev, { id: p.id, name: p.displayName, className: p.className, status: 'pending', joinedAt: p.joinedAt, tabWarnings: 0 }]
      )
      log({ kind: 'join', title: 'Yêu cầu tham gia mới', detail: `${p.displayName} (${p.className}) xin vào phòng thi` })
      notify(`${p.displayName} vừa gửi yêu cầu vào phòng thi.`)
    }

    const onStatusChanged = (p: { examId: string; participantId: string; status: string }) => {
      if (!isCurrent(p)) return
      setStudents((prev) => prev.map((s) => (s.id === p.participantId ? { ...s, status: toStudentStatus(p.status) } : s)))
    }

    const onWarning = (w: { examId: string; participantId: string; displayName: string; tabWarnings: number }) => {
      if (!isCurrent(w)) return
      setStudents((prev) => prev.map((s) => (s.id === w.participantId ? { ...s, tabWarnings: w.tabWarnings } : s)))
      log({ kind: 'warning', title: 'Cảnh báo giám sát', detail: `${w.displayName} rời khỏi trang thi (lần ${w.tabWarnings})` })
    }

    const onSubmitted = (p: { examId: string; participantId: string; score: number | null }) => {
      if (!isCurrent(p)) return
      const name = studentsRef.current.find((s) => s.id === p.participantId)?.name ?? 'Thí sinh'
      setStudents((prev) =>
        prev.map((s) => (s.id === p.participantId ? { ...s, status: 'submitted', score: p.score ?? undefined } : s))
      )
      log({ kind: 'submit', title: 'Bài thi đã nộp', detail: `${name} đạt ${formatScore(p.score)}/10 điểm` })
    }

    const onExamStarted = (ex: { examId: string; startsAt: string; endsAt: string }) => {
      setExams((prev) => prev.map((e) => (e.id === ex.examId ? { ...e, status: 'active', startsAt: ex.startsAt, endsAt: ex.endsAt } : e)))
      if (isCurrent(ex)) log({ kind: 'exam', title: 'Kỳ thi đã bắt đầu', detail: `Tự động kết thúc lúc ${formatTime(ex.endsAt)}` })
    }

    const onExamEnded = (ex: { examId: string; endedAt: string }) => {
      setExams((prev) => prev.map((e) => (e.id === ex.examId ? { ...e, status: 'ended', endsAt: ex.endedAt } : e)))
      if (!isCurrent(ex)) return
      log({ kind: 'exam', title: 'Kỳ thi đã kết thúc', detail: 'Bài làm dang dở đã được tự động nộp và chấm điểm' })
      api.getParticipants(ex.examId).then(setStudents).catch(() => undefined)
    }

    socketClient.on('participant:requested', onRequested)
    socketClient.on('participant:status-changed', onStatusChanged)
    socketClient.on('proctoring:warning', onWarning)
    socketClient.on('participant:submitted', onSubmitted)
    socketClient.on('exam:started', onExamStarted)
    socketClient.on('exam:ended', onExamEnded)

    return () => {
      socketClient.off('participant:requested', onRequested)
      socketClient.off('participant:status-changed', onStatusChanged)
      socketClient.off('proctoring:warning', onWarning)
      socketClient.off('participant:submitted', onSubmitted)
      socketClient.off('exam:started', onExamStarted)
      socketClient.off('exam:ended', onExamEnded)
    }
  }, [])

  const createRoom = async (title: string, duration: number, importAfter: boolean) => {
    const created = await api.createExam(title, duration)
    setExams((prev) => [created, ...prev])
    setExamId(created.id)
    setShowCreate(false)
    if (importAfter) setShowImport(true)
    notify(`Đã tạo phòng ${created.code}. ${importAfter ? 'Chọn file đề thi để nhập câu hỏi.' : 'Hãy thêm câu hỏi trước khi bắt đầu kỳ thi.'}`)
  }

  const startRoom = async () => {
    if (!room) return
    setBusy(true)
    try {
      const updated = await api.startExam(room.id)
      updateExam(room.id, { status: updated.status, startsAt: updated.startsAt, endsAt: updated.endsAt })
      notify('Kỳ thi đã bắt đầu. Thí sinh đã được duyệt có thể vào làm bài.')
    } catch (err: any) {
      notify(err.message)
    } finally {
      setBusy(false)
    }
  }

  const finishRoom = async () => {
    if (!room) return
    setBusy(true)
    try {
      const updated = await api.finishExam(room.id)
      updateExam(room.id, { status: updated.status, endsAt: updated.endsAt })
      setStudents(await api.getParticipants(room.id))
      setConfirmFinish(false)
      notify('Đã kết thúc kỳ thi. Bài làm dang dở đã được tự động nộp và chấm điểm.')
    } catch (err: any) {
      notify(err.message)
    } finally {
      setBusy(false)
    }
  }

  const refreshStudents = async () => {
    if (!room) return
    try {
      setStudents(await api.getParticipants(room.id))
    } catch (err: any) {
      notify(err.message)
    }
  }

  const decide = async (participantId: string, decision: 'APPROVED' | 'REJECTED' | 'PENDING') => {
    if (!room) return
    try {
      await api.decideParticipant(room.id, participantId, decision)
      const status: StudentStatus = decision === 'APPROVED' ? 'approved' : decision === 'REJECTED' ? 'rejected' : 'pending'
      setStudents((prev) => prev.map((s) => (s.id === participantId ? { ...s, status } : s)))
      notify(decision === 'APPROVED' ? 'Đã duyệt học sinh vào phòng thi.' : decision === 'REJECTED' ? 'Đã từ chối yêu cầu tham gia.' : 'Đã đưa thí sinh về trạng thái chờ duyệt.')
    } catch (err: any) {
      notify(err.message)
    }
  }

  const addQuestion = async (input: NewQuestionInput, keepOpen: boolean) => {
    if (!room) return
    const created = await api.createQuestion(room.id, input)
    setQuestions((prev) => [...prev, created].sort((a, b) => a.position - b.position))
    if (!keepOpen) setShowQuestionForm(false)
    notify('Đã lưu câu hỏi vào đề thi.')
  }

  const importQuestions = async (input: NewQuestionInput[], replace: boolean) => {
    if (!room) return
    const created = await api.importQuestions(room.id, input, replace)
    setQuestions((prev) => (replace ? created : [...prev, ...created]))
    setShowImport(false)
    notify(`Đã nhập ${created.length} câu hỏi từ file${replace ? ' (thay thế đề cũ)' : ''}.`)
  }

  const removeQuestion = async (question: TeacherQuestion) => {
    if (!room || !window.confirm(`Xóa câu hỏi "${question.text}"?`)) return
    try {
      await api.deleteQuestion(room.id, question.id)
      setQuestions((prev) => prev.filter((q) => q.id !== question.id))
      notify('Đã xóa câu hỏi.')
    } catch (err: any) {
      notify(err.message)
    }
  }

  const copyCode = () => {
    if (!room) return
    navigator.clipboard?.writeText(room.code).then(
      () => notify(`Đã sao chép mã phòng ${room.code}.`),
      () => notify(`Mã phòng: ${room.code}`)
    )
  }

  if (loading) {
    return (
      <div className="center-wrap">
        <span className="loading-state">Đang tải dữ liệu phòng thi...</span>
      </div>
    )
  }

  const today = new Date()
  const greeting = today.getHours() < 12 ? 'Chào buổi sáng' : today.getHours() < 18 ? 'Chào buổi chiều' : 'Chào buổi tối'
  const todayLabel = today.toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase()

  const roomHint = !room
    ? ''
    : room.status === 'active'
    ? `${counts.inProgress} đang làm bài • ${counts.submitted} đã nộp`
    : room.status === 'ended'
    ? `${counts.submitted} bài đã được chấm điểm`
    : questions.length === 0
    ? 'Thêm câu hỏi trước khi bắt đầu'
    : `${counts.ready} thí sinh đã sẵn sàng`

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <Sparkles size={14} /> {todayLabel}
          </div>
          <h1>
            {greeting}, {user.displayName.split(' ').slice(-2).join(' ')} <span className="wave">✦</span>
          </h1>
          <p>{room ? `Đang quản lý phòng ${room.code} — ${room.name}.` : 'Bạn chưa có phòng thi nào. Hãy tạo phòng thi đầu tiên.'}</p>
        </div>
        <button className="button primary" onClick={() => setShowCreate(true)}>
          <Plus size={18} /> Tạo phòng thi mới
        </button>
      </div>

      {!room ? (
        <section className="panel">
          <EmptyState
            icon={<BookOpenCheck size={24} />}
            title="Chưa có phòng thi"
            detail="Tạo phòng thi, thêm câu hỏi rồi chia sẻ mã phòng cho học sinh."
          />
        </section>
      ) : (
        <>
          <section className="stats-grid">
            <Stat icon={<Users size={20} />} tone="blue" label="Tổng thí sinh" value={String(students.length).padStart(2, '0')} note="Trong phòng thi hiện tại" />
            <Stat icon={<Clock3 size={20} />} tone="amber" label="Chờ duyệt" value={String(counts.pending).padStart(2, '0')} note="Cần bạn xem xét" />
            <Stat
              icon={<CheckCircle2 size={20} />}
              tone="green"
              label="Đã duyệt"
              value={String(counts.ready).padStart(2, '0')}
              note={counts.inProgress ? `${counts.inProgress} đang làm bài` : 'Sẵn sàng làm bài'}
            />
            <Stat
              icon={<Activity size={20} />}
              tone="violet"
              label="Đã nộp bài"
              value={String(counts.submitted).padStart(2, '0')}
              note={counts.average === null ? 'Chưa có bài nộp' : `Điểm trung bình ${formatScore(Math.round(counts.average * 10) / 10)}/10`}
            />
          </section>

          <div className="dashboard-grid">
            <section className="panel room-panel">
              <div className="panel-heading">
                <div>
                  <div className="section-kicker">PHÒNG THI CỦA BẠN</div>
                  <h2>Phòng thi đang quản lý</h2>
                </div>
                {exams.length > 1 && (
                  <select className="room-select" value={room.id} onChange={(e) => setExamId(e.target.value)} aria-label="Chọn phòng thi">
                    {exams.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.code} — {e.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className="room-banner">
                <div className="room-banner-top">
                  <span className={`status-pill ${room.status}`}>● {examStatusLabels[room.status]}</span>
                  <span className="room-code">
                    MÃ PHÒNG <b>{room.code}</b>
                    <button title="Sao chép mã phòng" onClick={copyCode}>
                      <Copy size={14} />
                    </button>
                  </span>
                </div>
                <h3>{room.name}</h3>
                <p>Phòng thi trắc nghiệm • {questions.length} câu hỏi • Thang điểm 10</p>
                <div className="room-meta">
                  <span>
                    <Clock3 size={15} /> {room.duration} phút
                  </span>
                  <span>
                    <Users size={15} /> {students.length} thí sinh
                  </span>
                  {room.status === 'active' && room.endsAt && (
                    <span className="room-countdown">
                      <Timer size={15} /> Còn {formatCountdown(secondsLeft)}
                    </span>
                  )}
                  {room.status === 'ended' && room.endsAt && (
                    <span>
                      <Flag size={15} /> Kết thúc lúc {formatTime(room.endsAt)}
                    </span>
                  )}
                </div>
              </div>
              <div className="room-footer">
                {students.length > 0 && (
                  <div className="avatar-stack">
                    {students.slice(0, 3).map((s) => (
                      <span key={s.id}>{initials(s.name)}</span>
                    ))}
                    {students.length > 3 && <small>+{students.length - 3}</small>}
                  </div>
                )}
                <span className="muted">{roomHint}</span>
                {room.status === 'active' ? (
                  <button className="button danger" disabled={busy} onClick={() => setConfirmFinish(true)}>
                    <Square size={14} /> Kết thúc kỳ thi
                  </button>
                ) : editable ? (
                  <button
                    className="button primary"
                    disabled={busy || questions.length === 0}
                    title={questions.length === 0 ? 'Cần ít nhất 1 câu hỏi để bắt đầu' : undefined}
                    onClick={startRoom}
                  >
                    <Play size={15} /> Bắt đầu kỳ thi
                  </button>
                ) : (
                  <button className="button secondary" disabled>
                    <Flag size={14} /> {examStatusLabels[room.status]}
                  </button>
                )}
              </div>
            </section>

            <section className="panel activity-panel">
              <div className="panel-heading">
                <div>
                  <div className="section-kicker">TÌNH TRẠNG</div>
                  <h2>Hoạt động gần đây</h2>
                </div>
                <span className={`live-label ${isLiveConnected ? '' : 'offline'}`}>
                  <span /> {isLiveConnected ? 'TRỰC TIẾP' : 'MẤT KẾT NỐI'}
                </span>
              </div>
              <div className="activity-list">
                {activity.length === 0 ? (
                  <p className="activity-empty">Chưa có hoạt động mới. Yêu cầu tham gia, cảnh báo giám sát và bài nộp sẽ hiện ở đây theo thời gian thực.</p>
                ) : (
                  activity
                    .slice(0, 5)
                    .map((a) => (
                      <ActivityItem
                        key={a.id}
                        tone={activityStyle[a.kind].tone}
                        icon={activityStyle[a.kind].icon}
                        title={a.title}
                        detail={a.detail}
                        time={formatTime(a.at)}
                      />
                    ))
                )}
              </div>
              <div className="activity-tip">
                <ShieldCheck size={18} />
                <div>
                  <strong>Giám sát có trách nhiệm</strong>
                  <p>
                    {counts.warnings} lượt rời trang đã được ghi nhận. Chuyển tab chỉ là tín hiệu tham khảo, không tự động kết luận gian lận.
                  </p>
                </div>
              </div>
            </section>
          </div>

          <section className="panel questions-panel">
            <div className="panel-heading">
              <div>
                <div className="section-kicker">ĐỀ THI</div>
                <h2>
                  Câu hỏi trắc nghiệm <span className="count-badge">{questions.length}</span>
                </h2>
              </div>
              <div className="table-actions">
                <button className="button secondary" disabled={!editable} onClick={() => setShowImport(true)}>
                  <FileUp size={15} /> Nhập từ file
                </button>
                <button className="button primary small-button" disabled={!editable} onClick={() => setShowQuestionForm(true)}>
                  <Plus size={16} /> Thêm câu hỏi
                </button>
              </div>
            </div>
            {questions.length === 0 ? (
              <EmptyState
                icon={<ListChecks size={24} />}
                title="Đề thi chưa có câu hỏi"
                detail="Thêm từng câu hoặc nhập cả đề từ file Excel/Word. Cần ít nhất 1 câu hỏi để bắt đầu kỳ thi."
              />
            ) : (
              <ol className="question-list">
                {questions.map((q, i) => (
                  <li key={q.id} className="question-item">
                    <div className="question-item-head">
                      <span className="question-number">CÂU {i + 1}</span>
                      <span className="topic-chip">{q.topic}</span>
                      {editable && (
                        <button className="icon-button small danger" title="Xóa câu hỏi" onClick={() => removeQuestion(q)}>
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                    <p>{q.text}</p>
                    <ul className="question-options">
                      {q.options.map((o, j) => (
                        <li key={o.id} className={o.isCorrect ? 'correct' : ''}>
                          <span className="option-letter">{String.fromCharCode(65 + j)}</span>
                          <span>{o.text}</span>
                          {o.isCorrect && <CheckCircle2 size={15} />}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
            )}
            {!editable && <p className="panel-note">Đề thi đã khóa vì kỳ thi đã bắt đầu hoặc kết thúc.</p>}
          </section>

          <section className="panel students-panel">
            <div className="panel-heading">
              <div>
                <div className="section-kicker">QUẢN LÝ THÍ SINH</div>
                <h2>
                  Danh sách học sinh <span className="count-badge">{students.length}</span>
                </h2>
              </div>
              <div className="table-actions">
                <button className="button secondary" onClick={refreshStudents}>
                  <RefreshCw size={14} /> Làm mới
                </button>
              </div>
            </div>
            <StudentTable students={students} examStatus={room.status} onDecide={decide} />
          </section>
        </>
      )}

      <div className="footnote">
        <ShieldCheck size={15} /> {isLiveConnected ? 'Dữ liệu đồng bộ trực tiếp với máy chủ API & PostgreSQL.' : 'Mất kết nối tới máy chủ — dữ liệu có thể chưa được cập nhật.'}
      </div>

      {showCreate && <CreateRoomModal onClose={() => setShowCreate(false)} onCreate={createRoom} />}
      {showQuestionForm && <QuestionFormModal onClose={() => setShowQuestionForm(false)} onSave={addQuestion} />}
      {showImport && room && (
        <ImportQuestionsModal examName={room.name} existingCount={questions.length} onClose={() => setShowImport(false)} onImport={importQuestions} />
      )}
      {confirmFinish && (
        <div className="modal-backdrop">
          <div className="modal submit-modal">
            <div className="submit-icon danger">
              <Square size={22} />
            </div>
            <h2>Kết thúc kỳ thi ngay?</h2>
            <p>
              <strong>{counts.inProgress}</strong> thí sinh đang làm bài sẽ được tự động nộp và chấm điểm. Thí sinh đã duyệt nhưng chưa vào thi sẽ bị
              đánh dấu vắng.
            </p>
            <div className="modal-actions">
              <button className="button secondary" onClick={() => setConfirmFinish(false)}>
                Hủy
              </button>
              <button className="button danger" disabled={busy} onClick={finishRoom}>
                Kết thúc kỳ thi
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function StudentTable({
  students,
  examStatus,
  onDecide,
}: {
  students: Student[]
  examStatus: ExamStatus
  onDecide: (id: string, decision: 'APPROVED' | 'REJECTED' | 'PENDING') => void
}) {
  const locked = examStatus === 'ended' || examStatus === 'cancelled'

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
            <th>ĐIỂM</th>
            <th className="align-right">THAO TÁC</th>
          </tr>
        </thead>
        <tbody>
          {students.map((s, i) => (
            <tr key={s.id}>
              <td>
                <div className="student-cell">
                  <div className={`student-avatar avatar-${i % 5}`}>{initials(s.name)}</div>
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
                <span className={`status-pill student-status ${s.status}`}>● {statusLabels[s.status]}</span>
              </td>
              <td>
                <span className={`warning-count ${s.tabWarnings ? 'has-warning' : ''}`}>
                  <ShieldAlert size={14} />
                  {s.tabWarnings} lượt
                </span>
              </td>
              <td className="score-cell">{s.status === 'submitted' ? `${formatScore(s.score)}/10` : '—'}</td>
              <td>
                <div className="row-actions">
                  {locked || s.status === 'submitted' || s.status === 'absent' ? (
                    <span className="muted">—</span>
                  ) : s.status === 'pending' ? (
                    <>
                      <button className="approve-button" onClick={() => onDecide(s.id, 'APPROVED')}>
                        <Check size={14} /> Duyệt
                      </button>
                      <button className="reject-button" onClick={() => onDecide(s.id, 'REJECTED')} title="Từ chối">
                        <X size={16} />
                      </button>
                    </>
                  ) : s.status === 'rejected' ? (
                    <button className="plain-action" onClick={() => onDecide(s.id, 'APPROVED')}>
                      Duyệt lại
                    </button>
                  ) : s.status === 'approved' ? (
                    <button className="plain-action" onClick={() => onDecide(s.id, 'PENDING')}>
                      Đặt lại
                    </button>
                  ) : (
                    <span className="muted">Đang làm bài</span>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {students.length === 0 && (
        <EmptyState icon={<Users size={24} />} title="Chưa có học sinh" detail="Chia sẻ mã phòng để học sinh đăng nhập và gửi yêu cầu tham gia." />
      )}
    </div>
  )
}

function CreateRoomModal({
  onClose,
  onCreate,
}: {
  onClose: () => void
  onCreate: (title: string, duration: number, importAfter: boolean) => Promise<void>
}) {
  const [title, setTitle] = useState('')
  const [duration, setDuration] = useState(30)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async (importAfter: boolean) => {
    if (title.trim().length < 3) {
      setError('Tên phòng thi tối thiểu 3 ký tự.')
      return
    }
    if (!Number.isInteger(duration) || duration < 1 || duration > 360) {
      setError('Thời lượng phải từ 1 đến 360 phút.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await onCreate(title.trim(), duration, importAfter)
    } catch (err: any) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <form
        className="modal"
        onSubmit={(e) => {
          e.preventDefault()
          void submit(false)
        }}
      >
        <div className="modal-heading">
          <div>
            <div className="section-kicker">THIẾT LẬP KỲ THI</div>
            <h2>Tạo phòng thi mới</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <p className="modal-copy">Mã phòng được máy chủ tạo tự động. Sau khi tạo, hãy thêm câu hỏi rồi chia sẻ mã cho học sinh.</p>
        <label>Tên phòng thi</label>
        <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ví dụ: Kiểm tra giữa kỳ Toán 12" />
        <label>Thời lượng làm bài</label>
        <div className="duration-options">
          {[15, 30, 45, 60].map((n) => (
            <button type="button" key={n} className={duration === n ? 'selected' : ''} onClick={() => setDuration(n)}>
              {n} phút
            </button>
          ))}
        </div>
        <div className="duration-custom">
          <span>Hoặc nhập số phút:</span>
          <input type="number" min={1} max={360} value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
        </div>
        {error && (
          <div className="error-message">
            <ShieldAlert size={15} />
            {error}
          </div>
        )}
        <div className="modal-info">
          <Zap size={17} />
          <span>Khi hết thời lượng, máy chủ tự động kết thúc kỳ thi và chấm điểm các bài đang làm dở.</span>
        </div>
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Hủy
          </button>
          <button type="button" className="button secondary" disabled={saving} onClick={() => void submit(true)}>
            <FileUp size={15} /> Tạo & nhập đề từ file
          </button>
          <button type="submit" className="button primary" disabled={saving}>
            <Plus size={17} /> {saving ? 'Đang tạo...' : 'Tạo phòng thi'}
          </button>
        </div>
      </form>
    </div>
  )
}

const emptyOptions = () => ['', '', '', '']

function QuestionFormModal({ onClose, onSave }: { onClose: () => void; onSave: (input: NewQuestionInput, keepOpen: boolean) => Promise<void> }) {
  const [topic, setTopic] = useState('')
  const [prompt, setPrompt] = useState('')
  const [options, setOptions] = useState<string[]>(emptyOptions)
  const [correct, setCorrect] = useState(0)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const updateOption = (index: number, value: string) => setOptions((prev) => prev.map((o, i) => (i === index ? value : o)))

  const removeOption = (index: number) => {
    setOptions((prev) => prev.filter((_, i) => i !== index))
    setCorrect((c) => (c === index ? 0 : c > index ? c - 1 : c))
  }

  const save = async (keepOpen: boolean) => {
    const texts = options.map((o) => o.trim())
    if (prompt.trim().length < 2) {
      setError('Nội dung câu hỏi tối thiểu 2 ký tự.')
      return
    }
    if (texts.some((t) => !t)) {
      setError('Vui lòng nhập đầy đủ nội dung các phương án.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await onSave(
        {
          topic: topic.trim() || 'Tổng quát',
          prompt: prompt.trim(),
          points: 1,
          options: texts.map((text, i) => ({ text, isCorrect: i === correct, position: i })),
        },
        keepOpen
      )
      if (keepOpen) {
        setPrompt('')
        setOptions(emptyOptions())
        setCorrect(0)
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop">
      <form
        className="modal question-modal"
        onSubmit={(e) => {
          e.preventDefault()
          void save(false)
        }}
      >
        <div className="modal-heading">
          <div>
            <div className="section-kicker">SOẠN ĐỀ THI</div>
            <h2>Thêm câu hỏi trắc nghiệm</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <p className="modal-copy">Chọn đáp án đúng bằng nút tròn bên trái. Đáp án đúng không bao giờ được gửi tới học sinh.</p>
        <label>Chủ đề</label>
        <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Ví dụ: Hàm số (để trống sẽ là Tổng quát)" />
        <label>Nội dung câu hỏi</label>
        <textarea autoFocus value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Nhập nội dung câu hỏi..." />
        <label>Các phương án</label>
        {options.map((option, i) => (
          <div key={i} className="option-row">
            <input
              type="radio"
              name="correct-option"
              checked={correct === i}
              onChange={() => setCorrect(i)}
              aria-label={`Đáp án đúng là ${String.fromCharCode(65 + i)}`}
            />
            <span className="option-letter">{String.fromCharCode(65 + i)}</span>
            <input type="text" value={option} onChange={(e) => updateOption(i, e.target.value)} placeholder={`Phương án ${String.fromCharCode(65 + i)}`} />
            {options.length > 2 && (
              <button type="button" className="icon-button small danger" title="Xóa phương án" onClick={() => removeOption(i)}>
                <X size={15} />
              </button>
            )}
          </div>
        ))}
        {options.length < 6 && (
          <button type="button" className="text-link" onClick={() => setOptions((prev) => [...prev, ''])}>
            <Plus size={14} /> Thêm phương án
          </button>
        )}
        {error && (
          <div className="error-message">
            <ShieldAlert size={15} />
            {error}
          </div>
        )}
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Đóng
          </button>
          <button type="button" className="button secondary" disabled={saving} onClick={() => void save(true)}>
            Lưu & thêm câu khác
          </button>
          <button type="submit" className="button primary" disabled={saving}>
            <Check size={16} /> Lưu câu hỏi
          </button>
        </div>
      </form>
    </div>
  )
}
