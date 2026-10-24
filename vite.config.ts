import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// API và Socket.IO đi qua cùng cổng với frontend nên học sinh ở máy khác (cùng mạng LAN
// hoặc qua đường hầm Internet) chỉ cần truy cập được địa chỉ của trang web.
// xfwd gửi kèm IP thật của học sinh để backend kiểm tra chế độ cùng mạng.
const backend = 'http://localhost:4000'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
    proxy: {
      '/api': { target: backend, xfwd: true },
      '/socket.io': { target: backend, ws: true, xfwd: true },
    },
  },
})
