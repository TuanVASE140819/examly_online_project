import { io, Socket } from 'socket.io-client'

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:4000'

class SocketClient {
  private socket: Socket | null = null

  connect(token: string): Socket {
    if (this.socket?.connected) {
      return this.socket
    }

    if (this.socket) {
      this.socket.disconnect()
    }

    this.socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    })

    this.socket.on('connect', () => {
      console.log('⚡ Socket.IO đã kết nối thành công:', this.socket?.id)
    })

    this.socket.on('connect_error', (err) => {
      console.warn('⚠️ Lỗi kết nối Socket.IO:', err.message)
    })

    return this.socket
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect()
      this.socket = null
    }
  }

  subscribeExam(examId: string, callback?: (res: { ok: boolean; error?: string }) => void) {
    if (!this.socket) return
    this.socket.emit('exam:subscribe', { examId }, callback)
  }

  on(event: string, callback: (...args: any[]) => void) {
    this.socket?.on(event, callback)
  }

  off(event: string, callback?: (...args: any[]) => void) {
    this.socket?.off(event, callback)
  }
}

export const socketClient = new SocketClient()
