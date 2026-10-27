export type Role = 'teacher' | 'student'
export type StudentStatus = 'pending' | 'approved' | 'in_progress' | 'rejected' | 'submitted' | 'absent'
export type ExamStatus = 'draft' | 'waiting' | 'scheduled' | 'active' | 'ended' | 'cancelled'
export type QuestionType = 'MULTIPLE_CHOICE' | 'ESSAY'

export interface Student {
  id: string
  name: string
  className: string
  status: StudentStatus
  joinedAt: string
  tabWarnings: number
  score?: number
  // Số câu tự luận chờ chấm (điểm chưa chính thức khi > 0)
  pendingEssays?: number
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
  type: QuestionType
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
  type: QuestionType
  topic: string
  prompt: string
  points: number
  // Câu tự luận để mảng rỗng
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
  // Số câu trắc nghiệm của đề
  totalQuestions: number
  // Số câu tự luận chờ giáo viên chấm; score = null cho tới khi chấm xong
  pendingEssays: number
  reason: 'MANUAL' | 'TIMEOUT'
  submittedAt: string
}

export interface CurrentSubmissionState {
  submitted: boolean
  submission: SubmissionResult | null
  answers: Record<string, string | null>
  textAnswers: Record<string, string>
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

// Bài làm của một thí sinh dành cho giáo viên xem và chấm tự luận
export interface GradingQuestion extends TeacherQuestion {
  answer: { selectedOptionId: string | null; textAnswer: string | null; awardedPoints: number | null } | null
}

export interface ParticipantSubmissionDetail {
  participant: { id: string; name: string; className: string; status: StudentStatus }
  submission: SubmissionResult | null
  questions: GradingQuestion[]
}
