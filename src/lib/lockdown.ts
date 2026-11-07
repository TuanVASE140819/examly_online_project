import { useEffect, useState } from 'react'

// Chế độ khoá thao tác cho học sinh: chặn chuột phải, sao chép, bôi đen, kéo thả, in trang
// và các phím mở công cụ nhà phát triển (F12, Ctrl+Shift+I/J/C, Ctrl+U...).
// Đây chỉ là lớp ngăn chặn phía trình duyệt, người rành kỹ thuật vẫn có thể vượt qua.
// Vì vậy đáp án đúng không bao giờ được gửi xuống máy học sinh, và việc mở công cụ
// nhà phát triển trong giờ thi được báo cho giáo viên như một lượt cảnh báo.

const EDITABLE = 'input, textarea, [contenteditable="true"]'

// Ô nhập liệu vẫn cho bôi đen và sao chép nội dung do chính học sinh gõ
const isEditable = (target: EventTarget | null) => {
  const el = target instanceof Element ? target : target instanceof Node ? target.parentElement : null
  return Boolean(el?.closest(EDITABLE))
}

const DEVTOOLS_LETTERS = ['KeyI', 'KeyJ', 'KeyC', 'KeyK']

const isBlockedShortcut = (e: KeyboardEvent) => {
  if (e.key === 'F12') return true
  const mod = e.ctrlKey || e.metaKey
  // Ctrl+Shift+I/J/C/K (Windows, Linux) và Cmd+Option+I/J/C (macOS): mở công cụ nhà phát triển
  if (mod && (e.shiftKey || e.altKey) && DEVTOOLS_LETTERS.includes(e.code)) return true
  // Ctrl+U xem mã nguồn, Ctrl+S lưu trang, Ctrl+P in trang
  if (mod && !e.shiftKey && ['KeyU', 'KeyS', 'KeyP'].includes(e.code)) return true
  return false
}

// Khi công cụ nhà phát triển đang mở, lệnh debugger làm trang dừng lại.
// Đo thời gian quanh lệnh đó: dừng lâu nghĩa là công cụ đang mở.
const devtoolsPaused = () => {
  const start = performance.now()
  // eslint-disable-next-line no-debugger
  debugger
  return performance.now() - start > 100
}

export function useStudentLockdown(enabled: boolean) {
  const [devtoolsOpen, setDevtoolsOpen] = useState(false)

  useEffect(() => {
    if (!enabled) {
      setDevtoolsOpen(false)
      return
    }
    const root = document.documentElement
    root.classList.add('lockdown')

    const block = (e: Event) => {
      e.preventDefault()
      e.stopPropagation()
    }
    const blockOutsideFields = (e: Event) => {
      if (!isEditable(e.target)) block(e)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (isBlockedShortcut(e)) block(e)
    }

    // Chuột phải bị chặn cả trong ô nhập liệu vì menu đó có mục "Kiểm tra" (Inspect)
    document.addEventListener('contextmenu', block, true)
    document.addEventListener('copy', blockOutsideFields, true)
    document.addEventListener('cut', blockOutsideFields, true)
    document.addEventListener('selectstart', blockOutsideFields, true)
    document.addEventListener('dragstart', blockOutsideFields, true)
    window.addEventListener('keydown', onKeyDown, true)

    const timer = window.setInterval(() => setDevtoolsOpen(devtoolsPaused()), 1000)

    return () => {
      root.classList.remove('lockdown')
      document.removeEventListener('contextmenu', block, true)
      document.removeEventListener('copy', blockOutsideFields, true)
      document.removeEventListener('cut', blockOutsideFields, true)
      document.removeEventListener('selectstart', blockOutsideFields, true)
      document.removeEventListener('dragstart', blockOutsideFields, true)
      window.removeEventListener('keydown', onKeyDown, true)
      window.clearInterval(timer)
      setDevtoolsOpen(false)
    }
  }, [enabled])

  return devtoolsOpen
}
