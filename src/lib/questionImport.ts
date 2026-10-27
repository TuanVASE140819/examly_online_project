import type { NewQuestionInput, QuestionType } from '../api/types'

// Đọc đề thi (trắc nghiệm và tự luận) từ file Excel (.xlsx), CSV, Word (.docx) hoặc văn bản (.txt) ngay trên trình duyệt.

export interface ParsedQuestion {
  source: string // vị trí trong file để báo lỗi/xem trước, ví dụ "Dòng 5" hoặc "Câu 3"
  type: QuestionType
  topic: string
  prompt: string
  points: number
  options: string[] // câu tự luận: mảng rỗng
  correctIndex: number // câu tự luận: -1
}

export interface ParseResult {
  format: 'excel' | 'csv' | 'word' | 'text'
  questions: ParsedQuestion[]
  errors: string[]
}

// Một dòng văn bản; emph[i] = ký tự thứ i được in đậm/gạch chân (chỉ có với file Word)
interface SourceLine {
  text: string
  emph?: boolean[]
  listLevel?: number
}

export const MAX_IMPORT_QUESTIONS = 300
const MAX_OPTIONS = 6
const LETTERS = 'ABCDEF'

// Bỏ dấu tiếng Việt + chữ thường, giữ nguyên độ dài để cắt lại chuỗi gốc theo cùng vị trí
const foldChar = (ch: string) => (ch === 'đ' || ch === 'Đ' ? 'd' : ch.normalize('NFD')[0]!.toLowerCase())
const fold = (s: string) => s.split('').map(foldChar).join('')
const normalizeKey = (s: string) => fold(s.normalize('NFC')).replace(/\s+/g, ' ').trim()

export async function parseQuestionFile(file: File): Promise<ParseResult> {
  const ext = file.name.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'xlsx': {
      const { readSheet } = await import('read-excel-file/browser')
      const rows = await readSheet(file)
      return { format: 'excel', ...parseRows(rows.map((row) => row.map(cellToText))) }
    }
    case 'csv':
      return { format: 'csv', ...parseRows(parseCsv(await readTextFile(file))) }
    case 'docx':
      return { format: 'word', ...parseLines(await readDocxLines(file)) }
    case 'txt':
      return { format: 'text', ...parseLines((await readTextFile(file)).split(/\r?\n/).map((text) => ({ text: text.normalize('NFC') }))) }
    case 'xls':
    case 'doc':
      throw new Error('Định dạng cũ .xls/.doc chưa được hỗ trợ. Hãy mở file và lưu lại dưới dạng .xlsx hoặc .docx.')
    default:
      throw new Error('Chỉ hỗ trợ file Excel (.xlsx), CSV (.csv), Word (.docx) hoặc văn bản (.txt).')
  }
}

export function toNewQuestionInput(q: ParsedQuestion): NewQuestionInput {
  return {
    type: q.type,
    topic: q.topic || 'Tổng quát',
    prompt: q.prompt,
    points: q.points,
    options: q.options.map((text, i) => ({ text, isCorrect: i === q.correctIndex, position: i })),
  }
}

// ---------- Đọc file ----------

function cellToText(cell: unknown): string {
  if (cell === null || cell === undefined) return ''
  if (cell instanceof Date) return cell.toLocaleDateString('vi-VN')
  return String(cell).normalize('NFC').trim()
}

// Excel trên Windows tiếng Việt thường lưu CSV/TXT bằng bảng mã Windows-1258 thay vì UTF-8
async function readTextFile(file: File): Promise<string> {
  const bytes = await file.arrayBuffer()
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('windows-1258').decode(bytes)
  }
}

function parseCsv(text: string): string[][] {
  const firstLine = text.split(/\r?\n/).find((l) => l.trim()) ?? ''
  const delimiter = [',', ';', '\t'].map((d) => [d, firstLine.split(d).length] as const).sort((a, b) => b[1] - a[1])[0]![0]
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        field += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === delimiter) {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += ch
    }
  }
  if (field || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows.map((r) => r.map((c) => c.normalize('NFC').trim()))
}

