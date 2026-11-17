// Biểu tượng Examly: chữ "E" có nét giữa là dấu tích, gợi ý một bài thi đã hoàn thành.
// Vẽ bằng currentColor để đặt được trên nền gradient của .brand-mark; public/favicon.svg dùng cùng nét vẽ.
export function ExamlyLogo({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M16.75 5.5h-9.5v13h9.5" />
      <path d="M7.25 12h3l2 2 4.5-4.5" />
    </svg>
  )
}
