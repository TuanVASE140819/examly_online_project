import { useEffect, useState } from 'react'
import {
  AlarmClock,
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  CircleCheck,
  ClipboardList,
  Hourglass,
  Lock,
  MessageSquareText,
  Paperclip,
  School,
  Send,
  Sparkles,
  Star,
} from 'lucide-react'
import { api } from '../api/client'
import type { AttachmentMeta, ClassSummary, StudentAssignment } from '../api/types'
import { EmptyState, FormError } from '../components/common'
import { FileDropzone, FileList, MAX_FILE_MB, pickFiles, toDrafts, type DraftFile } from '../components/attachments'
import { dueInfo, formatDateTime, formatPoints, isOverdue } from '../lib/format'

// Đồng bộ với máy chủ: số tệp tối đa trong một bài nộp
const MAX_SUBMISSION_FILES = 3
const MAX_CONTENT = 20000

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

const isDueSoon = (a: StudentAssignment) => !a.submission && dueInfo(a.dueAt).tone === 'soon'

export function StudentClasses({ notify }: { notify: (message: string) => void }) {
  const [classes, setClasses] = useState<ClassSummary[] | null>(null)
  const [assignments, setAssignments] = useState<StudentAssignment[]>([])
  const [code, setCode] = useState('')
  const [joinError, setJoinError] = useState('')
  const [joining, setJoining] = useState(false)
  const [classFilter, setClassFilter] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('todo')
  const [openId, setOpenId] = useState<string | null>(null)

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

  const open = assignments.find((a) => a.id === openId)
  if (open) {
    return (
      <StudentAssignmentDetail
        key={open.id}
        assignment={open}
        notify={notify}
        onBack={() => setOpenId(null)}
        onChange={(updated) => setAssignments((prev) => prev.map((a) => (a.id === updated.id ? updated : a)))}
      />
    )
  }

  const inClass = assignments.filter((a) => !classFilter || a.classId === classFilter)
  const visible = inClass.filter((a) => statusFilter === 'all' || (statusFilter === 'todo' ? !a.submission : Boolean(a.submission)))
  const todoCount = inClass.filter((a) => !a.submission).length

  const summary = [
    { label: 'Cần làm', value: todoCount, icon: <ClipboardList size={17} />, tone: 'blue' },
    { label: 'Sắp đến hạn (48 giờ)', value: inClass.filter(isDueSoon).length, icon: <AlarmClock size={17} />, tone: 'amber' },
    { label: 'Đã nộp', value: inClass.filter((a) => a.submission).length, icon: <CircleCheck size={17} />, tone: 'green' },
    { label: 'Đã có điểm', value: inClass.filter((a) => a.submission?.score !== null && a.submission?.score !== undefined).length, icon: <Star size={17} />, tone: 'violet' },
  ]

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <Sparkles size={14} /> LỚP HỌC & BÀI TẬP
          </div>
          <h1>Bài tập về nhà</h1>
          <p>Xem đề, làm bài và nộp trực tuyến — gõ trực tiếp hoặc đính kèm tệp PDF / Word. Điểm hiện ở Bảng điểm khi giáo viên công bố.</p>
        </div>
      </div>

      <div className="summary-strip">
        {summary.map((s) => (
          <div key={s.label} className="summary-tile">
            <span className={`stat-icon ${s.tone}`}>{s.icon}</span>
            <div>
              <strong>{s.value}</strong>
              <span>{s.label}</span>
            </div>
          </div>
        ))}
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
              title={statusFilter === 'todo' && inClass.length ? 'Không còn bài tập cần làm 🎉' : 'Chưa có bài tập'}
              detail={classes.length ? 'Bài tập giáo viên giao sẽ hiện ở đây.' : 'Nhập mã lớp ở bên cạnh để vào lớp và nhận bài tập.'}
            />
          ) : (
            <ul className="hw-list compact">
              {visible.map((a) => (
                <StudentAssignmentCard key={a.id} assignment={a} onOpen={() => setOpenId(a.id)} />
              ))}
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
    </>
  )
}

