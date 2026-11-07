import { useEffect, useState } from 'react'
import { Award, BookOpenCheck, ClipboardList, Hourglass, RefreshCw, Sparkles } from 'lucide-react'
import { api } from '../api/client'
import type { ExamGrade, HomeworkGrade, StudentGrades as Grades } from '../api/types'
import { EmptyState, Stat } from '../components/common'
import { formatDate, formatPoints, formatScore } from '../lib/format'

const examStatus: Record<ExamGrade['status'], { label: string; tone: string }> = {
  PUBLISHED: { label: 'Đã công bố', tone: 'submitted' },
  UNPUBLISHED: { label: 'Chờ công bố', tone: 'pending' },
  PENDING_GRADING: { label: 'Đang chấm tự luận', tone: 'in_progress' },
  ABSENT: { label: 'Vắng thi', tone: 'absent' },
}

const homeworkStatus: Record<HomeworkGrade['status'], { label: string; tone: string }> = {
  PUBLISHED: { label: 'Đã công bố', tone: 'submitted' },
  UNPUBLISHED: { label: 'Chờ công bố', tone: 'pending' },
  UNGRADED: { label: 'Chưa chấm', tone: 'in_progress' },
  NOT_SUBMITTED: { label: 'Không nộp', tone: 'rejected' },
}

// Điểm trung bình quy về thang 10 của các bài đã có điểm công bố
function average(items: { score: number | null; maxScore: number }[]) {
  const scored = items.filter((i) => i.score !== null)
  if (!scored.length) return null
  return scored.reduce((sum, i) => sum + (i.score! / i.maxScore) * 10, 0) / scored.length
}

export function StudentGrades({ notify }: { notify: (message: string) => void }) {
  const [grades, setGrades] = useState<Grades | null>(null)
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      setGrades(await api.myGrades())
    } catch (err: any) {
      notify(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  if (!grades) {
    return (
      <div className="center-wrap">
        <span className="loading-state">Đang tải bảng điểm...</span>
      </div>
    )
  }

  const examAvg = average(grades.exams)
  const homeworkAvg = average(grades.homework)
  const waiting = grades.exams.filter((e) => e.status === 'UNPUBLISHED' || e.status === 'PENDING_GRADING').length +
    grades.homework.filter((h) => h.status === 'UNPUBLISHED' && h.submittedAt).length

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <Sparkles size={14} /> KẾT QUẢ HỌC TẬP
          </div>
          <h1>Bảng điểm</h1>
          <p>Điểm bài kiểm tra và bài tập về nhà hiện ở đây sau khi giáo viên công bố.</p>
        </div>
        <button className="button secondary" disabled={loading} onClick={() => void load()}>
          <RefreshCw size={14} className={loading ? 'spin' : ''} /> Làm mới
        </button>
      </div>

      <section className="stats-grid">
        <Stat
          icon={<BookOpenCheck size={20} />}
          tone="blue"
          label="TB bài kiểm tra"
          value={examAvg === null ? '—' : formatScore(Math.round(examAvg * 10) / 10)}
          note={`${grades.exams.filter((e) => e.score !== null).length} bài đã công bố • thang 10`}
        />
        <Stat
          icon={<ClipboardList size={20} />}
          tone="violet"
          label="TB bài tập về nhà"
          value={homeworkAvg === null ? '—' : formatScore(Math.round(homeworkAvg * 10) / 10)}
          note={`${grades.homework.filter((h) => h.score !== null).length} bài đã công bố • quy về thang 10`}
        />
        <Stat icon={<Hourglass size={20} />} tone="amber" label="Chờ công bố" value={String(waiting)} note="Bài đã làm, chưa có điểm" />
        <Stat
          icon={<Award size={20} />}
          tone="green"
          label="Tổng số bài"
          value={String(grades.exams.length + grades.homework.length)}
          note={`${grades.exams.length} bài kiểm tra • ${grades.homework.length} bài tập`}
        />
      </section>

      <section className="panel students-panel grades-panel">
        <div className="panel-heading">
          <div>
            <div className="section-kicker">PHÒNG THI</div>
            <h2>
              Điểm kiểm tra <span className="count-badge">{grades.exams.length}</span>
            </h2>
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>BÀI KIỂM TRA</th>
                <th>NGÀY</th>
                <th>TRẠNG THÁI</th>
                <th>TRẮC NGHIỆM ĐÚNG</th>
                <th className="align-right">ĐIỂM</th>
              </tr>
            </thead>
            <tbody>
              {grades.exams.map((e) => (
                <tr key={e.examId}>
                  <td>
                    <div className="stacked-cell">
                      <strong>{e.title}</strong>
                      <span>
                        GV {e.teacherName} • Lớp {e.className}
                      </span>
                    </div>
                  </td>
                  <td className="time-cell">{e.date ? formatDate(e.date) : '—'}</td>
                  <td>
                    <span className={`status-pill student-status ${examStatus[e.status].tone}`}>● {examStatus[e.status].label}</span>
                  </td>
                  <td>{e.correctCount !== null && e.totalQuestions ? `${e.correctCount}/${e.totalQuestions}` : '—'}</td>
                  <td className="score-cell align-right">{e.score !== null ? `${formatScore(e.score)}/${e.maxScore}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {grades.exams.length === 0 && (
            <EmptyState icon={<BookOpenCheck size={24} />} title="Chưa có bài kiểm tra" detail="Bài thi bạn đã nộp sẽ hiện ở đây, điểm có khi giáo viên công bố." />
          )}
        </div>
      </section>

      <section className="panel students-panel grades-panel">
        <div className="panel-heading">
          <div>
            <div className="section-kicker">LỚP HỌC</div>
            <h2>
              Điểm bài tập về nhà <span className="count-badge">{grades.homework.length}</span>
            </h2>
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>BÀI TẬP</th>
                <th>HẠN NỘP</th>
                <th>TRẠNG THÁI</th>
                <th>NHẬN XÉT</th>
                <th className="align-right">ĐIỂM</th>
              </tr>
            </thead>
            <tbody>
              {grades.homework.map((h) => (
                <tr key={h.assignmentId}>
                  <td>
                    <div className="stacked-cell">
                      <strong>{h.title}</strong>
                      <span>Lớp {h.className}</span>
                    </div>
                  </td>
                  <td className="time-cell">{h.dueAt ? formatDate(h.dueAt) : '—'}</td>
                  <td>
                    {h.status === 'UNPUBLISHED' && !h.submittedAt ? (
                      <span className="status-pill student-status absent">● Chưa nộp</span>
                    ) : (
                      <span className={`status-pill student-status ${homeworkStatus[h.status].tone}`}>● {homeworkStatus[h.status].label}</span>
                    )}
                  </td>
                  <td className="feedback-cell">{h.feedback || '—'}</td>
                  <td className="score-cell align-right">{h.score !== null ? `${formatPoints(h.score)}/${formatPoints(h.maxScore)}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {grades.homework.length === 0 && (
            <EmptyState icon={<ClipboardList size={24} />} title="Chưa có bài tập" detail="Vào lớp bằng mã lớp ở mục Lớp học & bài tập để nhận bài tập." />
          )}
        </div>
      </section>
    </>
  )
}
