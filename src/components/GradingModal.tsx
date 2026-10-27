import { useEffect, useState } from 'react'
import { CheckCircle2, PenLine, ShieldAlert, X, XCircle } from 'lucide-react'
import { api } from '../api/client'
import type { GradingQuestion, ParticipantSubmissionDetail, Student, SubmissionResult } from '../api/types'
import { formatPoints, formatScore } from '../lib/format'

interface Props {
  examId: string
  student: Student
  notify: (message: string) => void
  onClose: () => void
  onGraded: (participantId: string, submission: SubmissionResult) => void
}

// Giáo viên xem bài làm của một thí sinh: trắc nghiệm đã chấm tự động, tự luận nhập điểm từng câu
export function GradingModal({ examId, student, notify, onClose, onGraded }: Props) {
  const [detail, setDetail] = useState<ParticipantSubmissionDetail | null>(null)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api
      .getParticipantSubmission(examId, student.id)
      .then((d) => {
        setDetail(d)
        const initial: Record<string, string> = {}
        for (const q of d.questions) {
          if (q.answer?.awardedPoints !== null && q.answer?.awardedPoints !== undefined) initial[q.id] = String(q.answer.awardedPoints)
        }
        setDrafts(initial)
      })
      .catch((err) => setError(err.message))
  }, [examId, student.id])

  const saveGrade = async (question: GradingQuestion, index: number) => {
    const points = Number((drafts[question.id] ?? '').replace(',', '.'))
    if (drafts[question.id] === undefined || drafts[question.id] === '' || !(points >= 0 && points <= question.points)) {
      notify(`Điểm câu ${index + 1} phải từ 0 đến ${formatPoints(question.points)}.`)
      return
    }
    setSavingId(question.id)
    try {
      const submission = await api.gradeEssay(examId, student.id, question.id, points)
      setDetail((prev) =>
        prev && {
          ...prev,
          submission,
          questions: prev.questions.map((q) => (q.id === question.id && q.answer ? { ...q, answer: { ...q.answer, awardedPoints: points } } : q)),
        }
      )
      onGraded(student.id, submission)
      notify(
        submission.pendingEssays
          ? `Đã lưu điểm câu ${index + 1}. Còn ${submission.pendingEssays} câu tự luận chưa chấm.`
          : `Đã chấm xong bài của ${student.name}: ${formatScore(submission.score)}/10.`
      )
    } catch (err: any) {
      notify(err.message)
    } finally {
      setSavingId(null)
    }
  }

  const submission = detail?.submission

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="modal grading-modal">
        <div className="modal-heading">
          <div>
            <div className="section-kicker">BÀI LÀM CỦA THÍ SINH</div>
            <h2>{student.name}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <p className="modal-copy">
          Lớp {student.className}
          {submission &&
            (submission.pendingEssays
              ? ` • Còn ${submission.pendingEssays} câu tự luận chưa chấm — điểm tổng sẽ có khi chấm xong.`
              : ` • Điểm chính thức: ${formatScore(submission.score)}/10.`)}
        </p>

        {error && (
          <div className="error-message">
            <ShieldAlert size={15} />
            {error}
          </div>
        )}
        {!detail && !error && <span className="loading-state">Đang tải bài làm...</span>}

        {detail && (
          <ol className="question-list">
            {detail.questions.map((q, i) => (
              <li key={q.id} className="question-item">
                <div className="question-item-head">
                  <span className="question-number">CÂU {i + 1}</span>
                  {q.type === 'ESSAY' && <span className="type-chip">Tự luận</span>}
                  <span className="points-chip">{formatPoints(q.points)} điểm</span>
                </div>
                <p>{q.text}</p>
                {q.type === 'ESSAY' ? (
                  <EssayAnswer
                    question={q}
                    draft={drafts[q.id] ?? ''}
                    saving={savingId === q.id}
                    onDraft={(value) => setDrafts((prev) => ({ ...prev, [q.id]: value }))}
                    onSave={() => void saveGrade(q, i)}
                  />
                ) : (
                  <ul className="question-options">
                    {q.options.map((o, j) => {
                      const chosen = q.answer?.selectedOptionId === o.id
                      return (
                        <li key={o.id} className={`${o.isCorrect ? 'correct' : ''} ${chosen && !o.isCorrect ? 'wrong' : ''}`}>
                          <span className="option-letter">{String.fromCharCode(65 + j)}</span>
                          <span>
                            {o.text}
                            {chosen && <em className="chosen-label"> — học sinh chọn</em>}
                          </span>
                          {o.isCorrect ? <CheckCircle2 size={15} /> : chosen && <XCircle size={15} />}
                        </li>
                      )
                    })}
                  </ul>
                )}
                {q.type === 'MULTIPLE_CHOICE' && !q.answer?.selectedOptionId && <p className="essay-note">Học sinh bỏ trống câu này.</p>}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}

function EssayAnswer({
  question,
  draft,
  saving,
  onDraft,
  onSave,
}: {
  question: GradingQuestion
  draft: string
  saving: boolean
  onDraft: (value: string) => void
  onSave: () => void
}) {
  const text = question.answer?.textAnswer?.trim()
  if (!text) return <p className="essay-note">Học sinh bỏ trống câu này (0 điểm).</p>

  const graded = question.answer?.awardedPoints !== null && question.answer?.awardedPoints !== undefined
  return (
    <>
      <div className="essay-answer">{question.answer!.textAnswer}</div>
      <form
        className="grade-row"
        onSubmit={(e) => {
          e.preventDefault()
          onSave()
        }}
      >
        <label>Điểm</label>
        <input type="number" min={0} max={question.points} step={0.25} value={draft} onChange={(e) => onDraft(e.target.value)} />
        <span>/ {formatPoints(question.points)}</span>
        <button type="submit" className="button primary small-button" disabled={saving}>
          <PenLine size={14} /> {saving ? 'Đang lưu...' : graded ? 'Cập nhật điểm' : 'Lưu điểm'}
        </button>
        <span className={`grade-status ${graded ? 'graded' : ''}`}>{graded ? 'Đã chấm' : 'Chưa chấm'}</span>
      </form>
    </>
  )
}
