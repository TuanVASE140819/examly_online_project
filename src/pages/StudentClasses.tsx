import { useEffect, useState } from 'react'
import { ArrowRight, CalendarClock, ClipboardList, Lock, MessageSquareText, School, Send, Sparkles } from 'lucide-react'
import { api } from '../api/client'
import type { ClassSummary, StudentAssignment } from '../api/types'
import { EmptyState, FormError, Modal } from '../components/common'
import { formatDateTime, formatPoints, isOverdue } from '../lib/format'

type StatusFilter = 'all' | 'todo' | 'done'

const statusFilters: { key: StatusFilter; label: string }[] = [
  { key: 'todo', label: 'Cần làm' },
  { key: 'done', label: 'Đã nộp' },
  { key: 'all', label: 'Tất cả' },
]

function assignmentStatus(a: StudentAssignment) {
  const s = a.submission
  if (!s) return isOverdue(a.dueAt) ? { label: 'Quá hạn', tone: 'rejected' } : { label: 'Chưa nộp', tone: 'pending' }
  if (s.score !== null) return { label: `Điểm ${formatPoints(s.score)}/${formatPoints(a.maxScore)}`, tone: 'submitted' }
  if (s.locked) return { label: 'Đã chấm • chờ công bố', tone: 'in_progress' }
  return s.late ? { label: 'Nộp muộn', tone: 'pending' } : { label: 'Đã nộp', tone: 'approved' }
}

