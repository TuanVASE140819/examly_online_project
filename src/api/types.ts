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
  // Học sinh chỉ thấy điểm khi giáo viên đã công bố
  resultsPublished: boolean
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
  // null khi còn câu tự luận chờ chấm, hoặc (với học sinh) khi điểm chưa được công bố
  score: number | null
  maxScore: number
  correctCount: number | null
  // Số câu trắc nghiệm của đề
  totalQuestions: number
  // Số câu tự luận chờ giáo viên chấm; score = null cho tới khi chấm xong
  pendingEssays: number
  reason: 'MANUAL' | 'TIMEOUT'
  submittedAt: string
  // Chỉ có trong phản hồi gửi học sinh
  resultsPublished?: boolean
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

// ===== Quản trị người dùng =====
export type UserRoleName = AuthUser['role']

export interface AdminUser {
  id: string
  email: string
  displayName: string
  role: UserRoleName
  loginMethod: 'PASSWORD' | 'GOOGLE'
  createdAt: string
  examCount: number
  // Giáo viên: số lớp đang dạy; học sinh: số lớp đang học
  classCount: number
}

export interface AdminUserList {
  users: AdminUser[]
  totals: Record<UserRoleName, number>
}

// ===== Lớp học và bài tập =====
export interface ClassSummary {
  id: string
  name: string
  description: string | null
  joinCode: string
  teacherId: string
  teacherName: string
  memberCount: number
  assignmentCount: number
  createdAt: string
}

export interface ClassMemberItem {
  id: string
  displayName: string
  email: string
  joinedAt: string
}

// Tệp PDF / Word đính kèm đề bài hoặc bài làm (nội dung tệp tải riêng qua api.downloadAttachment)
export interface AttachmentMeta {
  id: string
  fileName: string
  mimeType: string
  size: number
  createdAt: string
}

export interface TeacherAssignment {
  id: string
  classId: string
  title: string
  instructions: string
  dueAt: string | null
  maxScore: number
  gradesPublished: boolean
  publishedAt: string | null
  createdAt: string
  submittedCount: number
  gradedCount: number
  attachments: AttachmentMeta[]
}

export interface ClassDetail {
  class: ClassSummary
  members: ClassMemberItem[]
  assignments: TeacherAssignment[]
}

export interface AssignmentInput {
  title: string
  instructions: string
  dueAt: string | null
  maxScore: number
}

export interface AddMembersResult {
  added: string[]
  alreadyMember: string[]
  notStudent: string[]
  notFound: string[]
}

export interface TeacherSubmission {
  content: string
  attachments: AttachmentMeta[]
  submittedAt: string
  score: number | null
  feedback: string | null
  gradedAt: string | null
}

export interface RosterEntry {
  student: { id: string; displayName: string; email: string }
  submission: TeacherSubmission | null
}

export interface AssignmentRoster {
  assignment: TeacherAssignment & { className: string }
  roster: RosterEntry[]
}

export interface StudentAssignment {
  id: string
  classId: string
  className: string
  title: string
  instructions: string
  dueAt: string | null
  maxScore: number
  gradesPublished: boolean
  createdAt: string
  attachments: AttachmentMeta[]
  submission: {
    content: string
    attachments: AttachmentMeta[]
    submittedAt: string
    late: boolean
    // Giáo viên đã chấm nên không sửa được nữa
    locked: boolean
    score: number | null
    feedback: string | null
  } | null
}

export interface ExamGrade {
  examId: string
  title: string
  teacherName: string
  className: string
  date: string | null
  status: 'ABSENT' | 'UNPUBLISHED' | 'PENDING_GRADING' | 'PUBLISHED'
  score: number | null
  maxScore: number
  correctCount: number | null
  totalQuestions: number | null
}

export interface HomeworkGrade {
  assignmentId: string
  title: string
  className: string
  dueAt: string | null
  submittedAt: string | null
  status: 'UNPUBLISHED' | 'NOT_SUBMITTED' | 'UNGRADED' | 'PUBLISHED'
  score: number | null
  maxScore: number
  feedback: string | null
}

export interface StudentGrades {
  exams: ExamGrade[]
  homework: HomeworkGrade[]
}
