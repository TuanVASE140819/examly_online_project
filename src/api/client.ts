import type {
  AddMembersResult,
  AdminUser,
  AdminUserList,
  AssignmentInput,
  AssignmentRoster,
  AttachmentMeta,
  AuthUser,
  ClassDetail,
  ClassSummary,
  CurrentSubmissionState,
  StudentAssignment,
  StudentGrades,
  TeacherAssignment,
  TeacherSubmission,
  UserRoleName,
  ExamStatus,
  NewQuestionInput,
  ParticipantSubmissionDetail,
  QuestionItem,
  Room,
  Student,
  StudentSession,
  StudentStatus,
  SubmissionResult,
  TeacherQuestion,
} from './types'

// Mặc định gọi API cùng địa chỉ với trang web (qua proxy) để máy khác trong mạng cũng dùng được
const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api/v1'

// Chuẩn hóa trạng thái thí sinh từ backend (APPROVED, IN_PROGRESS, ...) về trạng thái hiển thị
export function toStudentStatus(raw: string | undefined): StudentStatus {
  switch (raw?.toUpperCase()) {
    case 'APPROVED':
      return 'approved'
    case 'IN_PROGRESS':
      return 'in_progress'
    case 'REJECTED':
      return 'rejected'
    case 'SUBMITTED':
      return 'submitted'
    case 'ABSENT':
      return 'absent'
    default:
      return 'pending'
  }
}

function toExamStatus(raw: string): ExamStatus {
  return raw.toLowerCase() as ExamStatus
}

function mapExam(e: any): Room {
  return {
    id: e.id,
    name: e.title,
    code: e.joinCode,
    duration: e.durationMinutes ?? Math.round(e.durationSeconds / 60),
    status: toExamStatus(e.status),
    createdAt: e.createdAt,
    startsAt: e.startsAt,
    endsAt: e.endsAt,
    questionCount: e.questionCount ?? 0,
    participantCount: e.participantCount ?? 0,
    allowExternalNetwork: e.allowExternalNetwork ?? true,
    teacherNetworkIp: e.teacherNetworkIp ?? null,
    resultsPublished: e.resultsPublished ?? false,
  }
}

function mapTeacherQuestion(q: any): TeacherQuestion {
  return {
    id: q.id,
    type: q.type ?? 'MULTIPLE_CHOICE',
    topic: q.topic,
    text: q.prompt,
    points: q.points,
    position: q.position,
    options: q.options.map((o: any) => ({ id: o.id, text: o.text, position: o.position, isCorrect: o.isCorrect })),
  }
}

export class ApiError extends Error {
  constructor(message: string, public status?: number, public code?: string) {
    super(message)
  }
}

class ApiClient {
  // authToken: phiên đăng nhập tài khoản (giáo viên / học sinh)
  // participantToken: phiên làm bài của thí sinh trong một kỳ thi cụ thể
  private authToken: string | null = null
  private participantToken: string | null = null
  private onUnauthorized: (() => void) | null = null

  constructor() {
    this.authToken = localStorage.getItem('examly_auth_token')
    this.participantToken = localStorage.getItem('examly_participant_token')
  }

  setAuthToken(token: string | null) {
    this.authToken = token
    if (token) localStorage.setItem('examly_auth_token', token)
    else localStorage.removeItem('examly_auth_token')
  }

  getAuthToken(): string | null {
    return this.authToken
  }

  setParticipantToken(token: string | null) {
    this.participantToken = token
    if (token) localStorage.setItem('examly_participant_token', token)
    else localStorage.removeItem('examly_participant_token')
  }

  getParticipantToken(): string | null {
    return this.participantToken
  }

  // Gọi khi phiên đăng nhập hết hạn để giao diện quay về màn hình đăng nhập
  setUnauthorizedHandler(handler: (() => void) | null) {
    this.onUnauthorized = handler
  }

  logout() {
    this.setAuthToken(null)
    this.setParticipantToken(null)
  }

  private async request<T>(endpoint: string, options: RequestInit = {}, auth?: 'user' | 'participant'): Promise<T> {
    const headers = new Headers(options.headers || {})
    if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json')
    }

    const token = auth === 'user' ? this.authToken : auth === 'participant' ? this.participantToken : null
    if (token) {
      headers.set('Authorization', `Bearer ${token}`)
    }