export function StudentClasses({ notify }: { notify: (message: string) => void }) {
  const [classes, setClasses] = useState<ClassSummary[] | null>(null)
  const [assignments, setAssignments] = useState<StudentAssignment[]>([])
  const [code, setCode] = useState('')
  const [joinError, setJoinError] = useState('')
  const [joining, setJoining] = useState(false)
  const [classFilter, setClassFilter] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('todo')
  const [open, setOpen] = useState<StudentAssignment | null>(null)

  const load = () =>
    Promise.all([api.myClasses(), api.myAssignments()])
      .then(([c, a]) => {
        setClasses(c)
        setAssignments(a)
      })
      .catch((err) => notify(err.message))

  useEffect(() => {
    void load()
  }, [])

  const join = async () => {
    if (code.trim().length < 4) return setJoinError('Nhập mã lớp giáo viên gửi cho bạn, ví dụ LOP-AB12CD.')
    setJoining(true)
    setJoinError('')
    try {
      const res = await api.joinClass(code.trim())
      setCode('')
      notify(res.alreadyMember ? `Bạn đã ở trong lớp ${res.class.name}.` : `Đã vào lớp ${res.class.name}!`)
      await load()
    } catch (err: any) {
      setJoinError(err.message)
    } finally {
      setJoining(false)
    }
  }

  const visible = assignments.filter(
    (a) =>
      (!classFilter || a.classId === classFilter) &&
      (statusFilter === 'all' || (statusFilter === 'todo' ? !a.submission : Boolean(a.submission)))
  )
  const todoCount = assignments.filter((a) => !a.submission && (!classFilter || a.classId === classFilter)).length

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <Sparkles size={14} /> LỚP HỌC & BÀI TẬP
          </div>
          <h1>Bài tập về nhà</h1>
          <p>Làm và nộp bài tập giáo viên giao. Điểm hiện ở mục Bảng điểm khi giáo viên công bố.</p>
        </div>
      </div>

      <div className="dashboard-grid student-classes-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <div className="section-kicker">BÀI TẬP</div>
              <h2>
                {classFilter ? classes?.find((c) => c.id === classFilter)?.name : 'Tất cả lớp'}{' '}
                {todoCount > 0 && <span className="count-badge">{todoCount} cần làm</span>}
              </h2>
            </div>
            <div className="segmented" role="tablist" aria-label="Lọc bài tập">
              {statusFilters.map((f) => (
                <button key={f.key} role="tab" aria-selected={statusFilter === f.key} className={statusFilter === f.key ? 'active' : ''} onClick={() => setStatusFilter(f.key)}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          {!classes ? (
            <p className="loading-state table-loading">Đang tải bài tập...</p>
          ) : visible.length === 0 ? (
            <EmptyState
              icon={<ClipboardList size={24} />}
              title={statusFilter === 'todo' && assignments.length ? 'Không còn bài tập cần làm' : 'Chưa có bài tập'}
              detail={classes.length ? 'Bài tập giáo viên giao sẽ hiện ở đây.' : 'Nhập mã lớp ở bên cạnh để vào lớp và nhận bài tập.'}
            />
          ) : (
            <ul className="assignment-list">
              {visible.map((a) => {
                const status = assignmentStatus(a)
                return (
                  <li key={a.id} className="assignment-item clickable" onClick={() => setOpen(a)}>
                    <div className="assignment-head">
                      <strong>{a.title}</strong>
                      <span className={`status-pill ${status.tone}`}>{status.label}</span>
                    </div>
                    <div className="assignment-meta">
                      <span>
                        <School size={13} /> {a.className}
                      </span>
                      <span className={!a.submission && isOverdue(a.dueAt) ? 'overdue' : ''}>
                        <CalendarClock size={13} /> {a.dueAt ? `Hạn ${formatDateTime(a.dueAt)}` : 'Không có hạn nộp'}
                      </span>
                      {a.submission?.feedback && (
                        <span>
                          <MessageSquareText size={13} /> Có nhận xét
                        </span>
                      )}
                    </div>
                    <button className={`button ${a.submission ? 'secondary' : 'primary'} small-button`} onClick={(e) => (e.stopPropagation(), setOpen(a))}>
                      {a.submission ? 'Xem bài nộp' : 'Làm bài'} <ArrowRight size={14} />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <div className="side-stack">
          <section className="panel join-class-panel">
            <div className="section-kicker">VÀO LỚP MỚI</div>
            <h2>Nhập mã lớp</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                void join()
              }}
            >
              <div className="inline-form">
                <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Ví dụ: LOP-AB12CD" aria-label="Mã lớp" />
                <button className="button primary" type="submit" disabled={joining}>
                  {joining ? 'Đang vào...' : 'Vào lớp'}
                </button>
              </div>
            </form>
            <FormError message={joinError} />
          </section>

          <section className="panel">
            <div className="panel-heading">
              <div>
                <div className="section-kicker">LỚP CỦA BẠN</div>
                <h2>
                  Lớp học <span className="count-badge">{classes?.length ?? 0}</span>
                </h2>
              </div>
            </div>
            {classes && classes.length === 0 ? (
              <p className="activity-empty">Bạn chưa ở lớp nào. Hỏi giáo viên mã lớp hoặc nhờ giáo viên thêm bạn bằng email.</p>
            ) : (
              <ul className="class-chips">
                <li>
                  <button className={!classFilter ? 'active' : ''} onClick={() => setClassFilter(null)}>
                    <strong>Tất cả lớp</strong>
                    <span>{assignments.length} bài tập</span>
                  </button>
                </li>
                {classes?.map((c) => (
                  <li key={c.id}>
                    <button className={classFilter === c.id ? 'active' : ''} onClick={() => setClassFilter(c.id)}>
                      <strong>{c.name}</strong>
                      <span>
                        GV {c.teacherName} • {c.assignmentCount} bài tập
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      {open && (
        <SubmitAssignmentModal
          assignment={open}
          onClose={() => setOpen(null)}
          onSaved={(updated) => {
            setAssignments((prev) => prev.map((a) => (a.id === updated.id ? updated : a)))
            setOpen(null)
            notify(updated.submission?.late ? 'Đã nộp bài (sau hạn nộp).' : 'Đã nộp bài tập.')
          }}
        />
      )}
    </>
  )
}

function SubmitAssignmentModal({
  assignment: a,
  onClose,
  onSaved,
}: {
  assignment: StudentAssignment
  onClose: () => void
  onSaved: (a: StudentAssignment) => void
}) {
  const [content, setContent] = useState(a.submission?.content ?? '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const locked = Boolean(a.submission?.locked)

  const save = async () => {
    if (!content.trim()) return setError('Bài làm không được để trống.')
    setSaving(true)
    setError('')
    try {
      onSaved(await api.submitAssignment(a.id, content))
    } catch (err: any) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <Modal
      kicker={`${a.className.toUpperCase()} • BÀI TẬP`}
      title={a.title}
      className="grading-modal"
      onClose={onClose}
      onSubmit={locked ? undefined : () => void save()}
      actions={
        locked ? (
          <button type="button" className="button secondary" onClick={onClose}>
            Đóng
          </button>
        ) : (
          <>
            <button type="button" className="button secondary" onClick={onClose}>
              Hủy
            </button>
            <button type="submit" className="button primary" disabled={saving || content === (a.submission?.content ?? '')}>
              <Send size={14} /> {saving ? 'Đang nộp...' : a.submission ? 'Cập nhật bài nộp' : 'Nộp bài'}
            </button>
          </>
        )
      }
    >
      <p className="modal-copy">
        {a.dueAt ? `Hạn nộp ${formatDateTime(a.dueAt)}` : 'Không có hạn nộp'} • Thang điểm {formatPoints(a.maxScore)}
        {a.submission && ` • Đã nộp lúc ${formatDateTime(a.submission.submittedAt)}${a.submission.late ? ' (muộn)' : ''}`}
      </p>
      <div className="section-kicker">YÊU CẦU</div>
      <p className="pre-wrap instructions-text">{a.instructions}</p>

      {a.submission?.score !== null && a.submission?.score !== undefined && (
        <div className="grade-box">
          <strong>
            {formatPoints(a.submission.score)}
            <small>/{formatPoints(a.maxScore)}</small>
          </strong>
          <div>
            <span className="section-kicker">NHẬN XÉT CỦA GIÁO VIÊN</span>
            <p className="pre-wrap">{a.submission.feedback || 'Giáo viên không để lại nhận xét.'}</p>
          </div>
        </div>
      )}

      <label>Bài làm của bạn</label>
      <textarea
        className="essay-input"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        disabled={locked}
        maxLength={20000}
        placeholder="Nhập bài làm, có thể dán đường dẫn tới file (Google Drive...)"
      />
      <div className="essay-count">{content.length}/20000 ký tự</div>
      {locked && (
        <p className="field-hint">
          <Lock size={11} /> Giáo viên đã chấm bài này nên bạn không sửa được nữa.
          {a.submission?.score === null ? ' Điểm sẽ hiện khi giáo viên công bố.' : ''}
        </p>
      )}
      <FormError message={error} />
    </Modal>
  )
}
