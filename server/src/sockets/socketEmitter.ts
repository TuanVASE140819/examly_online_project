import type { Server as SocketIOServer } from 'socket.io'

let ioInstance: SocketIOServer | null = null

export function setSocketIO(io: SocketIOServer) {
  ioInstance = io
}

export function getSocketIO(): SocketIOServer | null {
  return ioInstance
}

export const socketRooms = {
  teacher: (examId: string) => `exam:${examId}:teacher`,
  public: (examId: string) => `exam:${examId}:public`,
  participant: (participantId: string) => `participant:${participantId}`,
}

export const socketEmitter = {
  // Báo cho giáo viên có thí sinh mới gửi yêu cầu
  participantRequested(examId: string, participant: { id: string; displayName: string; className: string; status: string; joinedAt: string; tabWarnings: number }) {
    ioInstance?.to(socketRooms.teacher(examId)).emit('participant:requested', { examId, ...participant })
  },

  // Báo cho thí sinh & giáo viên khi được duyệt
  participantApproved(examId: string, participantId: string, approvedAt: string) {
    ioInstance?.to(socketRooms.participant(participantId)).emit('participant:approved', {
      participantId,
      status: 'APPROVED',
      approvedAt,
    })
    ioInstance?.to(socketRooms.teacher(examId)).emit('participant:status-changed', {
      examId,
      participantId,
      status: 'APPROVED',
    })
  },

  // Báo cho thí sinh & giáo viên khi bị từ chối
  participantRejected(examId: string, participantId: string) {
    ioInstance?.to(socketRooms.participant(participantId)).emit('participant:rejected', {
      participantId,
      status: 'REJECTED',
    })
    ioInstance?.to(socketRooms.teacher(examId)).emit('participant:status-changed', {
      examId,
      participantId,
      status: 'REJECTED',
    })
  },

  // Báo trạng thái học sinh thay đổi (ví dụ reset về pending)
  participantStatusChanged(examId: string, participantId: string, status: string) {
    ioInstance?.to(socketRooms.participant(participantId)).emit('participant:status-changed', {
      examId,
      participantId,
      status,
    })
    ioInstance?.to(socketRooms.teacher(examId)).emit('participant:status-changed', {
      examId,
      participantId,
      status,
    })
  },

  // Báo bắt đầu kỳ thi
  // Giáo viên ở cả 2 room nên phát một lần cho cả hai để Socket.IO tự loại trùng
  examStarted(examId: string, data: { startsAt: string; endsAt: string; durationSeconds: number }) {
    ioInstance?.to([socketRooms.public(examId), socketRooms.teacher(examId)]).emit('exam:started', {
      examId,
      status: 'ACTIVE',
      ...data,
    })
  },

  // Báo kết thúc kỳ thi
  examEnded(examId: string, endedAt: string) {
    ioInstance?.to([socketRooms.public(examId), socketRooms.teacher(examId)]).emit('exam:ended', {
      examId,
      status: 'ENDED',
      endedAt,
    })
  },

  // Cảnh báo giám sát (chuyển tab) gửi tới giáo viên
  proctoringWarning(examId: string, warning: { participantId: string; displayName: string; tabWarnings: number; occurredAt: string }) {
    ioInstance?.to(socketRooms.teacher(examId)).emit('proctoring:warning', { examId, ...warning })
  },

  // Báo thí sinh đã nộp bài tới giáo viên.
  // Thí sinh không nhận điểm qua socket: điểm chỉ hiện khi giáo viên công bố (thí sinh tải lại qua API).
  participantSubmitted(examId: string, payload: { participantId: string; score: number | null; pendingEssays: number; submittedAt: string }) {
    ioInstance?.to(socketRooms.teacher(examId)).emit('participant:submitted', { examId, ...payload })
    ioInstance?.to(socketRooms.participant(payload.participantId)).emit('submission:result', {
      participantId: payload.participantId,
      pendingEssays: payload.pendingEssays,
      submittedAt: payload.submittedAt,
    })
  },

  // Giáo viên chấm câu tự luận: giáo viên nhận điểm mới, thí sinh chỉ nhận tín hiệu để tải lại
  submissionGraded(examId: string, payload: { participantId: string; score: number | null; pendingEssays: number }) {
    ioInstance?.to(socketRooms.teacher(examId)).emit('participant:graded', { examId, ...payload })
    ioInstance?.to(socketRooms.participant(payload.participantId)).emit('submission:graded', {
      participantId: payload.participantId,
      pendingEssays: payload.pendingEssays,
    })
  },

  // Giáo viên công bố hoặc ẩn điểm: thí sinh trong phòng tải lại kết quả
  resultsPublished(examId: string, published: boolean) {
    ioInstance?.to([socketRooms.public(examId), socketRooms.teacher(examId)]).emit('exam:results-published', { examId, published })
  },
}
