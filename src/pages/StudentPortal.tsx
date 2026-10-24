import { useEffect, useRef, useState } from 'react'
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  BookOpenCheck,
  Check,
  CheckCircle2,
  Clock3,
  Flag,
  GraduationCap,
  Play,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react'
import { api, toStudentStatus } from '../api/client'
import { socketClient } from '../api/socket'
import type { AuthUser, QuestionItem, StudentSession, SubmissionResult } from '../api/types'
import { formatCountdown, formatScore, statusLabels } from '../lib/format'

type StudentPage = 'loading' | 'join' | 'waiting' | 'exam' | 'result'

const pageLabels: Record<StudentPage, string> = {
  loading: 'Phòng thi',
  join: 'Tham gia thi',
  waiting: 'Phòng chờ',
  exam: 'Đang làm bài',
  result: 'Kết quả',
}

interface Props {
  user: AuthUser
  notify: (message: string) => void
  onPageChange: (label: string) => void
}

export function StudentPortal({ user, notify, onPageChange }: Props) {
  const [page, setPage] = useState<StudentPage>(() => (api.getParticipantToken() ? 'loading' : 'join'))
  const [session, setSession] = useState<StudentSession | null>(null)
  const [joinClass, setJoinClass] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [joinError, setJoinError] = useState('')
  const [joining, setJoining] = useState(false)
  const [opening, setOpening] = useState(false)
  const [questions, setQuestions] = useState<QuestionItem[]>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [questionIndex, setQuestionIndex] = useState(0)
  const [deadline, setDeadline] = useState(0)
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [showSubmit, setShowSubmit] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [tabWarning, setTabWarning] = useState(false)
  const [result, setResult] = useState<SubmissionResult | null>(null)
  const submittingRef = useRef(false)

  const answeredCount = questions.filter((q) => answers[q.id]).length
  const currentQuestion = questions[questionIndex]

  useEffect(() => {
    onPageChange(pageLabels[page])
  }, [page])

  const leaveSession = () => {
    api.setParticipantToken(null)
    socketClient.disconnect()
    setSession(null)
    setQuestions([])
    setAnswers({})
    setResult(null)
    setTabWarning(false)
    setShowSubmit(false)
    setPage('join')
  }

  const showResult = async () => {
    const current = await api.getCurrentSubmission()
    setResult(current.submission)
    setPage('result')
  }

  const openExam = async (s: StudentSession) => {
    setOpening(true)
    try {
      // Lấy đề trước: máy chủ chuyển thí sinh sang IN_PROGRESS khi phát đề
      const examQuestions = await api.getStudentQuestions(s.examId)
      const current = await api.getCurrentSubmission()
      if (current.submitted) {
        setResult(current.submission)
        setPage('result')
        return
      }
      const saved: Record<string, string> = {}
      for (const [questionId, optionId] of Object.entries(current.answers)) {
        if (optionId) saved[questionId] = optionId
      }
      setQuestions(examQuestions)
      setAnswers(saved)
      setQuestionIndex(0)
      setDeadline(Date.now() + current.secondsRemaining * 1000)
      setSecondsLeft(current.secondsRemaining)
      setSaveState('idle')
      setTabWarning(false)
      setSession((prev) => prev && { ...prev, status: 'in_progress' })
      setPage('exam')
    } catch (err: any) {
      notify(err.message)
    } finally {
      setOpening(false)
    }
  }

  // Đồng bộ phiên thi với máy chủ và điều hướng tới đúng màn hình
  const syncSession = async (): Promise<StudentSession | null> => {
    try {
      const s = await api.getStudentSession()
      setSession(s)
      socketClient.connect(api.getParticipantToken()!)
      socketClient.subscribeExam(s.examId)
      if (s.status === 'submitted' || s.status === 'absent' || s.examStatus === 'ended' || s.examStatus === 'cancelled') {
        await showResult()
      } else if (s.status === 'in_progress' && s.examStatus === 'active') {
        await openExam(s)
      } else {
        setPage('waiting')
      }
      return s
    } catch (err: any) {
      notify(err.message)
      if (err.status) leaveSession()
      else setPage((p) => (p === 'loading' ? 'join' : p))
      return null
    }
  }

  const submitExam = async (reason: 'MANUAL' | 'TIMEOUT') => {
    if (submittingRef.current) return
    submittingRef.current = true
    setSubmitting(true)
    try {
      const submission = await api.submitExam(reason)
      setResult(submission)
      setSession((prev) => prev && { ...prev, status: 'submitted', score: submission.score ?? undefined })
      setShowSubmit(false)
      setPage('result')
      notify(reason === 'TIMEOUT' ? 'Hết giờ — bài làm đã được tự động nộp.' : 'Đã nộp bài. Máy chủ đã chấm điểm.')
    } catch (err: any) {
      notify(err.message)
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  // Ref để timer và listener socket luôn gọi phiên bản hàm mới nhất
  const syncRef = useRef(syncSession)
  const submitRef = useRef(submitExam)
  syncRef.current = syncSession
  submitRef.current = submitExam

  useEffect(() => {
    if (api.getParticipantToken()) void syncRef.current()
  }, [])

  useEffect(() => {
    const onApproved = () => {
      setSession((prev) => prev && { ...prev, status: 'approved' })
      notify('Bạn đã được giáo viên duyệt vào phòng thi!')
    }
    const onRejected = () => {
      setSession((prev) => prev && { ...prev, status: 'rejected' })
      notify('Yêu cầu vào phòng của bạn đã bị từ chối.')
    }
    const onStatusChanged = (p: { status: string }) => {
      setSession((prev) => prev && { ...prev, status: toStudentStatus(p.status) })
    }
    const onStarted = () => {
      setSession((prev) => prev && { ...prev, examStatus: 'active' })
      notify('Kỳ thi đã bắt đầu!')
    }
    const onEnded = () => {
      notify('Kỳ thi đã kết thúc.')
      void syncRef.current()
    }

    socketClient.on('participant:approved', onApproved)
    socketClient.on('participant:rejected', onRejected)
    socketClient.on('participant:status-changed', onStatusChanged)
    socketClient.on('exam:started', onStarted)
    socketClient.on('exam:ended', onEnded)
    return () => {
      socketClient.off('participant:approved', onApproved)
      socketClient.off('participant:rejected', onRejected)
      socketClient.off('participant:status-changed', onStatusChanged)
      socketClient.off('exam:started', onStarted)
      socketClient.off('exam:ended', onEnded)
    }
  }, [])

  // Đồng hồ đếm ngược theo thời gian còn lại do máy chủ trả về; hết giờ thì tự nộp bài
  useEffect(() => {
    if (page !== 'exam' || !deadline) return
    const tick = () => {
      const left = Math.max(0, Math.round((deadline - Date.now()) / 1000))
      setSecondsLeft(left)
      if (left === 0) {
        window.clearInterval(timer)
        void submitRef.current('TIMEOUT')
      }
    }
    const timer = window.setInterval(tick, 1000)
    tick()
    return () => window.clearInterval(timer)
  }, [page, deadline])

  // Giám sát chuyển tab trong khi làm bài
  useEffect(() => {
    if (page !== 'exam') return
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'hidden') return
      setTabWarning(true)
      api
        .sendProctoringEvent('TAB_HIDDEN', { timestamp: Date.now(), userAgent: navigator.userAgent })
        .then((res) => {
          if (res.tabWarnings !== undefined) setSession((prev) => prev && { ...prev, tabWarnings: res.tabWarnings! })
        })
        .catch(() => undefined)
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [page])

  const joinRoom = async () => {
    setJoinError('')
    if (!joinClass.trim() || !joinCode.trim()) {
      setJoinError('Vui lòng nhập lớp và mã phòng thi.')
      return
    }
    setJoining(true)
    try {
      await api.joinExam(joinCode.trim(), joinClass.trim())
      const s = await syncSession()
      if (s?.status === 'pending') notify('Đã gửi yêu cầu tham gia. Vui lòng chờ giáo viên duyệt.')
    } catch (err: any) {
      setJoinError(err.message)
    } finally {
      setJoining(false)
    }
  }

  const selectAnswer = async (questionId: string, optionId: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: optionId }))
    setSaveState('saving')
    try {
      await api.saveAnswer(questionId, optionId)
      setSaveState('saved')
    } catch (err: any) {
      setSaveState('error')
      notify(`Chưa lưu được đáp án: ${err.message}`)
      if (err.code === 'EXAM_NOT_ACTIVE' || err.code === 'EXAM_TIMEOUT' || err.code === 'ALREADY_SUBMITTED') void syncRef.current()
    }
  }

  if (page === 'loading') {
    return (
      <div className="center-wrap">
        <span className="loading-state">Đang tải phiên thi...</span>
      </div>
    )
  }

  if (page === 'join' || !session) {
    return (
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
          <p>Nhập lớp và mã phòng thi do giáo viên cung cấp để gửi yêu cầu tham gia.</p>
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
          <h2>Chào {user.displayName.split(' ').slice(-1)[0]}!</h2>
          <p className="form-subtitle">Điền thông tin để gửi yêu cầu vào phòng thi.</p>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void joinRoom()
            }}
          >
            <label>Họ và tên (theo tài khoản)</label>
            <input value={user.displayName} disabled />
            <label>
              Lớp của bạn <span>*</span>
            </label>
            <input value={joinClass} onChange={(e) => setJoinClass(e.target.value)} placeholder="Ví dụ: 12A1" />
            <label>
              Mã phòng thi <span>*</span>
            </label>
            <div className="input-with-icon">
              <BookOpenCheck size={17} />
              <input value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} placeholder="Ví dụ: EXAM-123" />
            </div>
            {joinError && (
              <div className="error-message">
                <ShieldAlert size={15} />
                {joinError}
              </div>
            )}
            <button className="button primary full-button" type="submit" disabled={joining}>
              {joining ? 'Đang gửi yêu cầu...' : 'Gửi yêu cầu tham gia'} <ArrowRight size={17} />
            </button>
          </form>
          <div className="privacy-note">
            <ShieldCheck size={15} /> Phiên thi được định danh bằng tài khoản {user.email}.
          </div>
        </div>
      </div>
    )
  }

  if (page === 'waiting') {
    const canEnter = (session.status === 'approved' || session.status === 'in_progress') && session.examStatus === 'active'
    const symbol = session.status === 'rejected' ? 'rejected' : session.status === 'pending' ? 'pending' : 'approved'
    return (
      <div className="center-wrap">
        <div className="waiting-card">
          <div className={`waiting-symbol ${symbol}`}>
            <span>{symbol === 'approved' ? <CheckCircle2 size={34} /> : symbol === 'rejected' ? <X size={34} /> : <Clock3 size={34} />}</span>
          </div>
          <div className="section-kicker">PHÒNG {session.joinCode}</div>
          <h1>
            {session.status === 'pending'
              ? 'Đang chờ giáo viên duyệt'
              : session.status === 'rejected'
              ? 'Yêu cầu chưa được chấp nhận'
              : canEnter
              ? 'Kỳ thi đã bắt đầu!'
              : 'Bạn đã được duyệt!'}
          </h1>
          <p>
            {session.status === 'pending'
              ? 'Yêu cầu của bạn đã được gửi. Trang sẽ tự động cập nhật khi giáo viên duyệt.'
              : session.status === 'rejected'
              ? 'Hãy liên hệ giáo viên để kiểm tra lại thông tin.'
              : canEnter
              ? 'Nhấn nút bên dưới để bắt đầu làm bài. Thời gian được máy chủ tính từ lúc kỳ thi bắt đầu.'
              : 'Vui lòng chờ giáo viên bắt đầu kỳ thi. Nút vào thi sẽ tự động sáng.'}
          </p>
          <div className="waiting-details">
            <div>
              <span>Thí sinh</span>
              <strong>{session.displayName}</strong>
            </div>
            <div>
              <span>Lớp</span>
              <strong>{session.className}</strong>
            </div>
            <div>
              <span>Phòng thi</span>
              <strong>{session.examTitle}</strong>
            </div>
            <div>
              <span>Thời lượng</span>
              <strong>{session.durationMinutes} phút</strong>
            </div>
            <div>
              <span>Trạng thái</span>
              <strong className={`inline-status ${session.status}`}>{statusLabels[session.status]}</strong>
            </div>
          </div>
          {canEnter && (
            <button className="button primary full-button" disabled={opening} onClick={() => void openExam(session)}>
              <Play size={17} /> {opening ? 'Đang tải đề thi...' : session.status === 'in_progress' ? 'Tiếp tục làm bài' : 'Vào làm bài thi'}
            </button>
          )}
          <div className="info-hint">
            <Activity size={16} /> Trạng thái duyệt và thời điểm bắt đầu thi được cập nhật theo thời gian thực từ giáo viên.
          </div>
          <button className="text-button" onClick={leaveSession}>
            <ArrowLeft size={15} /> Rời phòng thi
          </button>
        </div>
      </div>
    )
  }

  if (page === 'result') {
    const submitted = Boolean(result)
    return (
      <div className="center-wrap">
        <div className="result-card">
          <div className={`result-icon ${submitted ? '' : 'neutral'}`}>{submitted ? <CheckCircle2 size={34} /> : <Flag size={34} />}</div>
          <div className="section-kicker">{submitted ? 'HOÀN THÀNH BÀI THI' : 'KỲ THI ĐÃ KẾT THÚC'}</div>
          <h1>{submitted ? 'Bài làm đã được chấm điểm!' : session.status === 'absent' ? 'Bạn chưa làm bài thi này' : 'Kỳ thi đã kết thúc'}</h1>
          <p>
            {submitted
              ? `${session.displayName} • ${session.examTitle}`
              : 'Không có bài làm nào được ghi nhận cho bạn trong kỳ thi này.'}
          </p>
          {result && (
            <>
              <div className="score-circle">
                <strong>
                  {formatScore(result.score)}
                  <small>/{result.maxScore}</small>
                </strong>
                <span>ĐIỂM SỐ CHÍNH THỨC</span>
              </div>
              <div className="result-stats">
                <div>
                  <strong>
                    {result.correctCount}/{result.totalQuestions}
                  </strong>
                  <span>Câu đúng</span>
                </div>
                <div>
                  <strong>{session.tabWarnings}</strong>
                  <span>Lượt rời trang</span>
                </div>
              </div>
              <p className="muted small-text">
                {result.reason === 'TIMEOUT'
                  ? 'Bài làm được hệ thống tự động nộp khi hết giờ. Kết quả đã được lưu trên máy chủ.'
                  : 'Kết quả đã được chấm và lưu trữ chính thức trên máy chủ.'}
              </p>
            </>
          )}
          <button className="button primary full-button" onClick={leaveSession}>
            Tham gia phòng thi khác <ArrowRight size={16} />
          </button>
        </div>
      </div>
    )
  }

  // page === 'exam'
  return (
    <div className="exam-shell">
      <div className="exam-header">
        <div className="exam-brand">
          <div className="brand-mark">
            <BookOpenCheck size={20} />
          </div>
          <div>
            <strong>{session.examTitle}</strong>
            <span>MÃ PHÒNG: {session.joinCode}</span>
          </div>
        </div>
        <div className={`exam-timer ${secondsLeft < 300 ? 'urgent' : ''}`}>
          <Clock3 size={18} />
          <div>
            <small>THỜI GIAN CÒN LẠI</small>
            <strong>{formatCountdown(secondsLeft)}</strong>
          </div>
        </div>
        <button className="button primary" onClick={() => setShowSubmit(true)}>
          Nộp bài <ArrowRight size={16} />
        </button>
      </div>

      <div className="exam-progress">
        <div>
          <span>Tiến độ bài làm</span>
          <span className={`save-indicator ${saveState}`}>
            {saveState === 'saving' ? 'Đang lưu...' : saveState === 'saved' ? 'Đã lưu lên máy chủ' : saveState === 'error' ? 'Lưu thất bại' : ''}
          </span>
          <strong>
            {answeredCount}/{questions.length} câu
          </strong>
        </div>
        <div className="progress-track">
          <span style={{ width: `${questions.length ? (answeredCount / questions.length) * 100 : 0}%` }} />
        </div>
      </div>

      {tabWarning && (
        <div className="warning-banner">
          <ShieldAlert size={19} />
          <div>
            <strong>Đã ghi nhận sự kiện rời trang</strong>
            <p>Hệ thống ghi nhận trang thi bị ẩn. Sự kiện này được gửi tới giáo viên giám sát.</p>
          </div>
          <button onClick={() => setTabWarning(false)}>
            <X size={17} />
          </button>
        </div>
      )}

      {currentQuestion && (
        <div className="exam-body">
          <aside className="question-nav panel">
            <div className="section-kicker">DANH SÁCH CÂU HỎI</div>
            <div className="question-grid">
              {questions.map((q, i) => (
                <button key={q.id} className={`${i === questionIndex ? 'selected' : ''} ${answers[q.id] ? 'answered' : ''}`} onClick={() => setQuestionIndex(i)}>
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
              <p>Đáp án được tự động lưu lên máy chủ. Hết giờ, bài làm sẽ được nộp tự động.</p>
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
                const isChosen = answers[currentQuestion.id] === option.id
                return (
                  <button key={option.id} className={`answer-option ${isChosen ? 'chosen' : ''}`} onClick={() => selectAnswer(currentQuestion.id, option.id)}>
                    <span className="option-letter">{String.fromCharCode(65 + i)}</span>
                    <span>{option.text}</span>
                    {isChosen && <CheckCircle2 size={19} className="option-check" />}
                  </button>
                )
              })}
            </div>
            <div className="question-footer">
              <button className="button secondary" disabled={questionIndex === 0} onClick={() => setQuestionIndex((i) => i - 1)}>
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
      )}

      <div className="exam-footnote">
        <ShieldCheck size={15} /> CBRN-e Online Exam <span>•</span> Đáp án được lưu tự động sau mỗi lần chọn.
      </div>

      {showSubmit && (
        <div className="modal-backdrop">
          <div className="modal submit-modal">
            <div className="submit-icon">
              <ShieldCheck size={25} />
            </div>
            <h2>Bạn chắc chắn muốn nộp bài?</h2>
            <p>
              Bạn đã trả lời <strong>{answeredCount}/{questions.length}</strong> câu hỏi. Sau khi nộp, bài thi sẽ được máy chủ chấm điểm ngay và không thể sửa.
            </p>
            <div className="modal-actions">
              <button className="button secondary" onClick={() => setShowSubmit(false)}>
                Tiếp tục làm bài
              </button>
              <button className="button primary" disabled={submitting} onClick={() => void submitExam('MANUAL')}>
                {submitting ? 'Đang nộp...' : 'Xác nhận nộp bài'} <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