    let res: Response
    try {
      res = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers,
      })
    } catch {
      throw new ApiError('Không thể kết nối máy chủ. Vui lòng kiểm tra kết nối mạng hoặc backend.')
    }

    const data = await res.json().catch(() => null)

    if (!res.ok) {
      if (res.status === 401 && auth === 'user') {
        this.onUnauthorized?.()
      }
      throw new ApiError(data?.message || data?.error || `Lỗi máy chủ (HTTP ${res.status})`, res.status, data?.error)
    }

    return data as T
  }

  // Tải tệp lên dạng nhị phân thô (một tệp mỗi yêu cầu), tên tệp gửi qua ?name=
  private async uploadFile<T>(endpoint: string, file: File): Promise<T> {
    const sep = endpoint.includes('?') ? '&' : '?'
    return this.request<T>(
      `${endpoint}${sep}name=${encodeURIComponent(file.name)}`,
      { method: 'POST', body: file, headers: { 'Content-Type': file.type || 'application/octet-stream' } },
      'user'
    )
  }

  // Tệp đính kèm cần token đăng nhập nên không mở bằng đường dẫn trực tiếp được; tải về dạng Blob
  async downloadAttachment(attachmentId: string): Promise<Blob> {
    let res: Response
    try {
      res = await fetch(`${API_BASE}/attachments/${attachmentId}`, {
        headers: this.authToken ? { Authorization: `Bearer ${this.authToken}` } : {},
      })
    } catch {
      throw new ApiError('Không thể kết nối máy chủ để tải tệp.')
    }
    if (!res.ok) {
      const data = await res.json().catch(() => null)
      if (res.status === 401) this.onUnauthorized?.()
      throw new ApiError(data?.message || `Không tải được tệp (HTTP ${res.status})`, res.status, data?.error)
    }
    return res.blob()
  }

  // Health
  async checkHealth(): Promise<boolean> {
    try {
      const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(2000) })
      return res.ok
    } catch {
      return false
    }
  }

  // Auth
  async login(email: string, password: string): Promise<AuthUser> {
    const data = await this.request<{ token: string; user: AuthUser }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
    this.setAuthToken(data.token)
    return data.user
  }

  async register(input: { email: string; password: string; displayName: string; role: 'TEACHER' | 'STUDENT' }): Promise<AuthUser> {
    const data = await this.request<{ token: string; user: AuthUser }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
    })
    this.setAuthToken(data.token)
    return data.user
  }

  // role chỉ dùng khi tài khoản Google chưa có trên hệ thống (tạo mới)
  async loginWithGoogle(idToken: string, role?: 'TEACHER' | 'STUDENT'): Promise<AuthUser> {
    const data = await this.request<{ token: string; user: AuthUser }>('/auth/google', {
      method: 'POST',
      body: JSON.stringify({ idToken, role }),
    })
    this.setAuthToken(data.token)
    return data.user
  }

  async getMe(): Promise<AuthUser> {
    const res = await this.request<{ user: AuthUser }>('/auth/me', {}, 'user')
    return res.user
  }

  // Exams (Teacher)
  async createExam(title: string, durationMinutes: number): Promise<Room> {
    const res = await this.request<{ exam: any }>('/exams', {
      method: 'POST',
      body: JSON.stringify({ title, durationMinutes }),
    }, 'user')
    return mapExam(res.exam)
  }

  async listExams(): Promise<Room[]> {
    const res = await this.request<{ exams: any[] }>('/exams', {}, 'user')
    return res.exams.map(mapExam)
  }

  async startExam(examId: string): Promise<Room> {
    const res = await this.request<{ exam: any }>(`/exams/${examId}/start`, { method: 'POST' }, 'user')
    return mapExam(res.exam)
  }

  async finishExam(examId: string): Promise<Room> {
    const res = await this.request<{ exam: any }>(`/exams/${examId}/finish`, { method: 'POST' }, 'user')
    return mapExam(res.exam)
  }

  // Công bố (true) hoặc ẩn lại (false) điểm bài kiểm tra cho học sinh
  async publishExamResults(examId: string, published: boolean): Promise<boolean> {
    const res = await this.request<{ exam: { resultsPublished: boolean } }>(`/exams/${examId}/results`, {
      method: 'POST',
      body: JSON.stringify({ published }),
    }, 'user')
    return res.exam.resultsPublished
  }

  async setNetworkPolicy(examId: string, allowExternalNetwork: boolean): Promise<Pick<Room, 'allowExternalNetwork' | 'teacherNetworkIp'>> {
    const res = await this.request<{ exam: { allowExternalNetwork: boolean; teacherNetworkIp: string | null } }>(`/exams/${examId}/network`, {
      method: 'PATCH',
      body: JSON.stringify({ allowExternalNetwork }),
    }, 'user')
    return { allowExternalNetwork: res.exam.allowExternalNetwork, teacherNetworkIp: res.exam.teacherNetworkIp }
  }

  async getParticipants(examId: string): Promise<Student[]> {
    const res = await this.request<{ participants: any[] }>(`/exams/${examId}/participants`, {}, 'user')
    return res.participants.map((p) => ({
      id: p.id,
      name: p.name,
      className: p.className,
      status: toStudentStatus(p.rawStatus ?? p.status),
      joinedAt: p.joinedAt,
      tabWarnings: p.tabWarnings,
      score: p.score,
      pendingEssays: p.pendingEssays ?? 0,
    }))
  }

  async decideParticipant(examId: string, participantId: string, decision: 'APPROVED' | 'REJECTED' | 'PENDING'): Promise<void> {
    await this.request(`/exams/${examId}/participants/${participantId}/decision`, {
      method: 'POST',
      body: JSON.stringify({ decision }),
    }, 'user')
  }

  // Questions (Teacher)
  // Chấm bài (giáo viên)
  async getParticipantSubmission(examId: string, participantId: string): Promise<ParticipantSubmissionDetail> {
    const res = await this.request<any>(`/exams/${examId}/participants/${participantId}/submission`, {}, 'user')
    return {
      participant: { ...res.participant, status: toStudentStatus(res.participant.status) },
      submission: res.submission,
      questions: res.questions.map((q: any) => ({ ...mapTeacherQuestion(q), answer: q.answer })),
    }
  }

  async gradeEssay(examId: string, participantId: string, questionId: string, points: number): Promise<SubmissionResult> {
    const res = await this.request<{ submission: SubmissionResult }>(
      `/exams/${examId}/participants/${participantId}/answers/${questionId}/grade`,
      { method: 'PUT', body: JSON.stringify({ points }) },
      'user'
    )
    return res.submission
  }

  async getTeacherQuestions(examId: string): Promise<TeacherQuestion[]> {
    const res = await this.request<{ questions: any[] }>(`/exams/${examId}/questions`, {}, 'user')
    return res.questions.map(mapTeacherQuestion)
  }

  async createQuestion(examId: string, input: NewQuestionInput): Promise<TeacherQuestion> {
    const res = await this.request<{ question: any }>(`/exams/${examId}/questions`, {
      method: 'POST',
      body: JSON.stringify(input),
    }, 'user')
    return mapTeacherQuestion(res.question)
  }

  async importQuestions(examId: string, questions: NewQuestionInput[], replace: boolean): Promise<TeacherQuestion[]> {
    const res = await this.request<{ questions: any[] }>(`/exams/${examId}/questions/import`, {
      method: 'POST',
      body: JSON.stringify({ questions, replace }),
    }, 'user')
    return res.questions.map(mapTeacherQuestion)
  }

  async deleteQuestion(examId: string, questionId: string): Promise<void> {
    await this.request(`/exams/${examId}/questions/${questionId}`, { method: 'DELETE' }, 'user')
  }

  // Student participation (họ tên lấy từ tài khoản học sinh đang đăng nhập)
  async joinExam(joinCode: string, className: string): Promise<void> {
    const res = await this.request<{ participantToken: string }>('/exams/join', {
      method: 'POST',
      body: JSON.stringify({ joinCode, className }),
    }, 'user')
    this.setParticipantToken(res.participantToken)
  }

  async getStudentSession(): Promise<StudentSession> {
    const { participant: p, exam: e } = await this.request<{ participant: any; exam: any }>('/exams/my-status', {}, 'participant')
    return {
      participantId: p.id,
      displayName: p.displayName,
      className: p.className,
      status: toStudentStatus(p.status),
      tabWarnings: p.tabWarnings ?? 0,
      score: p.score ?? undefined,
      examId: e.id,
      examTitle: e.title,
      joinCode: e.joinCode,
      examStatus: toExamStatus(e.status),
      durationMinutes: Math.round(e.durationSeconds / 60),
    }
  }

  async getStudentQuestions(examId: string): Promise<QuestionItem[]> {
    const res = await this.request<{ questions: QuestionItem[] }>(`/exams/${examId}/student-questions`, {}, 'participant')
    return res.questions
  }

  async getCurrentSubmission(): Promise<CurrentSubmissionState> {
    return this.request<CurrentSubmissionState>('/submissions/current', {}, 'participant')
  }

  async saveAnswer(questionId: string, selectedOptionId: string | null): Promise<void> {
    await this.request(`/submissions/current/answers/${questionId}`, {
      method: 'PUT',
      body: JSON.stringify({ selectedOptionId }),
    }, 'participant')
  }

  async saveTextAnswer(questionId: string, textAnswer: string): Promise<void> {
    await this.request(`/submissions/current/answers/${questionId}`, {
      method: 'PUT',
      body: JSON.stringify({ textAnswer }),
    }, 'participant')
  }

  async submitExam(reason: 'MANUAL' | 'TIMEOUT' = 'MANUAL'): Promise<SubmissionResult> {
    const res = await this.request<{ submission: SubmissionResult }>('/submissions/current/submit', {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }, 'participant')
    return res.submission
  }

  async sendProctoringEvent(eventType: 'TAB_HIDDEN' | 'TAB_VISIBLE' | 'DEVTOOLS_OPEN', metadata?: Record<string, unknown>): Promise<{ tabWarnings?: number }> {
    return this.request<{ tabWarnings?: number }>('/proctoring/events', {
      method: 'POST',
      body: JSON.stringify({ eventType, metadata }),
    }, 'participant')
  }

  // ===== Quản trị viên: người dùng =====
  async listUsers(filter: { role?: UserRoleName; q?: string } = {}): Promise<AdminUserList> {
    const params = new URLSearchParams()
    if (filter.role) params.set('role', filter.role)
    if (filter.q) params.set('q', filter.q)
    const qs = params.toString()
    return this.request<AdminUserList>(`/admin/users${qs ? `?${qs}` : ''}`, {}, 'user')
  }

  async createUser(input: { email: string; displayName: string; role: UserRoleName; password?: string }): Promise<AdminUser> {
    const res = await this.request<{ user: AdminUser }>('/admin/users', { method: 'POST', body: JSON.stringify(input) }, 'user')
    return res.user
  }

  async updateUser(userId: string, input: { displayName?: string; role?: UserRoleName; password?: string }): Promise<AdminUser> {
    const res = await this.request<{ user: AdminUser }>(`/admin/users/${userId}`, { method: 'PATCH', body: JSON.stringify(input) }, 'user')
    return res.user
  }

  async deleteUser(userId: string): Promise<void> {
    await this.request(`/admin/users/${userId}`, { method: 'DELETE' }, 'user')
  }

  // ===== Giáo viên: lớp học =====
  async listClasses(): Promise<ClassSummary[]> {
    const res = await this.request<{ classes: ClassSummary[] }>('/classes', {}, 'user')
    return res.classes
  }

  async createClass(input: { name: string; description?: string }): Promise<ClassSummary> {
    const res = await this.request<{ class: ClassSummary }>('/classes', { method: 'POST', body: JSON.stringify(input) }, 'user')
    return res.class
  }

  async updateClass(classId: string, input: { name: string; description?: string }): Promise<ClassSummary> {
    const res = await this.request<{ class: ClassSummary }>(`/classes/${classId}`, { method: 'PATCH', body: JSON.stringify(input) }, 'user')
    return res.class
  }

  async deleteClass(classId: string): Promise<void> {
    await this.request(`/classes/${classId}`, { method: 'DELETE' }, 'user')
  }

  async getClass(classId: string): Promise<ClassDetail> {
    return this.request<ClassDetail>(`/classes/${classId}`, {}, 'user')
  }

  async addClassMembers(classId: string, emails: string[]): Promise<AddMembersResult> {
    return this.request<AddMembersResult>(`/classes/${classId}/members`, { method: 'POST', body: JSON.stringify({ emails }) }, 'user')
  }

  async removeClassMember(classId: string, studentId: string): Promise<void> {
    await this.request(`/classes/${classId}/members/${studentId}`, { method: 'DELETE' }, 'user')
  }

  // ===== Giáo viên: bài tập =====
  async createAssignment(classId: string, input: AssignmentInput): Promise<TeacherAssignment> {
    const res = await this.request<{ assignment: TeacherAssignment }>(
      `/classes/${classId}/assignments`,
      { method: 'POST', body: JSON.stringify(input) },
      'user'
    )
    return res.assignment
  }

  async updateAssignment(assignmentId: string, input: Partial<AssignmentInput>): Promise<TeacherAssignment> {
    const res = await this.request<{ assignment: TeacherAssignment }>(
      `/assignments/${assignmentId}`,
      { method: 'PATCH', body: JSON.stringify(input) },
      'user'
    )
    return res.assignment
  }

  async deleteAssignment(assignmentId: string): Promise<void> {
    await this.request(`/assignments/${assignmentId}`, { method: 'DELETE' }, 'user')
  }

  async getAssignmentRoster(assignmentId: string): Promise<AssignmentRoster> {
    return this.request<AssignmentRoster>(`/assignments/${assignmentId}`, {}, 'user')
  }

  async gradeAssignment(assignmentId: string, studentId: string, score: number, feedback: string): Promise<TeacherSubmission> {
    const res = await this.request<{ submission: TeacherSubmission }>(
      `/assignments/${assignmentId}/submissions/${studentId}/grade`,
      { method: 'PUT', body: JSON.stringify({ score, feedback }) },
      'user'
    )
    return res.submission
  }

  async addAssignmentAttachment(assignmentId: string, file: File): Promise<AttachmentMeta> {
    const res = await this.uploadFile<{ attachment: AttachmentMeta }>(`/assignments/${assignmentId}/attachments`, file)
    return res.attachment
  }

  async removeAssignmentAttachment(assignmentId: string, attachmentId: string): Promise<void> {
    await this.request(`/assignments/${assignmentId}/attachments/${attachmentId}`, { method: 'DELETE' }, 'user')
  }

  async publishAssignmentGrades(assignmentId: string, published: boolean): Promise<TeacherAssignment> {
    const res = await this.request<{ assignment: TeacherAssignment }>(
      `/assignments/${assignmentId}/publish`,
      { method: 'POST', body: JSON.stringify({ published }) },
      'user'
    )
    return res.assignment
  }

  // ===== Học sinh: lớp học, bài tập, bảng điểm =====
  async joinClass(joinCode: string): Promise<{ class: ClassSummary; alreadyMember: boolean }> {
    return this.request('/me/classes/join', { method: 'POST', body: JSON.stringify({ joinCode }) }, 'user')
  }

  async myClasses(): Promise<ClassSummary[]> {
    const res = await this.request<{ classes: ClassSummary[] }>('/me/classes', {}, 'user')
    return res.classes
  }

  async myAssignments(): Promise<StudentAssignment[]> {
    const res = await this.request<{ assignments: StudentAssignment[] }>('/me/assignments', {}, 'user')
    return res.assignments
  }

  async submitAssignment(assignmentId: string, content: string): Promise<StudentAssignment> {
    const res = await this.request<{ assignment: StudentAssignment }>(
      `/me/assignments/${assignmentId}/submission`,
      { method: 'PUT', body: JSON.stringify({ content }) },
      'user'
    )
    return res.assignment
  }

  async addSubmissionFile(assignmentId: string, file: File): Promise<StudentAssignment> {
    const res = await this.uploadFile<{ assignment: StudentAssignment }>(`/me/assignments/${assignmentId}/submission/files`, file)
    return res.assignment
  }

  async removeSubmissionFile(assignmentId: string, attachmentId: string): Promise<StudentAssignment> {
    const res = await this.request<{ assignment: StudentAssignment }>(
      `/me/assignments/${assignmentId}/submission/files/${attachmentId}`,
      { method: 'DELETE' },
      'user'
    )
    return res.assignment
  }

  async myGrades(): Promise<StudentGrades> {
    return this.request<StudentGrades>('/me/grades', {}, 'user')
  }
}

export const api = new ApiClient()
