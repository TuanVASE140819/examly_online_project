import { useEffect, useRef, useState } from 'react'

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

// Chống chụp màn hình trong giờ thi.
// Không trang web nào chặn hẳn được việc chụp ở mức hệ điều hành (PrintScreen, Snipping Tool,
// phần mềm quay màn hình, chụp bằng điện thoại). Hook này làm việc chụp khó và dễ bị phát hiện hơn:
// - Che đề khi cửa sổ thi không được chọn, nên ứng dụng chụp hay cửa sổ khác chỉ thấy phần che.
// - Che đề ngay khi giữ phím Win/Cmd, bước đầu của Win+Shift+S và Cmd+Shift+3/4/5.
// - Sau phím PrintScreen, ghi đè clipboard để ảnh vừa chụp không dán ra được.
// - Báo những lần bấm tổ hợp chụp màn hình cho giáo viên qua onAttempt.
// Nhãn chìm tên học sinh trên đề (xem StudentPortal) giúp truy ra người chụp nếu ảnh vẫn bị lộ.
export type ScreenshotMethod = 'PRINT_SCREEN' | 'WIN_SHIFT_S' | 'MAC_SCREENSHOT'

const IS_WINDOWS = /Win/i.test(navigator.platform || navigator.userAgent)
const MAC_SCREENSHOT_KEYS = ['Digit3', 'Digit4', 'Digit5']
const PRINT_SCREEN_COVER_MS = 2000

export function useScreenshotGuard(enabled: boolean, onAttempt: (method: ScreenshotMethod) => void) {
  const [covered, setCovered] = useState(false)
  const attemptRef = useRef(onAttempt)
  attemptRef.current = onAttempt

  useEffect(() => {
    if (!enabled) {
      setCovered(false)
      return
    }
    let metaDown = false
    let coverUntil = 0
    let lastReport = 0
    let timer = 0

    const sync = () => setCovered(metaDown || Date.now() < coverUntil || document.visibilityState === 'hidden' || !document.hasFocus())

    // Một lần chụp có thể sinh nhiều sự kiện phím, chỉ báo một lần trong 1,5 giây
    const report = (method: ScreenshotMethod) => {
      if (Date.now() - lastReport < 1500) return
      lastReport = Date.now()
      attemptRef.current(method)
    }

    const onPrintScreen = () => {
      coverUntil = Date.now() + PRINT_SCREEN_COVER_MS
      sync()
      window.clearTimeout(timer)
      timer = window.setTimeout(sync, PRINT_SCREEN_COVER_MS + 50)
      navigator.clipboard?.writeText('Không được chụp màn hình trong giờ thi.').catch(() => undefined)
      report('PRINT_SCREEN')
    }

    const isMeta = (e: KeyboardEvent) => e.key === 'Meta' || e.key === 'OS'

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'PrintScreen') return onPrintScreen()
      if (isMeta(e)) {
        metaDown = true
        sync()
      }
      // Windows nuốt phím S của Win+Shift+S nên trang chỉ thấy Win rồi Shift.
      // Trên macOS, Cmd+Shift+Z (làm lại) cũng có Cmd+Shift nên chỉ báo khi thấy phím số 3/4/5.
      if (e.metaKey && e.shiftKey && !e.repeat) {
        if (IS_WINDOWS && (e.key === 'Shift' || isMeta(e) || e.code === 'KeyS')) report('WIN_SHIFT_S')
        else if (MAC_SCREENSHOT_KEYS.includes(e.code)) report('MAC_SCREENSHOT')
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      // Windows thường chỉ gửi keyup cho PrintScreen
      if (e.key === 'PrintScreen') return onPrintScreen()
      if (isMeta(e)) {
        metaDown = false
        sync()
      }
    }
    // Rời cửa sổ thì có thể không nhận được keyup của Win/Cmd, nên xoá trạng thái giữ phím
    const onFocusChange = () => {
      metaDown = false
      sync()
    }

    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('keyup', onKeyUp, true)
    window.addEventListener('blur', onFocusChange)
    window.addEventListener('focus', onFocusChange)
    document.addEventListener('visibilitychange', sync)
    sync()

    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('keyup', onKeyUp, true)
      window.removeEventListener('blur', onFocusChange)
      window.removeEventListener('focus', onFocusChange)
      document.removeEventListener('visibilitychange', sync)
      window.clearTimeout(timer)
      setCovered(false)
    }
  }, [enabled])

  return covered
}