function StudentAssignmentCard({ assignment: a, onOpen }: { assignment: StudentAssignment; onOpen: () => void }) {
  const status = assignmentStatus(a)
  // Bài đã nộp không cần nhắc hạn bằng màu cảnh báo
  const due = a.submission ? { ...dueInfo(a.dueAt), tone: 'none' as const } : dueInfo(a.dueAt)
  const dueDate = a.dueAt ? new Date(a.dueAt) : null

  return (
    <li className="hw-card clickable" onClick={onOpen}>
      <div className={`due-badge ${due.tone}`} aria-hidden="true">
        {dueDate ? (
          <>
            <strong>{String(dueDate.getDate()).padStart(2, '0')}</strong>
            <small>TH {dueDate.getMonth() + 1}</small>
          </>
        ) : (
          <ClipboardList size={18} />
        )}
      </div>
      <div className="hw-card-body">
        <div className="hw-card-head">
          <span className="hw-card-title">{a.title}</span>
          <span className={`status-pill ${status.tone}`}>{status.label}</span>
        </div>
        <div className="hw-card-meta">
          <span>
            <School size={13} /> {a.className}
          </span>
          <span className={`due-chip ${due.tone}`}>
            <CalendarClock size={13} />
            {a.dueAt ? `${formatDateTime(a.dueAt)}${a.submission ? '' : ` • ${due.text}`}` : due.text}
          </span>
          {a.attachments.length > 0 && (
            <span>
              <Paperclip size={13} /> {a.attachments.length} tệp đề
            </span>
          )}
          {a.submission?.feedback && (
            <span>
              <MessageSquareText size={13} /> Có nhận xét
            </span>
          )}
        </div>
      </div>
      <div className="hw-card-actions">
        <button
          className={`button ${a.submission ? 'secondary' : 'primary'} small-button`}
          onClick={(e) => {
            e.stopPropagation()
            onOpen()
          }}
        >
          {a.submission ? 'Xem bài nộp' : 'Làm bài'} <ArrowRight size={14} />
        </button>
      </div>
    </li>
  )
}

