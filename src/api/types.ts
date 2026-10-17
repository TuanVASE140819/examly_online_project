export type Role = 'teacher' | 'student'
export type StudentStatus = 'pending' | 'approved' | 'rejected' | 'submitted'

export interface Student {
  id: string
  name: string
  className: string
  roomCode: string
  status: StudentStatus
  joinedAt: string
  tabWarnings: number
  score?: number
}

export interface Room {
  id?: string
  name: string
  code: string
  duration: number
  status: 'waiting' | 'active' | 'ended'
  createdAt: string
  startsAt?: string | null
  endsAt?: string | null
}

export interface OptionItem {
  id: string
  text: string
  position: number
}

export interface QuestionItem {
  id: string | number
  topic: string
  text: string
  points: number
  position: number
  options: OptionItem[]
}

export interface AuthUser {
  id: string
  email: string
  displayName: string
  role: 'TEACHER' | 'ADMIN' | 'STUDENT'
}

export interface CurrentSubmissionState {
  submitted: boolean
  answers: Record<string, string | null>
  secondsRemaining: number
  examStatus: 'WAITING' | 'ACTIVE' | 'ENDED'
}
