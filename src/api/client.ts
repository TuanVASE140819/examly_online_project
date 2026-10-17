import type { AuthUser, CurrentSubmissionState, QuestionItem, Room, Student, StudentStatus } from './types'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api/v1'

class ApiClient {
  private teacherToken: string | null = null
  private participantToken: string | null = null

  constructor() {
    this.teacherToken = localStorage.getItem('examly_teacher_token')
    this.participantToken = localStorage.getItem('examly_participant_token')
  }

  setTeacherToken(token: string | null) {
    this.teacherToken = token
    if (token) localStorage.setItem('examly_teacher_token', token)
    else localStorage.removeItem('examly_teacher_token')
  }

  getTeacherToken(): string | null {
    return this.teacherToken
  }

  setParticipantToken(token: string | null) {
    this.participantToken = token
    if (token) localStorage.setItem('examly_participant_token', token)
    else localStorage.removeItem('examly_participant_token')
  }

  getParticipantToken(): string | null {
    return this.participantToken
  }

  private async request<T>(endpoint: string, options: RequestInit = {}, asRole?: 'teacher' | 'student'): Promise<T> {
    const headers = new Headers(options.headers || {})
    if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json')
    }

    const token = asRole === 'teacher' ? this.teacherToken : asRole === 'student' ? this.participantToken : (this.teacherToken || this.participantToken)
    if (token) {
      headers.set('Authorization', `Bearer ${token}`)
    }

    const res = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    })

    const data = await res.json().catch(() => null)

    if (!res.ok) {
      const errorMsg = data?.message || data?.error || `HTTP error ${res.status}`
      const err = new Error(errorMsg)
      ;(err as any).status = res.status
      ;(err as any).data = data
      throw err
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
  async login(email: string, password: string): Promise<{ token: string; user: AuthUser }> {
    const data = await this.request<{ token: string; user: AuthUser }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
    this.setTeacherToken(data.token)
    return data
  }

  async getMe(): Promise<{ user: AuthUser }> {
    return this.request<{ user: AuthUser }>('/auth/me', {}, 'teacher')
  }

  // Exams (Teacher)
  async createExam(title: string, durationMinutes: number): Promise<{ exam: Room; joinCode: string }> {
    const res = await this.request<any>('/exams', {
      method: 'POST',
      body: JSON.stringify({ title, durationMinutes }),
    }, 'teacher')

    return {
      exam: {
        id: res.exam.id,
        name: res.exam.title,
        code: res.joinCode,
        duration: res.exam.durationMinutes || durationMinutes,
        status: res.exam.status.toLowerCase(),
        createdAt: res.exam.createdAt,
      },
      joinCode: res.joinCode,
    }
  }

  async listExams(): Promise<Room[]> {
    const res = await this.request<{ exams: any[] }>('/exams', {}, 'teacher')
    return res.exams.map((e) => ({
      id: e.id,
      name: e.title,
      code: e.joinCode,
      duration: e.durationMinutes,
      status: e.status.toLowerCase(),
      createdAt: e.createdAt,
      startsAt: e.startsAt,
      endsAt: e.endsAt,
    }))
  }

  async startExam(examId: string): Promise<any> {
    return this.request(`/exams/${examId}/start`, { method: 'POST' }, 'teacher')
  }

  async finishExam(examId: string): Promise<any> {
    return this.request(`/exams/${examId}/finish`, { method: 'POST' }, 'teacher')
  }

  async getParticipants(examId: string): Promise<Student[]> {
    const res = await this.request<{ participants: any[] }>(`/exams/${examId}/participants`, {}, 'teacher')
    return res.participants.map((p) => ({
      id: p.id,
      name: p.name,
      className: p.className,
      roomCode: p.roomCode,
      status: p.status as StudentStatus,
      joinedAt: p.joinedAt,
      tabWarnings: p.tabWarnings,
      score: p.score,
    }))
  }

  async decideParticipant(examId: string, participantId: string, decision: 'APPROVED' | 'REJECTED' | 'PENDING'): Promise<any> {
    return this.request(`/exams/${examId}/participants/${participantId}/decision`, {
      method: 'POST',
      body: JSON.stringify({ decision }),
    }, 'teacher')
  }

  // Student participation
  async joinExam(joinCode: string, displayName: string, className: string): Promise<{ participantToken: string; participant: any; exam: any }> {
    const res = await this.request<any>('/exams/join', {
      method: 'POST',
      body: JSON.stringify({ joinCode, displayName, className }),
    })
    if (res.participantToken) {
      this.setParticipantToken(res.participantToken)
    }
    return res
  }

  async getStudentStatus(): Promise<{ participant: any; exam: any }> {
    return this.request<any>('/exams/my-status', {}, 'student')
  }

  async getStudentQuestions(examId: string): Promise<{ questions: QuestionItem[]; exam: any }> {
    return this.request<{ questions: QuestionItem[]; exam: any }>(`/exams/${examId}/student-questions`, {}, 'student')
  }

  async getCurrentSubmission(): Promise<CurrentSubmissionState> {
    return this.request<CurrentSubmissionState>('/submissions/current', {}, 'student')
  }

  async saveAnswer(questionId: string, selectedOptionId: string | null): Promise<{ saved: boolean }> {
    return this.request<{ saved: boolean }>(`/submissions/current/answers/${questionId}`, {
      method: 'PUT',
      body: JSON.stringify({ selectedOptionId }),
    }, 'student')
  }

  async submitExam(reason: 'MANUAL' | 'TIMEOUT' = 'MANUAL'): Promise<{ submission: any; alreadySubmitted: boolean }> {
    return this.request<any>('/submissions/current/submit', {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }, 'student')
  }

  async sendProctoringEvent(eventType: 'TAB_HIDDEN' | 'TAB_VISIBLE', metadata?: Record<string, unknown>): Promise<{ ok: boolean; tabWarnings: number }> {
    return this.request<any>('/proctoring/events', {
      method: 'POST',
      body: JSON.stringify({ eventType, metadata }),
    }, 'student')
  }
}

export const api = new ApiClient()