function StudentAssignmentDetail({
  assignment: a,
  notify,
  onBack,
  onChange,
}: {
  assignment: StudentAssignment
  notify: (message: string) => void
  onBack: () => void
  onChange: (a: StudentAssignment) => void
}) {
  const s = a.submission
  const locked = Boolean(s?.locked)
  const [content, setContent] = useState(s?.content ?? '')
  const [removed, setRemoved] = useState<AttachmentMeta[]>([])
  const [drafts, setDrafts] = useState<DraftFile[]>([])
  const [fileError, setFileError] = useState('')
  const [error, setError] = useState('')
  const [progress, setProgress] = useState('')
  const [saving, setSaving] = useState(false)

  const kept = (s?.attachments ?? []).filter((f) => !removed.some((r) => r.id === f.id))
  const slotsLeft = MAX_SUBMISSION_FILES - kept.length - drafts.length
  const changed = content.trim() !== (s?.content ?? '') || removed.length > 0 || drafts.length > 0
  const status = assignmentStatus(a)
  const due = dueInfo(a.dueAt)

  const addFiles = (picked: File[]) => {
    const { accepted, error: problem } = pickFiles(picked, slotsLeft)
    setDrafts((prev) => [...prev, ...toDrafts(accepted)])
    setFileError(problem)
  }

  const leave = () => {
    if (changed && !locked && !window.confirm('Bài làm có thay đổi chưa nộp. Rời trang và bỏ các thay đổi?')) return
    onBack()
  }

  // Thứ tự: gỡ tệp cũ → tải tệp mới → lưu phần chữ (bước cuối kiểm tra bài nộp không trống)
  const submit = async () => {
    if (!content.trim() && !kept.length && !drafts.length) return setError('Hãy nhập bài làm hoặc đính kèm ít nhất một tệp PDF / Word.')
    setSaving(true)
    setError('')
    let latest = a
    try {
      for (const file of removed) {
        latest = await api.removeSubmissionFile(a.id, file.id)
        setRemoved((prev) => prev.filter((f) => f.id !== file.id))
      }
      for (const [i, draft] of drafts.entries()) {
        setProgress(`Đang tải tệp ${i + 1}/${drafts.length}: ${draft.file.name}`)
        latest = await api.addSubmissionFile(a.id, draft.file)
        setDrafts((prev) => prev.filter((d) => d.key !== draft.key))
      }
      setProgress('Đang nộp bài...')
      latest = await api.submitAssignment(a.id, content.trim())
      setContent(latest.submission?.content ?? '')
      setFileError('')
      notify(latest.submission?.late ? 'Đã nộp bài (sau hạn nộp).' : 'Đã nộp bài tập. Bạn vẫn sửa được cho tới khi giáo viên chấm.')
    } catch (err: any) {
      setError(err.message)
    } finally {
      onChange(latest)
      setSaving(false)
      setProgress('')
    }
  }

  return (
    <>
      <button className="back-link" onClick={leave}>
        <ArrowLeft size={15} /> Bài tập về nhà
      </button>
      <div className="page-heading hw-detail-heading">
        <div>
          <div className="eyebrow">
            <School size={14} /> {a.className.toUpperCase()}
          </div>
          <h1>{a.title}</h1>
          <div className="hw-detail-meta">
            <span className={`status-pill ${status.tone}`}>{status.label}</span>
            <span className={`due-chip ${s ? 'none' : due.tone}`}>
              <CalendarClock size={13} />
              {a.dueAt ? `Hạn ${formatDateTime(a.dueAt)}${s ? '' : ` • ${due.text}`}` : due.text}
            </span>
            <span className="due-chip none">Thang điểm {formatPoints(a.maxScore)}</span>
          </div>
        </div>
      </div>

      <div className="hw-detail-grid">
        <section className="panel hw-panel">
          <div className="hw-panel-title">
            <span className="hw-panel-icon blue">
              <ClipboardList size={17} />
            </span>
            <div>
              <div className="section-kicker">ĐỀ BÀI</div>
              <h2>Yêu cầu của giáo viên</h2>
            </div>
          </div>
          {a.instructions && <p className="pre-wrap brief-text">{a.instructions}</p>}
          {a.attachments.length > 0 && <div className="section-kicker spaced">TỆP ĐỀ BÀI • BẤM ĐỂ XEM</div>}
          <FileList attachments={a.attachments} empty={a.instructions ? undefined : 'Giáo viên chưa ghi yêu cầu cho bài tập này.'} />
        </section>

        <section className="panel hw-panel">
          <div className="hw-panel-title">
            <span className="hw-panel-icon green">
              <Send size={16} />
            </span>
            <div>
              <div className="section-kicker">BÀI LÀM CỦA BẠN</div>
              <h2>{s ? `Đã nộp lúc ${formatDateTime(s.submittedAt)}${s.late ? ' (muộn)' : ''}` : 'Chưa nộp bài'}</h2>
            </div>
          </div>

          {s?.score !== null && s?.score !== undefined && (
            <div className="grade-box">
              <strong>
                {formatPoints(s.score)}
                <small>/{formatPoints(a.maxScore)}</small>
              </strong>
              <div>
                <span className="section-kicker">NHẬN XÉT CỦA GIÁO VIÊN</span>
                <p className="pre-wrap">{s.feedback || 'Giáo viên không để lại nhận xét.'}</p>
              </div>
            </div>
          )}
          {locked && (
            <div className="locked-note">
              <Lock size={14} />
              <span>
                Giáo viên đã chấm bài này nên bạn không sửa được nữa.
                {s?.score === null ? ' Điểm sẽ hiện khi giáo viên công bố.' : ''}
              </span>
            </div>
          )}

          <label className="field-label" htmlFor="hw-content">
            Trả lời trực tiếp <span className="label-note">không bắt buộc nếu nộp tệp</span>
          </label>
          <textarea
            id="hw-content"
            className="hw-textarea"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            disabled={locked || saving}
            maxLength={MAX_CONTENT}
            placeholder="Gõ bài làm tại đây..."
          />
          <div className="essay-count">
            {content.length}/{MAX_CONTENT} ký tự
          </div>

          <label className="field-label">
            Tệp bài làm <span className="label-note">PDF hoặc Word, tối đa {MAX_SUBMISSION_FILES} tệp</span>
          </label>
          <div className="form-files">
            <FileList
              attachments={kept}
              drafts={drafts}
              onRemoveAttachment={locked || saving ? undefined : (f) => setRemoved((prev) => [...prev, f])}
              onRemoveDraft={saving ? undefined : (d) => setDrafts((prev) => prev.filter((x) => x.key !== d.key))}
              empty={locked ? 'Không có tệp đính kèm.' : undefined}
            />
            {!locked && slotsLeft > 0 && (
              <FileDropzone
                onFiles={addFiles}
                disabled={saving}
                title={kept.length || drafts.length ? 'Thêm tệp khác' : 'Kéo thả bài làm vào đây hoặc bấm để chọn'}
                hint={`.pdf, .doc, .docx • tối đa ${MAX_FILE_MB} MB mỗi tệp`}
              />
            )}
            {fileError && <p className="file-error">{fileError}</p>}
          </div>

          <FormError message={error} />
          {!locked && (
            <div className="hw-submit-row">
              <span className="upload-progress">
                {progress ||
                  (changed ? (
                    'Có thay đổi chưa nộp'
                  ) : s ? (
                    <>
                      <CircleCheck size={13} /> Đã lưu bài nộp
                    </>
                  ) : (
                    <>
                      <Hourglass size={13} /> {a.dueAt && !isOverdue(a.dueAt) ? due.text : 'Chưa nộp'}
                    </>
                  ))}
              </span>
              <button className="button primary" disabled={saving || !changed} onClick={() => void submit()}>
                <Send size={14} /> {saving ? 'Đang nộp...' : s ? 'Cập nhật bài nộp' : 'Nộp bài'}
              </button>
            </div>
          )}
        </section>
      </div>
    </>
  )
}