async function readDocxLines(file: File): Promise<SourceLine[]> {
  const mammoth = (await import('mammoth')).default
  const { value: html } = await mammoth.convertToHtml(
    { arrayBuffer: await file.arrayBuffer() },
    {
      // Giữ gạch chân để nhận diện đáp án đúng; bỏ ảnh để HTML gọn
      styleMap: ['u => u'],
      convertImage: mammoth.images.imgElement(async () => ({ src: '' })),
    }
  )
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const lines: SourceLine[] = []

  for (const el of Array.from(doc.body.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6'))) {
    if (el.tagName === 'P' && el.closest('li')) continue
    const listLevel = el.tagName === 'LI' ? countListAncestors(el) - 1 : undefined
    let text = ''
    let emph: boolean[] = []

    const flush = () => {
      lines.push({ text, emph, listLevel })
      text = ''
      emph = []
    }
    const walk = (node: Node, emphasized: boolean) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const t = (node.textContent ?? '').normalize('NFC')
        text += t
        for (let i = 0; i < t.length; i++) emph.push(emphasized)
        return
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return
      const tag = (node as Element).tagName
      if (tag === 'OL' || tag === 'UL') return // danh sách con được đọc thành các dòng riêng
      if (tag === 'BR') return flush() // Shift+Enter trong Word: tách thành dòng mới
      const isEmph = emphasized || tag === 'STRONG' || tag === 'B' || tag === 'U'
      node.childNodes.forEach((child) => walk(child, isEmph))
    }
    el.childNodes.forEach((child) => walk(child, false))
    flush()
  }
  return lines
}

function countListAncestors(el: Element) {
  let count = 0
  for (let node = el.parentElement; node; node = node.parentElement) {
    if (node.tagName === 'OL' || node.tagName === 'UL') count++
  }
  return count
}

// ---------- Excel / CSV: mỗi dòng một câu hỏi ----------

const PROMPT_HEADERS = ['cau hoi', 'noi dung', 'noi dung cau hoi', 'de bai', 'question']
const ANSWER_HEADERS = ['dap an', 'dap an dung', 'dap an chinh xac', 'answer', 'correct', 'correct answer']
const TOPIC_HEADERS = ['chu de', 'topic', 'chuong', 'phan']
const POINTS_HEADERS = ['diem', 'so diem', 'thang diem', 'points', 'score']
const OPTION_HEADER_RE = /^(?:phuong an|lua chon|dap an|option|pa)?\s*([a-f])$/

function parseRows(rows: string[][]): Omit<ParseResult, 'format'> {
  const errors: string[] = []
  const questions: ParsedQuestion[] = []

  const headerIndex = rows.slice(0, 10).findIndex((row) => row.some((cell) => PROMPT_HEADERS.includes(normalizeKey(cell))))
  if (headerIndex < 0) {
    return {
      questions,
      errors: ['Không tìm thấy dòng tiêu đề. File cần có các cột: Câu hỏi, A, B, C, D, Đáp án đúng (có thể tải file mẫu để xem).'],
    }
  }

  const header = rows[headerIndex]!.map(normalizeKey)
  const promptCol = header.findIndex((h) => PROMPT_HEADERS.includes(h))
  const answerCol = header.findIndex((h) => ANSWER_HEADERS.includes(h))
  const topicCol = header.findIndex((h) => TOPIC_HEADERS.includes(h))
  const pointsCol = header.findIndex((h) => POINTS_HEADERS.includes(h))
  const optionCols: { letter: string; col: number }[] = []
  header.forEach((h, col) => {
    const m = OPTION_HEADER_RE.exec(h)
    if (m && !optionCols.some((o) => o.letter === m[1]!.toUpperCase())) optionCols.push({ letter: m[1]!.toUpperCase(), col })
  })
  optionCols.sort((a, b) => a.letter.localeCompare(b.letter))

  // Không có cột phương án lẫn cột đáp án: file chỉ gồm câu tự luận
  const hasOptions = optionCols.length >= 2
  if (!hasOptions && answerCol >= 0) errors.push('Thiếu cột phương án. Cần ít nhất 2 cột A, B (tối đa đến F).')
  if (hasOptions && answerCol < 0) errors.push('Thiếu cột "Đáp án đúng".')
  if (errors.length) return { questions, errors }

  let lastTopic = ''
  rows.slice(headerIndex + 1).forEach((row, i) => {
    const source = `Dòng ${headerIndex + i + 2}`
    const cell = (col: number) => (col >= 0 ? row[col] ?? '' : '')
    if (row.every((c) => !c)) return

    // Ô chủ đề trống (thường do gộp ô) thì dùng chủ đề của dòng trên
    const topic = cell(topicCol) || lastTopic
    lastTopic = topic
    const options = optionCols.map((o) => ({ letter: o.letter, text: cell(o.col) }))
    const correctLetter = resolveAnswer(cell(answerCol), options)
    const draft = { source, topic, prompt: cell(promptCol), options, correctLetter, answerRaw: cell(answerCol), pointsRaw: cell(pointsCol) }
    const result = finalize(draft)
    if (typeof result === 'string') errors.push(result)
    else questions.push(result)
  })

  return { questions, errors }
}

