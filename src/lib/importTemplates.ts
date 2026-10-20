// File mẫu để giáo viên soạn đề rồi nhập vào hệ thống

const headerStyle = { fontWeight: 'bold', backgroundColor: '#EDF1FF' } as const

export async function downloadExcelTemplate() {
  const { default: writeExcelFile } = await import('write-excel-file/browser')
  const header = ['Chủ đề', 'Câu hỏi', 'A', 'B', 'C', 'D', 'E', 'F', 'Đáp án đúng'].map((value) => ({ value, ...headerStyle }))
  const rows = [
    ['Địa lý', 'Thủ đô của Việt Nam là gì?', 'Hà Nội', 'Huế', 'Đà Nẵng', 'TP. Hồ Chí Minh', '', '', 'A'],
    ['Toán', '2 + 3 bằng bao nhiêu?', '4', '5', '6', '', '', '', 'B'],
    ['Toán', 'Số nào là số nguyên tố?', '4', '6', '7', '9', '', '', 'C'],
  ]
  await writeExcelFile([header, ...rows], {
    columns: [{ width: 14 }, { width: 48 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 12 }, { width: 12 }, { width: 13 }],
  }).toFile('mau-nhap-de-thi.xlsx')
}

export const TEXT_TEMPLATE = `Chủ đề: Địa lý
Câu 1: Thủ đô của Việt Nam là gì?
A. Hà Nội
B. Huế
C. Đà Nẵng
D. TP. Hồ Chí Minh
Đáp án: A

Chủ đề: Toán
Câu 2: 2 + 3 bằng bao nhiêu?
A. 4
*B. 5
C. 6

Câu 3: 3 × 3 bằng bao nhiêu?
A. 6     B. 8     C. 9     D. 12
Đáp án: C
`

export function downloadTextTemplate() {
  // BOM để Notepad/Word trên Windows nhận đúng tiếng Việt
  const blob = new Blob(['﻿' + TEXT_TEMPLATE.replace(/\n/g, '\r\n')], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'mau-nhap-de-thi.txt'
  link.click()
  URL.revokeObjectURL(url)
}
