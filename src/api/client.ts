import type {
  AuthUser,
  CurrentSubmissionState,
  ExamStatus,
  NewQuestionInput,
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
  }
}

function mapTeacherQuestion(q: any): TeacherQuestion {
  return {
    id: q.id,
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
    }))
  }

  async decideParticipant(examId: string, participantId: string, decision: 'APPROVED' | 'REJECTED' | 'PENDING'): Promise<void> {
    await this.request(`/exams/${examId}/participants/${participantId}/decision`, {
      method: 'POST',
      body: JSON.stringify({ decision }),
    }, 'user')
  }

  // Questions (Teacher)
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

  async submitExam(reason: 'MANUAL' | 'TIMEOUT' = 'MANUAL'): Promise<SubmissionResult> {
    const res = await this.request<{ submission: SubmissionResult }>('/submissions/current/submit', {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }, 'participant')
    return res.submission
  }

  async sendProctoringEvent(eventType: 'TAB_HIDDEN' | 'TAB_VISIBLE', metadata?: Record<string, unknown>): Promise<{ tabWarnings?: number }> {
    return this.request<{ tabWarnings?: number }>('/proctoring/events', {
      method: 'POST',
      body: JSON.stringify({ eventType, metadata }),
    }, 'participant')
  }
}

export const api = new ApiClient()