// Đáp án có thể ghi: "B", "b.", "Đáp án B", số thứ tự 2, hoặc chép nguyên văn phương án đúng
function resolveAnswer(raw: string, options: { letter: string; text: string }[]): string | null {
  const value = normalizeKey(raw)
  if (!value) return null
  const letter = /^(?:dap an|da|answer)?\s*[(\[]?\s*([a-f])\s*[)\].:]?$/.exec(value)
  if (letter) return letter[1]!.toUpperCase()
  const byText = options.find((o) => o.text && normalizeKey(o.text) === value)
  if (byText) return byText.letter
  if (/^[1-6]$/.test(value)) return LETTERS[Number(value) - 1]!
  return '?'
}

// ---------- Word / TXT: văn bản tự do ----------

const QUESTION_RE = /^(?:cau(?: hoi)?|question|bai)\s*(\d+)\s*[:.)\-–]?\s*/
const NUMBERED_RE = /^(\d+)\s*[.)]\s+/
const OPTION_START_RE = /^\*?\s*[a-f]\s*[.)]/
const OPTION_MARK_RE = /(^|\s)(\*?)\s*([a-f])\s*[.)]\s*(\*?)/g
const ANSWER_RE = /^(?:dap an(?: dung)?|answer|d\/a)\s*[:.\-]?\s*\(?([a-f])\)?\s*\.?$/
const ANSWER_HEADING_RE = /^(?:bang )?(?:dap an|answer key|answers)\s*[:.]?$/
const ANSWER_PAIR_RE = /(\d+)\s*[-.:)]?\s*([a-f])(?![a-z])/g
const TOPIC_RE = /^(?:chu de|topic|phan|chuong)\s*(?:[0-9ivx]+)?\s*[:.\-]\s*/
// Số điểm ghi ngay sau số câu: "Câu 5 (2 điểm): ..." hoặc "Câu 5: (1,5đ) ..."
const POINTS_PREFIX_RE = /^\(\s*(\d+(?:[.,]\d+)?)\s*(?:diem|d)\s*\)\s*[:.\-–]?\s*/

interface DraftOption {
  letter: string
  text: string
  starred?: boolean
  emphasized?: boolean
}

interface Draft {
  source: string
  number?: number
  topic: string
  prompt: string
  options: DraftOption[]
  correctLetter?: string | null
  answerRaw?: string
  pointsRaw?: string
}

