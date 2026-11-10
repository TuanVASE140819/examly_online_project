import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  CalendarClock,
  Check,
  ChevronRight,
  ClipboardList,
  Copy,
  Eye,
  EyeOff,
  FileText,
  Paperclip,
  Pencil,
  PenLine,
  Plus,
  School,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import { api } from '../api/client'
import type { AssignmentRoster, AttachmentMeta, AuthUser, ClassDetail, ClassSummary, RosterEntry, TeacherAssignment } from '../api/types'
import { EmptyState, FormError, Modal, Stat } from '../components/common'
import { FileDropzone, FileList, MAX_FILE_MB, pickFiles, toDrafts, type DraftFile } from '../components/attachments'
import { classAccent, dueInfo, formatDate, formatDateTime, formatPoints, initials, toDateTimeInput } from '../lib/format'

// Đồng bộ với máy chủ: số tệp đề bài tối đa cho mỗi bài tập
const MAX_ASSIGNMENT_FILES = 5

interface Props {
  user: AuthUser
  notify: (message: string) => void
}

const copyText = (text: string, notify: (m: string) => void, label: string) =>
  navigator.clipboard?.writeText(text).then(
    () => notify(`Đã sao chép ${label} ${text}.`),
    () => notify(`${label}: ${text}`)
  )

