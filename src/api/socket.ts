import { io, Socket } from 'socket.io-client'

// Để trống: kết nối cùng địa chỉ với trang web (qua proxy)
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || undefined

type Listener = (...args: any[]) => void

class SocketClient {
  private socket: Socket | null = null
  private token: string | null = null
  private examId: string | null = null
  // Giữ danh sách listener để gắn lại khi socket được tạo mới (đổi token / đổi tài khoản)
  private listeners = new Map<string, Set<Listener>>()

  connect(token: string): Socket {
    if (this.socket && this.token === token) {
      return this.socket
    }

    this.disconnect()
    this.token = token

    const options = {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    }
    this.socket = SOCKET_URL ? io(SOCKET_URL, options) : io(options)

    this.socket.on('connect', () => {
      console.log('⚡ Socket.IO đã kết nối thành công:', this.socket?.id)
      // Server mất room khi socket kết nối lại, nên đăng ký lại phòng thi đang theo dõi
      if (this.examId) {
        this.socket?.emit('exam:subscribe', { examId: this.examId })
      }
    })

    this.socket.on('connect_error', (err) => {
      console.warn('⚠️ Lỗi kết nối Socket.IO:', err.message)
    })

    for (const [event, callbacks] of this.listeners) {
      callbacks.forEach((cb) => this.socket?.on(event, cb))
    }

    return this.socket
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect()
      this.socket = null
    }
    this.token = null
    this.examId = null
  }

  subscribeExam(examId: string, callback?: (res: { ok: boolean; error?: string }) => void) {
    if (!this.socket) return
    this.examId = examId
    if (this.socket.connected) {
      this.socket.emit('exam:subscribe', { examId }, callback)
    }
  }

  on(event: string, callback: Listener) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set())
    this.listeners.get(event)!.add(callback)
    this.socket?.on(event, callback)
  }

  off(event: string, callback?: Listener) {
    if (callback) this.listeners.get(event)?.delete(callback)
    else this.listeners.delete(event)
    this.socket?.off(event, callback)
  }
}

export const socketClient = new SocketClient()