function parseLines(lines: SourceLine[]): Omit<ParseResult, 'format'> {
  const drafts: Draft[] = []
  const answerKey = new Map<number, string>()
  let current: Draft | null = null
  let topic = ''
  let inAnswerKey = false
  // Danh sách nhiều cấp: cấp 1 là câu hỏi, cấp con là phương án.
  // Danh sách phẳng (cùng một cấp): mục kết thúc bằng "?" hoặc ":" mở câu hỏi mới, các mục sau là phương án.
  const hasNestedLists = lines.some((l) => (l.listLevel ?? 0) > 0)

  // Kết thúc câu đang đọc và mở câu mới
  const beginQuestion = (number: number | undefined, prompt: string): Draft => {
    if (current) drafts.push(current)
    const n = number ?? drafts.length + 1
    const points = POINTS_PREFIX_RE.exec(fold(prompt))
    return {
      source: `Câu ${n}`,
      number: n,
      topic,
      prompt: points ? prompt.slice(points[0].length).trim() : prompt,
      pointsRaw: points?.[1],
      options: [],
    }
  }

  for (const line of lines) {
    const lead = line.text.length - line.text.trimStart().length
    const text = line.text.trim()
    if (!text) continue
    const f = fold(text)
    const isEmphasized = (start: number, end: number) => {
      if (!line.emph) return false
      let any = false
      for (let i = start; i < end; i++) {
        if (/\s/.test(text[i]!)) continue
        if (!line.emph[lead + i]) return false
        any = true
      }
      return any
    }

    // Bảng đáp án cuối file: "ĐÁP ÁN" rồi các dòng "1.A 2.C 3.B", hoặc "Đáp án: 1A 2C 3B" trên một dòng
    const pairs = Array.from(f.matchAll(ANSWER_PAIR_RE))
    if (ANSWER_HEADING_RE.test(f)) {
      inAnswerKey = true
      continue
    }
    if ((inAnswerKey && pairs.length) || (/^(?:dap an|answer)/.test(f) && pairs.length >= 2)) {
      pairs.forEach((p) => answerKey.set(Number(p[1]), p[2]!.toUpperCase()))
      continue
    }

    const answer = ANSWER_RE.exec(f)
    if (answer) {
      if (current) current.correctLetter = answer[1]!.toUpperCase()
      continue
    }

    const topicMatch = TOPIC_RE.exec(f)
    if (topicMatch) {
      topic = text.slice(topicMatch[0].length).trim()
      inAnswerKey = false
      continue
    }

    const question = QUESTION_RE.exec(f) ?? (line.listLevel === undefined ? NUMBERED_RE.exec(f) : null)
    if (question) {
      inAnswerKey = false
      current = beginQuestion(Number(question[1]), text.slice(question[0].length).trim())
      continue
    }

    if (current && OPTION_START_RE.test(f)) {
      // Một dòng có thể chứa nhiều phương án: "A. 3    B. 4    C. 5    D. 22"
      const marks: { start: number; end: number; letter: string; starred: boolean }[] = []
      for (const m of f.matchAll(OPTION_MARK_RE)) {
        const letter = m[3]!.toUpperCase()
        const expected = marks.length ? LETTERS[LETTERS.indexOf(marks[marks.length - 1]!.letter) + 1] : undefined
        if (marks.length && letter !== expected) continue
        marks.push({ start: m.index! + m[1]!.length, end: m.index! + m[0].length, letter, starred: Boolean(m[2] || m[4]) })
      }
      for (const [i, mark] of marks.entries()) {
        const end = i + 1 < marks.length ? marks[i + 1]!.start : text.length
        const body = text.slice(mark.end, end).trim()
        const bodyStart = text.indexOf(body, mark.end)
        current.options.push({
          letter: mark.letter,
          text: body,
          starred: mark.starred,
          emphasized: body ? isEmphasized(bodyStart, bodyStart + body.length) : false,
        })
      }
      continue
    }

    // Danh sách đánh số tự động trong Word (chữ "1." / "a." không nằm trong nội dung)
    if (line.listLevel !== undefined) {
      const startsQuestion = hasNestedLists
        ? line.listLevel === 0
        : !current || /[?:]$/.test(text) || current.options.length >= MAX_OPTIONS
      if (startsQuestion) {
        current = beginQuestion(undefined, text)
      } else if (current) {
        current.options.push({ letter: LETTERS[current.options.length] ?? '?', text, emphasized: isEmphasized(0, text.length) })
      }
      continue
    }

    // Dòng nối tiếp của câu hỏi hoặc phương án trước đó; nội dung trước câu đầu tiên (tiêu đề đề thi) được bỏ qua
    if (current) {
      const lastOption = current.options[current.options.length - 1]
      if (lastOption) lastOption.text = `${lastOption.text} ${text}`.trim()
      else current.prompt = current.prompt ? `${current.prompt}\n${text}` : text
    }
  }
  if (current) drafts.push(current)

  const questions: ParsedQuestion[] = []
  const errors: string[] = []
  for (const draft of drafts) {
    if (!draft.correctLetter) draft.correctLetter = answerKey.get(draft.number!) ?? pickMarked(draft.options)
    const result = finalize(draft)
    if (typeof result === 'string') errors.push(result)
    else questions.push(result)
  }

  if (!drafts.length) {
    errors.push('Không tìm thấy câu hỏi nào. Mỗi câu cần bắt đầu bằng "Câu 1:" (hoặc "1.") và các phương án "A.", "B."...')
  }
  return { questions, errors }
}