export function TeacherClasses({ user, notify }: Props) {
  const [classes, setClasses] = useState<ClassSummary[] | null>(null)
  const [classId, setClassId] = useState<string | null>(null)
  const [assignmentId, setAssignmentId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const loadClasses = () =>
    api
      .listClasses()
      .then(setClasses)
      .catch((err) => notify(err.message))

  useEffect(() => {
    void loadClasses()
  }, [])

  if (assignmentId) {
    return <AssignmentGrading assignmentId={assignmentId} notify={notify} onBack={() => setAssignmentId(null)} />
  }

  if (classId) {
    return (
      <ClassDetailView
        classId={classId}
        notify={notify}
        onBack={() => {
          setClassId(null)
          void loadClasses()
        }}
        onOpenAssignment={setAssignmentId}
      />
    )
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <Sparkles size={14} /> LỚP HỌC & BÀI TẬP
          </div>
          <h1>Lớp học của bạn</h1>
          <p>Tạo lớp, thêm học sinh, giao bài tập về nhà kèm đề PDF / Word và công bố điểm khi chấm xong.</p>
        </div>
        <button className="button primary" onClick={() => setCreating(true)}>
          <Plus size={18} /> Tạo lớp mới
        </button>
      </div>

      {!classes ? (
        <div className="center-wrap">
          <span className="loading-state">Đang tải lớp học...</span>
        </div>
      ) : classes.length === 0 ? (
        <section className="panel">
          <EmptyState icon={<School size={24} />} title="Chưa có lớp học" detail="Tạo lớp đầu tiên rồi gửi mã lớp cho học sinh, hoặc thêm học sinh bằng email." />
        </section>
      ) : (
        <div className="class-grid">
          {classes.map((c) => (
            <button key={c.id} className={`class-card ${classAccent(c.id)}`} onClick={() => setClassId(c.id)}>
              <div className="class-card-cover">
                <span className="class-icon">
                  <School size={18} />
                </span>
                <span className="class-code-tag">{c.joinCode}</span>
              </div>
              <div className="class-card-body">
                <h3>{c.name}</h3>
                <p>{c.description || 'Chưa có mô tả.'}</p>
              </div>
              <div className="class-card-foot">
                <span>
                  <Users size={14} /> {c.memberCount} học sinh
                </span>
                <span>
                  <ClipboardList size={14} /> {c.assignmentCount} bài tập
                </span>
                {user.role === 'ADMIN' && c.teacherId !== user.id && <span>GV {c.teacherName}</span>}
                <ChevronRight size={16} className="class-card-arrow" />
              </div>
            </button>
          ))}
          <button className="class-card add-card" onClick={() => setCreating(true)}>
            <span className="add-card-icon">
              <Plus size={20} />
            </span>
            <strong>Tạo lớp mới</strong>
            <span>Mã lớp được tạo tự động</span>
          </button>
        </div>
      )}

      {creating && (
        <ClassFormModal
          onClose={() => setCreating(false)}
          onSaved={(c) => {
            setCreating(false)
            setClasses((prev) => [c, ...(prev ?? [])])
            setClassId(c.id)
            notify(`Đã tạo lớp ${c.name}. Mã lớp: ${c.joinCode}`)
          }}
        />
      )}
    </>
  )
}

type ClassTab = 'assignments' | 'members'

function ClassDetailView({
  classId,
  notify,
  onBack,
  onOpenAssignment,
}: {
  classId: string
  notify: (message: string) => void
  onBack: () => void
  onOpenAssignment: (assignmentId: string) => void
}) {
  const [detail, setDetail] = useState<ClassDetail | null>(null)
  const [tab, setTab] = useState<ClassTab>('assignments')
  const [editingClass, setEditingClass] = useState(false)
  const [editingAssignment, setEditingAssignment] = useState<TeacherAssignment | 'new' | null>(null)
  const [addingMembers, setAddingMembers] = useState(false)

  const load = () =>
    api
      .getClass(classId)
      .then(setDetail)
      .catch((err) => {
        notify(err.message)
        onBack()
      })

  useEffect(() => {
    void load()
  }, [classId])

  if (!detail) {
    return (
      <div className="center-wrap">
        <span className="loading-state">Đang tải lớp học...</span>
      </div>
    )
  }

  const c = detail.class
  const toGrade = detail.assignments.reduce((sum, a) => sum + a.submittedCount - a.gradedCount, 0)

  const removeClass = async () => {
    if (!window.confirm(`Xóa lớp ${c.name}? Toàn bộ bài tập và bài nộp của lớp sẽ bị xóa vĩnh viễn.`)) return
    try {
      await api.deleteClass(c.id)
      notify(`Đã xóa lớp ${c.name}.`)
      onBack()
    } catch (err: any) {
      notify(err.message)
    }
  }

  const removeMember = async (studentId: string, name: string) => {
    if (!window.confirm(`Đưa ${name} ra khỏi lớp ${c.name}?`)) return
    try {
      await api.removeClassMember(c.id, studentId)
      notify(`Đã đưa ${name} ra khỏi lớp.`)
      void load()
    } catch (err: any) {
      notify(err.message)
    }
  }

  const removeAssignment = async (a: TeacherAssignment) => {
    if (!window.confirm(`Xóa bài tập "${a.title}"? ${a.submittedCount} bài nộp và các tệp đính kèm sẽ bị xóa theo.`)) return
    try {
      await api.deleteAssignment(a.id)
      notify('Đã xóa bài tập.')
      void load()
    } catch (err: any) {
      notify(err.message)
    }
  }

  return (
    <>
      <button className="back-link" onClick={onBack}>
        <ArrowLeft size={15} /> Tất cả lớp học
      </button>

      <section className={`class-hero ${classAccent(c.id)}`}>
        <div className="class-hero-main">
          <div className="class-hero-kicker">
            <School size={14} /> LỚP HỌC • GV {c.teacherName.toUpperCase()}
          </div>
          <h1>{c.name}</h1>
          <p>{c.description || 'Chưa có mô tả.'}</p>
          <div className="class-hero-stats">
            <span>
              <Users size={14} /> {detail.members.length} học sinh
            </span>
            <span>
              <ClipboardList size={14} /> {detail.assignments.length} bài tập
            </span>
            <span>
              <PenLine size={14} /> {toGrade} bài chờ chấm
            </span>
          </div>
        </div>
        <div className="class-hero-side">
          <div className="class-hero-code">
            <small>MÃ LỚP</small>
            <strong>{c.joinCode}</strong>
            <button onClick={() => void copyText(c.joinCode, notify, 'mã lớp')}>
              <Copy size={13} /> Sao chép
            </button>
          </div>
          <div className="class-hero-actions">
            <button onClick={() => setEditingClass(true)}>
              <Pencil size={13} /> Sửa lớp
            </button>
            <button onClick={() => void removeClass()}>
              <Trash2 size={13} /> Xóa lớp
            </button>
          </div>
        </div>
      </section>

      <div className="tab-bar">
        <div className="tabs" role="tablist" aria-label="Nội dung lớp học">
          <button role="tab" aria-selected={tab === 'assignments'} className={tab === 'assignments' ? 'active' : ''} onClick={() => setTab('assignments')}>
            <ClipboardList size={15} /> Bài tập <span className="count-badge">{detail.assignments.length}</span>
          </button>
          <button role="tab" aria-selected={tab === 'members'} className={tab === 'members' ? 'active' : ''} onClick={() => setTab('members')}>
            <Users size={15} /> Học sinh <span className="count-badge">{detail.members.length}</span>
          </button>
        </div>
        {tab === 'assignments' ? (
          <button className="button primary" onClick={() => setEditingAssignment('new')}>
            <Plus size={16} /> Giao bài tập
          </button>
        ) : (
          <button className="button primary" onClick={() => setAddingMembers(true)}>
            <UserPlus size={15} /> Thêm học sinh
          </button>
        )}
      </div>

      {tab === 'assignments' &&
        (detail.assignments.length === 0 ? (
          <section className="panel">
            <EmptyState
              icon={<ClipboardList size={24} />}
              title="Chưa có bài tập"
              detail="Giao bài tập kèm đề PDF / Word để học sinh trong lớp làm và nộp trực tuyến."
            />
          </section>
        ) : (
          <ul className="hw-list">
            {detail.assignments.map((a) => (
              <TeacherAssignmentCard
                key={a.id}
                assignment={a}
                memberCount={detail.members.length}
                onOpen={() => onOpenAssignment(a.id)}
                onEdit={() => setEditingAssignment(a)}
                onRemove={() => void removeAssignment(a)}
              />
            ))}
          </ul>
        ))}

      {tab === 'members' && (
        <section className="panel members-panel">
          {detail.members.length === 0 ? (
            <EmptyState icon={<Users size={24} />} title="Lớp chưa có học sinh" detail="Gửi mã lớp cho học sinh hoặc thêm bằng email tài khoản." />
          ) : (
            <ul className="member-grid">
              {detail.members.map((m, i) => (
                <li key={m.id}>
                  <div className={`student-avatar avatar-${i % 5}`}>{initials(m.displayName)}</div>
                  <div className="member-copy">
                    <strong>{m.displayName}</strong>
                    <span>{m.email}</span>
                    <small>Vào lớp {formatDate(m.joinedAt)}</small>
                  </div>
                  <button className="icon-button small danger" title="Đưa ra khỏi lớp" aria-label={`Đưa ${m.displayName} ra khỏi lớp`} onClick={() => void removeMember(m.id, m.displayName)}>
                    <X size={15} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {editingClass && (
        <ClassFormModal
          initial={c}
          onClose={() => setEditingClass(false)}
          onSaved={() => {
            setEditingClass(false)
            notify('Đã cập nhật thông tin lớp.')
            void load()
          }}
        />
      )}
      {editingAssignment && (
        <AssignmentFormModal
          classId={c.id}
          initial={editingAssignment === 'new' ? null : editingAssignment}
          onClose={() => {
            setEditingAssignment(null)
            // Có thể đã lưu một phần (bài tập đã tạo nhưng tải tệp lỗi)
            void load()
          }}
          onSaved={(message) => {
            setEditingAssignment(null)
            notify(message)
            void load()
          }}
        />
      )}
      {addingMembers && (
        <AddMembersModal
          classId={c.id}
          onClose={() => setAddingMembers(false)}
          onDone={(added) => {
            if (added) void load()
          }}
        />
      )}
    </>
  )
}

function TeacherAssignmentCard({
  assignment: a,
  memberCount,
  onOpen,
  onEdit,
  onRemove,
}: {
  assignment: TeacherAssignment
  memberCount: number
  onOpen: () => void
  onEdit: () => void
  onRemove: () => void
}) {
  const due = dueInfo(a.dueAt)
  const total = Math.max(memberCount, a.submittedCount, 1)
  const waiting = a.submittedCount - a.gradedCount

  return (
    <li className="hw-card">
      <div className="hw-card-icon">
        <ClipboardList size={18} />
      </div>
      <div className="hw-card-body">
        <div className="hw-card-head">
          <button className="hw-card-title" onClick={onOpen}>
            {a.title}
          </button>
          <span className={`status-pill ${a.gradesPublished ? 'approved' : 'draft'}`}>{a.gradesPublished ? 'Đã công bố điểm' : 'Chưa công bố điểm'}</span>
        </div>
        <div className="hw-card-meta">
          <span className={`due-chip ${due.tone}`}>
            <CalendarClock size={13} />
            {a.dueAt ? `${formatDateTime(a.dueAt)} • ${due.text}` : due.text}
          </span>
          <span>Thang điểm {formatPoints(a.maxScore)}</span>
          {a.attachments.length > 0 && (
            <span>
              <Paperclip size={13} /> {a.attachments.length} tệp đề
            </span>
          )}
        </div>
        {a.instructions && <p className="hw-card-excerpt">{a.instructions}</p>}
        <div className="hw-progress" title={`${a.submittedCount}/${memberCount} đã nộp, ${a.gradedCount} đã chấm`}>
          <div className="progress-track">
            <span className="submitted" style={{ width: `${(a.submittedCount / total) * 100}%` }} />
            <span className="graded" style={{ width: `${(a.gradedCount / total) * 100}%` }} />
          </div>
          <small>
            <b>{a.submittedCount}</b>/{memberCount} đã nộp • <b>{a.gradedCount}</b> đã chấm
            {waiting > 0 && <em> • {waiting} chờ chấm</em>}
          </small>
        </div>
      </div>
      <div className="hw-card-actions">
        <button className="button primary small-button" onClick={onOpen}>
          <PenLine size={14} /> Chấm bài
        </button>
        <button className="button secondary small-button" onClick={onEdit}>
          <Pencil size={13} /> Sửa
        </button>
        <button className="reject-button" title="Xóa bài tập" aria-label={`Xóa bài tập ${a.title}`} onClick={onRemove}>
          <Trash2 size={14} />
        </button>
      </div>
    </li>
  )
}

function ClassFormModal({ initial, onClose, onSaved }: { initial?: ClassSummary; onClose: () => void; onSaved: (c: ClassSummary) => void }) {
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (name.trim().length < 2) return setError('Tên lớp tối thiểu 2 ký tự.')
    setSaving(true)
    setError('')
    try {
      const input = { name: name.trim(), description: description.trim() || undefined }
      onSaved(initial ? await api.updateClass(initial.id, input) : await api.createClass(input))
    } catch (err: any) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <Modal
      kicker={initial ? 'CẬP NHẬT LỚP' : 'LỚP HỌC MỚI'}
      title={initial ? 'Sửa thông tin lớp' : 'Tạo lớp học'}
      onClose={onClose}
      onSubmit={() => void save()}
      actions={
        <>
          <button type="button" className="button secondary" onClick={onClose}>
            Hủy
          </button>
          <button type="submit" className="button primary" disabled={saving}>
            <Check size={15} /> {saving ? 'Đang lưu...' : initial ? 'Lưu thay đổi' : 'Tạo lớp'}
          </button>
        </>
      }
    >
      {!initial && <p className="modal-copy">Mã lớp được tạo tự động để học sinh tự tham gia.</p>}
      <label>Tên lớp</label>
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ví dụ: 12A1 — Toán" />
      <label>Mô tả (không bắt buộc)</label>
      <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ví dụ: Lớp Toán chiều thứ 3, năm học 2026–2027" />
      <FormError message={error} />
    </Modal>
  )
}

// Hạn nộp nhanh: cuối ngày (23:59) sau n ngày
const dueInDays = (days: number) => {
  const d = new Date()
  d.setDate(d.getDate() + days)
  d.setHours(23, 59, 0, 0)
  return toDateTimeInput(d.toISOString())
}

const DUE_PRESETS = [
  { label: 'Ngày mai', days: 1 },
  { label: '3 ngày', days: 3 },
  { label: '1 tuần', days: 7 },
  { label: '2 tuần', days: 14 },
]

function AssignmentFormModal({
  classId,
  initial,
  onClose,
  onSaved,
}: {
  classId: string
  initial: TeacherAssignment | null
  onClose: () => void
  onSaved: (message: string) => void
}) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [instructions, setInstructions] = useState(initial?.instructions ?? '')
  const [dueAt, setDueAt] = useState(toDateTimeInput(initial?.dueAt))
  const [maxScore, setMaxScore] = useState(String(initial?.maxScore ?? 10))
  // Bài tập đã lưu trên máy chủ (có sẵn khi sửa, hoặc vừa tạo nhưng tải tệp bị lỗi)
  const [savedId, setSavedId] = useState<string | null>(initial?.id ?? null)
  const [files, setFiles] = useState<AttachmentMeta[]>(initial?.attachments ?? [])
  const [removed, setRemoved] = useState<AttachmentMeta[]>([])
  const [drafts, setDrafts] = useState<DraftFile[]>([])
  const [fileError, setFileError] = useState('')
  const [error, setError] = useState('')
  const [progress, setProgress] = useState('')
  const [saving, setSaving] = useState(false)

  const slotsLeft = MAX_ASSIGNMENT_FILES - files.length - drafts.length

  const addFiles = (picked: File[]) => {
    const { accepted, error: problem } = pickFiles(picked, slotsLeft)
    setDrafts((prev) => [...prev, ...toDrafts(accepted)])
    setFileError(problem)
  }

  const save = async () => {
    const max = Number(maxScore.replace(',', '.'))
    if (title.trim().length < 3) return setError('Tiêu đề tối thiểu 3 ký tự.')
    if (!instructions.trim() && !files.length && !drafts.length) return setError('Hãy nhập yêu cầu bài tập hoặc đính kèm tệp đề bài.')
    if (!(max > 0 && max <= 100)) return setError('Thang điểm phải lớn hơn 0 và không quá 100.')
    setSaving(true)
    setError('')
    let id = savedId
    try {
      // datetime-local là giờ địa phương; đổi sang ISO để máy chủ lưu đúng thời điểm
      const input = { title: title.trim(), instructions: instructions.trim(), dueAt: dueAt ? new Date(dueAt).toISOString() : null, maxScore: max }
      if (id) {
        await api.updateAssignment(id, input)
      } else {
        id = (await api.createAssignment(classId, input)).id
        setSavedId(id)
      }
      for (const file of removed) {
        await api.removeAssignmentAttachment(id, file.id)
        setRemoved((prev) => prev.filter((f) => f.id !== file.id))
      }
      for (const [i, draft] of drafts.entries()) {
        setProgress(`Đang tải tệp ${i + 1}/${drafts.length}: ${draft.file.name}`)
        const meta = await api.addAssignmentAttachment(id, draft.file)
        setFiles((prev) => [...prev, meta])
        setDrafts((prev) => prev.filter((d) => d.key !== draft.key))
      }
      onSaved(initial ? 'Đã cập nhật bài tập.' : 'Đã giao bài tập cho cả lớp.')
    } catch (err: any) {
      setError(id ? `${err.message} Bài tập đã được lưu — bấm “Lưu” để thử tải tệp lại.` : err.message)
      setSaving(false)
    } finally {
      setProgress('')
    }
  }

  return (
    <Modal
      kicker={initial ? 'CẬP NHẬT BÀI TẬP' : 'GIAO BÀI TẬP'}
      title={initial ? 'Sửa bài tập' : 'Bài tập về nhà mới'}
      className="assignment-modal"
      onClose={onClose}
      onSubmit={() => void save()}
      actions={
        <>
          {progress && <span className="upload-progress">{progress}</span>}
          <button type="button" className="button secondary" onClick={onClose}>
            Hủy
          </button>
          <button type="submit" className="button primary" disabled={saving}>
            <Check size={15} /> {saving ? 'Đang lưu...' : savedId ? 'Lưu' : 'Giao bài'}
          </button>
        </>
      }
    >
      <label>Tiêu đề</label>
      <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ví dụ: Bài tập chương 2 — Đạo hàm" />

      <label>
        Tệp đề bài <span className="label-note">PDF hoặc Word, tối đa {MAX_ASSIGNMENT_FILES} tệp</span>
      </label>
      <div className="form-files">
        <FileList
          attachments={files}
          drafts={drafts}
          onRemoveAttachment={(f) => {
            setFiles((prev) => prev.filter((x) => x.id !== f.id))
            setRemoved((prev) => [...prev, f])
          }}
          onRemoveDraft={(d) => setDrafts((prev) => prev.filter((x) => x.key !== d.key))}
        />
        {slotsLeft > 0 && (
          <FileDropzone
            onFiles={addFiles}
            disabled={saving}
            title={files.length || drafts.length ? 'Thêm tệp khác' : 'Kéo thả đề bài vào đây hoặc bấm để chọn'}
            hint={`.pdf, .doc, .docx • tối đa ${MAX_FILE_MB} MB mỗi tệp • còn ${slotsLeft} tệp`}
          />
        )}
        {fileError && <p className="file-error">{fileError}</p>}
      </div>

      <label>
        Yêu cầu / hướng dẫn <span className="label-note">{files.length || drafts.length ? 'không bắt buộc khi đã có tệp đề' : ''}</span>
      </label>
      <textarea
        className="tall"
        value={instructions}
        onChange={(e) => setInstructions(e.target.value)}
        placeholder="Mô tả đề bài, cách trình bày, hình thức nộp (gõ trực tiếp hay nộp tệp PDF / Word)..."
      />

      <div className="form-row">
        <div>
          <label>Hạn nộp (không bắt buộc)</label>
          <input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
          <div className="preset-row">
            {DUE_PRESETS.map((p) => (
              <button type="button" key={p.days} onClick={() => setDueAt(dueInDays(p.days))}>
                {p.label}
              </button>
            ))}
            {dueAt && (
              <button type="button" onClick={() => setDueAt('')}>
                Bỏ hạn
              </button>
            )}
          </div>
        </div>
        <div className="points-field">
          <label>Thang điểm</label>
          <input type="number" min={0.5} max={100} step={0.5} value={maxScore} onChange={(e) => setMaxScore(e.target.value)} />
        </div>
      </div>
      <p className="field-hint">Học sinh nộp sau hạn vẫn được nhận nhưng bị đánh dấu “nộp muộn”. Điểm chỉ hiện với học sinh khi bạn bấm công bố.</p>
      <FormError message={error} />
    </Modal>
  )
}

function AddMembersModal({ classId, onClose, onDone }: { classId: string; onClose: () => void; onDone: (added: boolean) => void }) {
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<Awaited<ReturnType<typeof api.addClassMembers>> | null>(null)

  const emails = useMemo(
    () => [...new Set(text.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))],
    [text]
  )

  const save = async () => {
    const invalid = emails.filter((e) => !/^\S+@\S+\.\S+$/.test(e))
    if (!emails.length) return setError('Nhập ít nhất một email.')
    if (invalid.length) return setError(`Email không hợp lệ: ${invalid.join(', ')}`)
    setSaving(true)
    setError('')
    try {
      const res = await api.addClassMembers(classId, emails)
      setResult(res)
      setText([...res.notFound, ...res.notStudent].join('\n'))
      onDone(res.added.length > 0)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      kicker="THÊM THÀNH VIÊN"
      title="Thêm học sinh vào lớp"
      onClose={onClose}
      onSubmit={() => void save()}
      actions={
        <>
          <button type="button" className="button secondary" onClick={onClose}>
            {result ? 'Xong' : 'Hủy'}
          </button>
          <button type="submit" className="button primary" disabled={saving || !emails.length}>
            <UserPlus size={15} /> {saving ? 'Đang thêm...' : `Thêm ${emails.length || ''} học sinh`}
          </button>
        </>
      }
    >
      <p className="modal-copy">Dán email tài khoản học sinh, mỗi dòng một email (hoặc cách nhau bằng dấu phẩy). Học sinh phải đăng ký tài khoản trước.</p>
      <textarea className="tall" autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder={'hocsinh1@gmail.com\nhocsinh2@gmail.com'} />
      {result && (
        <div className="add-result">
          {result.added.length > 0 && <p className="ok">Đã thêm {result.added.length} học sinh: {result.added.join(', ')}</p>}
          {result.alreadyMember.length > 0 && <p>Đã có trong lớp: {result.alreadyMember.join(', ')}</p>}
          {result.notStudent.length > 0 && <p className="bad">Không phải tài khoản học sinh: {result.notStudent.join(', ')}</p>}
          {result.notFound.length > 0 && <p className="bad">Chưa có tài khoản: {result.notFound.join(', ')}</p>}
        </div>
      )}
      <FormError message={error} />
    </Modal>
  )
}

function submissionStatus(entry: RosterEntry, dueAt: string | null) {
  const s = entry.submission
  if (!s) return { label: 'Chưa nộp', tone: 'absent' }
  if (s.gradedAt) return { label: 'Đã chấm', tone: 'submitted' }
  if (dueAt && Date.parse(s.submittedAt) > Date.parse(dueAt)) return { label: 'Nộp muộn', tone: 'pending' }
  return { label: 'Đã nộp', tone: 'approved' }
}

type RosterFilter = 'all' | 'todo' | 'graded' | 'missing'

const rosterFilters: { key: RosterFilter; label: string; match: (r: RosterEntry) => boolean }[] = [
  { key: 'all', label: 'Tất cả', match: () => true },
  { key: 'todo', label: 'Chờ chấm', match: (r) => Boolean(r.submission && !r.submission.gradedAt) },
  { key: 'graded', label: 'Đã chấm', match: (r) => Boolean(r.submission?.gradedAt) },
  { key: 'missing', label: 'Chưa nộp', match: (r) => !r.submission },
]

function AssignmentGrading({ assignmentId, notify, onBack }: { assignmentId: string; notify: (m: string) => void; onBack: () => void }) {
  const [data, setData] = useState<AssignmentRoster | null>(null)
  const [grading, setGrading] = useState<RosterEntry | null>(null)
  const [editing, setEditing] = useState(false)
  const [filter, setFilter] = useState<RosterFilter>('all')
  const [busy, setBusy] = useState(false)

  const load = () =>
    api
      .getAssignmentRoster(assignmentId)
      .then(setData)
      .catch((err) => {
        notify(err.message)
        onBack()
      })

  useEffect(() => {
    void load()
  }, [assignmentId])

  if (!data) {
    return (
      <div className="center-wrap">
        <span className="loading-state">Đang tải bài nộp...</span>
      </div>
    )
  }

  const a = data.assignment
  const submitted = data.roster.filter((r) => r.submission)
  const graded = submitted.filter((r) => r.submission!.score !== null)
  const average = graded.length ? graded.reduce((sum, r) => sum + r.submission!.score!, 0) / graded.length : null
  const ungraded = submitted.length - graded.length
  const activeFilter = rosterFilters.find((f) => f.key === filter)!
  const visible = data.roster.filter(activeFilter.match)

  // Bài chờ chấm kế tiếp (sau học sinh đang chấm) để chấm liên tục không phải đóng/mở hộp thoại
  const nextToGrade = (current: RosterEntry) => {
    const pending = data.roster.filter((r) => r.submission && !r.submission.gradedAt && r.student.id !== current.student.id)
    const index = data.roster.findIndex((r) => r.student.id === current.student.id)
    return pending.find((r) => data.roster.indexOf(r) > index) ?? pending[0] ?? null
  }

  const togglePublish = async () => {
    const publish = !a.gradesPublished
    if (publish && ungraded > 0 && !window.confirm(`Còn ${ungraded} bài chưa chấm. Những học sinh đó sẽ thấy “chưa chấm” cho tới khi bạn chấm xong. Vẫn công bố?`)) return
    setBusy(true)
    try {
      const updated = await api.publishAssignmentGrades(a.id, publish)
      setData((prev) => prev && { ...prev, assignment: { ...prev.assignment, ...updated } })
      notify(publish ? 'Đã công bố điểm. Học sinh xem được điểm và nhận xét.' : 'Đã ẩn điểm với học sinh.')
    } catch (err: any) {
      notify(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button className="back-link" onClick={onBack}>
        <ArrowLeft size={15} /> Lớp {a.className}
      </button>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <ClipboardList size={14} /> CHẤM BÀI TẬP • {a.className.toUpperCase()}
          </div>
          <h1>{a.title}</h1>
          <p>
            {a.dueAt ? `Hạn nộp ${formatDateTime(a.dueAt)} (${dueInfo(a.dueAt).text.toLowerCase()})` : 'Không đặt hạn nộp'} • Thang điểm {formatPoints(a.maxScore)}
          </p>
        </div>
        <button className="button secondary" onClick={() => setEditing(true)}>
          <Pencil size={14} /> Sửa đề bài
        </button>
      </div>

      <section className="stats-grid">
        <Stat icon={<Users size={20} />} tone="blue" label="Đã nộp" value={`${submitted.length}/${data.roster.length}`} note="Học sinh trong lớp" />
        <Stat icon={<PenLine size={20} />} tone="amber" label="Chờ chấm" value={String(ungraded)} note="Bài đã nộp chưa có điểm" />
        <Stat icon={<Check size={20} />} tone="green" label="Đã chấm" value={String(graded.length)} note="Bài đã có điểm" />
        <Stat
          icon={<ClipboardList size={20} />}
          tone="violet"
          label="Điểm trung bình"
          value={average === null ? '—' : formatPoints(Math.round(average * 10) / 10)}
          note={`Trên thang ${formatPoints(a.maxScore)}`}
        />
      </section>

      <div className={`publish-bar ${a.gradesPublished ? 'published' : ''}`}>
        {a.gradesPublished ? <Eye size={18} /> : <EyeOff size={18} />}
        <div>
          <strong>{a.gradesPublished ? 'Điểm đã công bố cho học sinh' : 'Học sinh chưa thấy điểm'}</strong>
          <span>
            {a.gradesPublished
              ? `Công bố lúc ${a.publishedAt ? formatDateTime(a.publishedAt) : ''}. Bài chấm thêm sau sẽ hiện ngay.`
              : 'Chấm xong rồi bấm công bố, học sinh sẽ thấy điểm và nhận xét trong Bảng điểm.'}
          </span>
        </div>
        <button className={`button ${a.gradesPublished ? 'secondary' : 'primary'}`} disabled={busy} onClick={() => void togglePublish()}>
          {a.gradesPublished ? (
            <>
              <EyeOff size={14} /> Ẩn điểm
            </>
          ) : (
            <>
              <Eye size={14} /> Công bố điểm
            </>
          )}
        </button>
      </div>

      <section className="panel brief-panel">
        <div className="section-kicker">ĐỀ BÀI</div>
        {a.instructions ? <p className="pre-wrap brief-text">{a.instructions}</p> : !a.attachments.length && <p className="file-empty">Chưa có nội dung đề bài.</p>}
        <FileList attachments={a.attachments} />
      </section>

      <section className="panel students-panel">
        <div className="panel-heading">
          <div>
            <div className="section-kicker">BÀI NỘP</div>
            <h2>
              Học sinh trong lớp <span className="count-badge">{data.roster.length}</span>
            </h2>
          </div>
          <div className="segmented" role="tablist" aria-label="Lọc bài nộp">
            {rosterFilters.map((f) => (
              <button key={f.key} role="tab" aria-selected={filter === f.key} className={filter === f.key ? 'active' : ''} onClick={() => setFilter(f.key)}>
                {f.label} ({data.roster.filter(f.match).length})
              </button>
            ))}
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>HỌC SINH</th>
                <th>TRẠNG THÁI</th>
                <th>BÀI LÀM</th>
                <th>THỜI GIAN NỘP</th>
                <th>ĐIỂM</th>
                <th className="align-right">THAO TÁC</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const status = submissionStatus(r, a.dueAt)
                const i = data.roster.indexOf(r)
                return (
                  <tr key={r.student.id}>
                    <td>
                      <div className="student-cell">
                        <div className={`student-avatar avatar-${i % 5}`}>{initials(r.student.displayName)}</div>
                        <div>
                          <strong>{r.student.displayName}</strong>
                          <span>{r.student.email}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`status-pill student-status ${status.tone}`}>● {status.label}</span>
                    </td>
                    <td>
                      {r.submission ? (
                        <span className="work-cell">
                          {r.submission.attachments.length > 0 && (
                            <span className="work-files">
                              <Paperclip size={12} /> {r.submission.attachments.length} tệp
                            </span>
                          )}
                          {r.submission.content && (
                            <span className="work-text">
                              <FileText size={12} /> {r.submission.content.slice(0, 60)}
                            </span>
                          )}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="time-cell">{r.submission ? formatDateTime(r.submission.submittedAt) : '—'}</td>
                    <td className="score-cell">
                      {r.submission?.score !== null && r.submission?.score !== undefined ? `${formatPoints(r.submission.score)}/${formatPoints(a.maxScore)}` : '—'}
                    </td>
                    <td>
                      <div className="row-actions">
                        {r.submission ? (
                          <button className={r.submission.gradedAt ? 'plain-action' : 'approve-button'} onClick={() => setGrading(r)}>
                            {r.submission.gradedAt ? (
                              'Xem & sửa điểm'
                            ) : (
                              <>
                                <PenLine size={13} /> Chấm bài
                              </>
                            )}
                          </button>
                        ) : (
                          <span className="muted">Chưa có bài</span>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {data.roster.length === 0 ? (
            <EmptyState icon={<Users size={24} />} title="Lớp chưa có học sinh" detail="Thêm học sinh vào lớp để họ nhận bài tập." />
          ) : (
            visible.length === 0 && <EmptyState icon={<Check size={24} />} title={`Không có học sinh nào ở mục “${activeFilter.label}”`} detail="Chọn mục khác để xem." />
          )}
        </div>
      </section>

      {grading && grading.submission && (
        <GradeHomeworkModal
          key={grading.student.id}
          assignment={a}
          entry={grading}
          next={nextToGrade(grading)}
          onClose={() => setGrading(null)}
          onSaved={(submission, goNext) => {
            const next = goNext ? nextToGrade(grading) : null
            setData((prev) =>
              prev && {
                ...prev,
                roster: prev.roster.map((r) => (r.student.id === grading.student.id ? { ...r, submission } : r)),
              }
            )
            setGrading(next)
            notify(`Đã lưu điểm cho ${grading.student.displayName}.${next ? ` Tiếp theo: ${next.student.displayName}.` : ''}`)
          }}
        />
      )}
      {editing && (
        <AssignmentFormModal
          classId={a.classId}
          initial={a}
          onClose={() => {
            setEditing(false)
            void load()
          }}
          onSaved={(message) => {
            setEditing(false)
            notify(message)
            void load()
          }}
        />
      )}
    </>
  )
}

function GradeHomeworkModal({
  assignment,
  entry,
  next,
  onClose,
  onSaved,
}: {
  assignment: TeacherAssignment
  entry: RosterEntry
  next: RosterEntry | null
  onClose: () => void
  onSaved: (submission: NonNullable<RosterEntry['submission']>, goNext: boolean) => void
}) {
  const s = entry.submission!
  const [score, setScore] = useState(s.score === null ? '' : String(s.score))
  const [feedback, setFeedback] = useState(s.feedback ?? '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const save = async (goNext: boolean) => {
    const value = Number(score.replace(',', '.'))
    if (score.trim() === '' || Number.isNaN(value) || value < 0 || value > assignment.maxScore) {
      return setError(`Điểm phải từ 0 đến ${formatPoints(assignment.maxScore)}.`)
    }
    setSaving(true)
    setError('')
    try {
      onSaved(await api.gradeAssignment(assignment.id, entry.student.id, value, feedback.trim()), goNext)
    } catch (err: any) {
      setError(err.message)
      setSaving(false)
    }
  }

  const late = assignment.dueAt && Date.parse(s.submittedAt) > Date.parse(assignment.dueAt)
  const quickScores = [...new Set([assignment.maxScore, assignment.maxScore * 0.8, assignment.maxScore * 0.5].map((n) => Math.round(n * 4) / 4))]

  return (
    <Modal
      kicker={`CHẤM BÀI • ${assignment.title.toUpperCase()}`}
      title={entry.student.displayName}
      className="grade-hw-modal"
      onClose={onClose}
      onSubmit={() => void save(false)}
      actions={
        <>
          <button type="button" className="button secondary" onClick={onClose}>
            Hủy
          </button>
          {next && (
            <button type="button" className="button secondary" disabled={saving} onClick={() => void save(true)}>
              Lưu & chấm bài tiếp <ChevronRight size={15} />
            </button>
          )}
          <button type="submit" className="button primary" disabled={saving}>
            <Check size={15} /> {saving ? 'Đang lưu...' : 'Lưu điểm'}
          </button>
        </>
      }
    >
      <p className="modal-copy">
        {entry.student.email} • Nộp lúc {formatDateTime(s.submittedAt)}
        {late ? ' • nộp muộn' : ''}. Sau khi chấm, học sinh không sửa bài được nữa.
      </p>
      <div className="grade-hw-layout">
        <div className="grade-hw-work">
          <div className="section-kicker">BÀI LÀM</div>
          {s.content ? <div className="essay-answer">{s.content}</div> : <p className="file-empty">Học sinh không nhập phần chữ.</p>}
          {s.attachments.length > 0 && (
            <>
              <div className="section-kicker spaced">TỆP ĐÍNH KÈM • BẤM ĐỂ XEM</div>
              <FileList attachments={s.attachments} />
            </>
          )}
        </div>
        <div className="grade-hw-form">
          <label>Điểm (tối đa {formatPoints(assignment.maxScore)})</label>
          <input type="number" min={0} max={assignment.maxScore} step={0.25} value={score} onChange={(e) => setScore(e.target.value)} autoFocus />
          <div className="preset-row">
            {quickScores.map((q) => (
              <button type="button" key={q} onClick={() => setScore(String(q))}>
                {formatPoints(q)}
              </button>
            ))}
          </div>
          <label>Nhận xét cho học sinh (không bắt buộc)</label>
          <textarea className="tall" value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="Ví dụ: Lời giải đúng, cần trình bày rõ hơn ở câu 3." />
        </div>
      </div>
      <FormError message={error} />
    </Modal>
  )
}
