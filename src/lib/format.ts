import type { AuthUser, ExamStatus, StudentStatus } from '../api/types'

export const statusLabels: Record<StudentStatus, string> = {
  pending: 'Chờ duyệt',
  approved: 'Đã duyệt',
  in_progress: 'Đang làm bài',
  rejected: 'Từ chối',
  submitted: 'Đã nộp bài',
  absent: 'Vắng thi',
}

export const examStatusLabels: Record<ExamStatus, string> = {
  draft: 'Bản nháp',
  waiting: 'Đang chờ',
  scheduled: 'Đã lên lịch',
  active: 'Đang diễn ra',
  ended: 'Đã kết thúc',
  cancelled: 'Đã hủy',
}

export const roleLabels: Record<AuthUser['role'], string> = {
  TEACHER: 'Giáo viên',
  ADMIN: 'Quản trị viên',
  STUDENT: 'Học sinh',
}

export const initials = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(-2)
    .map((x) => x[0])
    .join('')
    .toUpperCase()

// 125 -> "02:05"
export const formatCountdown = (totalSeconds: number) => {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

export const formatTime = (value: string | number | Date) =>
  new Date(value).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })

// Số điểm của một câu (có thể lẻ 0.25, 0.5...)
export const formatPoints = (points: number) => String(Math.round(points * 100) / 100)

export const formatScore = (score: number | null | undefined) =>
  score === null || score === undefined ? '—' : Number.isInteger(score) ? String(score) : score.toFixed(1)
