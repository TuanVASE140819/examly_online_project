export type Role = 'teacher' | 'student'
export type StudentStatus = 'pending' | 'approved' | 'in_progress' | 'rejected' | 'submitted' | 'absent'
export type ExamStatus = 'draft' | 'waiting' | 'scheduled' | 'active' | 'ended' | 'cancelled'

export interface Student {
  id: string
  name: string
  className: string
  status: StudentStatus
  joinedAt: string
  tabWarnings: number
  score?: number
}

export interface Room {
  id: string
  name: string
  code: string
  duration: number
  status: ExamStatus
  createdAt: string
  startsAt?: string | null
  endsAt?: string | null
  questionCount: number
  participantCount: number
  // false: chỉ học sinh cùng mạng với giáo viên mới tham gia được
  allowExternalNetwork: boolean
  // IP của giáo viên được ghi nhận lúc khóa mạng
  teacherNetworkIp: string | null
}

export interface OptionItem {
  id: string
  text: string
  position: number
}

export interface QuestionItem {
  id: string
  topic: string
  text: string
  points: number
  position: number
  options: OptionItem[]
}

export interface TeacherOption extends OptionItem {
  isCorrect: boolean
}

export interface TeacherQuestion extends Omit<QuestionItem, 'options'> {
  options: TeacherOption[]
}

export interface NewQuestionInput {
  topic: string
  prompt: string
  points: number
  options: { text: string; isCorrect: boolean; position: number }[]
}

export interface AuthUser {
  id: string
  email: string
  displayName: string
  role: 'TEACHER' | 'ADMIN' | 'STUDENT'
}

export interface SubmissionResult {
  score: number | null
  maxScore: number
  correctCount: number
  totalQuestions: number
  reason: 'MANUAL' | 'TIMEOUT'
  submittedAt: string
}

export interface CurrentSubmissionState {
  submitted: boolean
  submission: SubmissionResult | null
  answers: Record<string, string | null>
  secondsRemaining: number
  examStatus: string
}

// Phiên tham gia thi của học sinh (đồng bộ từ /exams/my-status)
export interface StudentSession {
  participantId: string
  displayName: string
  className: string
  status: StudentStatus
  tabWarnings: number
  score?: number
  examId: string
  examTitle: string
  joinCode: string
  examStatus: ExamStatus
  durationMinutes: number
}