// Đáp án đánh dấu bằng dấu * hoặc in đậm/gạch chân (chỉ nhận khi có đúng 1 phương án được đánh dấu)
function pickMarked(options: DraftOption[]): string | null {
  const starred = options.filter((o) => o.starred)
  if (starred.length) return starred.length === 1 ? starred[0]!.letter : '*'
  const emphasized = options.filter((o) => o.emphasized)
  return emphasized.length === 1 ? emphasized[0]!.letter : null
}

// Kiểm tra và chuyển câu nháp thành câu hỏi hợp lệ, hoặc trả về thông báo lỗi
function finalize(draft: Draft): ParsedQuestion | string {
  const { source } = draft
  const prompt = draft.prompt.trim()
  if (!prompt) return `${source}: thiếu nội dung câu hỏi.`
  if (prompt.length > 4000) return `${source}: nội dung câu hỏi quá dài (tối đa 4000 ký tự).`

  const points = parsePoints(draft.pointsRaw)
  if (points === null) return `${source}: số điểm "${draft.pointsRaw}" không hợp lệ (cần lớn hơn 0 và tối đa 100).`

  const filled = draft.options.filter((o) => o.text.trim())
  // Không có phương án và không ghi đáp án: câu tự luận
  if (!filled.length && !draft.correctLetter && !draft.answerRaw) {
    return { source, type: 'ESSAY', topic: draft.topic.trim(), prompt, points, options: [], correctIndex: -1 }
  }
  if (filled.length < 2) return `${source}: cần ít nhất 2 phương án (A, B...).`
  if (filled.length > MAX_OPTIONS) return `${source}: tối đa ${MAX_OPTIONS} phương án (A–F).`
  if (filled.some((o) => o.text.length > 1000)) return `${source}: có phương án quá dài (tối đa 1000 ký tự).`

  const letter = draft.correctLetter
  if (letter === '*') return `${source}: có nhiều hơn 1 phương án được đánh dấu * là đáp án đúng.`
  if (!letter && draft.answerRaw !== undefined) return `${source}: thiếu đáp án đúng ở cột "Đáp án đúng".`
  if (!letter) {
    return `${source}: chưa xác định đáp án đúng (thêm dòng "Đáp án: B", đặt dấu * trước phương án đúng, hoặc gạch chân/in đậm phương án đúng).`
  }
  if (letter === '?') return `${source}: đáp án đúng "${draft.answerRaw}" không hợp lệ, hãy ghi chữ cái A–F.`
  const correctIndex = filled.findIndex((o) => o.letter === letter)
  if (correctIndex < 0) return `${source}: đáp án đúng ${letter} trỏ tới phương án không có nội dung.`

  return { source, type: 'MULTIPLE_CHOICE', topic: draft.topic.trim(), prompt, points, options: filled.map((o) => o.text.trim()), correctIndex }
}

// Để trống thì mặc định 1 điểm; chấp nhận dấu phẩy thập phân "1,5"
function parsePoints(raw: string | undefined): number | null {
  if (!raw?.trim()) return 1
  const value = Number(raw.trim().replace(',', '.'))
  return value > 0 && value <= 100 ? value : null
}
