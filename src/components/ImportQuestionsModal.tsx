import { useState } from 'react'
import { CheckCircle2, Download, FileSpreadsheet, FileText, FileUp, ShieldAlert, TriangleAlert, X } from 'lucide-react'
import type { NewQuestionInput } from '../api/types'
import { downloadExcelTemplate, downloadTextTemplate, TEXT_TEMPLATE } from '../lib/importTemplates'
import { MAX_IMPORT_QUESTIONS, parseQuestionFile, toNewQuestionInput, type ParseResult } from '../lib/questionImport'

const ACCEPT = '.xlsx,.csv,.docx,.txt'

const formatLabels: Record<ParseResult['format'], string> = {
  excel: 'Excel',
  csv: 'CSV',
  word: 'Word',
  text: 'văn bản',
}

interface Props {
  examName: string
  existingCount: number
  onClose: () => void
  onImport: (questions: NewQuestionInput[], replace: boolean) => Promise<void>
}

export function ImportQuestionsModal({ examName, existingCount, onClose, onImport }: Props) {
  const [fileName, setFileName] = useState('')
  const [parsing, setParsing] = useState(false)
  const [result, setResult] = useState<ParseResult | null>(null)
  const [error, setError] = useState('')
  const [replace, setReplace] = useState(false)
  const [importing, setImporting] = useState(false)
  const [dragging, setDragging] = useState(false)

  const questions = result?.questions ?? []
  const tooMany = questions.length > MAX_IMPORT_QUESTIONS

  const readFile = async (file: File) => {
    setFileName(file.name)
    setResult(null)
    setError('')
    setParsing(true)
    try {
      setResult(await parseQuestionFile(file))
    } catch (err: any) {
      setError(err.message || 'Không đọc được file. Hãy kiểm tra lại định dạng.')
    } finally {
      setParsing(false)
    }
  }

  const submit = async () => {
    if (!questions.length || tooMany) return
    setImporting(true)
    setError('')
    try {
      await onImport(questions.map(toNewQuestionInput), replace)
    } catch (err: any) {
      setError(err.message)
      setImporting(false)
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal import-modal">
        <div className="modal-heading">
          <div>
            <div className="section-kicker">NHẬP ĐỀ TỪ FILE</div>
            <h2>Tạo đề thi từ file</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <p className="modal-copy">
          Phòng <strong>{examName}</strong>. Hỗ trợ Excel (.xlsx), CSV, Word (.docx) và văn bản (.txt). File được đọc ngay trên trình duyệt để bạn
          xem trước, chỉ khi bấm nhập thì câu hỏi mới được lưu vào đề.
        </p>

        <label
          className={`dropzone ${dragging ? 'dragging' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            const file = e.dataTransfer.files[0]
            if (file) void readFile(file)
          }}
        >
          <input
            type="file"
            accept={ACCEPT}
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void readFile(file)
              e.target.value = ''
            }}
          />
          <FileUp size={26} />
          {fileName ? (
            <>
              <strong>{fileName}</strong>
              <span>{parsing ? 'Đang đọc file...' : 'Bấm hoặc kéo thả để chọn file khác'}</span>
            </>
          ) : (
            <>
              <strong>Kéo thả file vào đây hoặc bấm để chọn</strong>
              <span>.xlsx, .csv, .docx, .txt — tối đa {MAX_IMPORT_QUESTIONS} câu mỗi lần</span>
            </>
          )}
        </label>

        <details className="import-guide" open={!fileName}>
          <summary>Định dạng file được hỗ trợ</summary>
          <div className="guide-grid">
            <div>
              <strong>
                <FileSpreadsheet size={15} /> Excel / CSV
              </strong>
              <p>
                Dòng đầu là tiêu đề cột: <b>Chủ đề</b> (không bắt buộc), <b>Câu hỏi</b>, <b>A</b>, <b>B</b>, <b>C</b>, <b>D</b> (thêm E, F nếu cần),{' '}
                <b>Đáp án đúng</b> (ghi chữ cái A–F). Mỗi dòng tiếp theo là một câu hỏi.
              </p>
              <button type="button" className="text-link" onClick={() => void downloadExcelTemplate()}>
                <Download size={14} /> Tải file mẫu Excel
              </button>
            </div>
            <div>
              <strong>
                <FileText size={15} /> Word / TXT
              </strong>
              <p>
                Mỗi câu bắt đầu bằng <b>Câu 1:</b>, phương án <b>A.</b> <b>B.</b>... Đáp án đúng: dòng <b>Đáp án: B</b>, dấu <b>*</b> trước phương án, gạch
                chân/in đậm phương án (Word), hoặc bảng đáp án cuối file <b>Đáp án: 1A 2C 3B</b>.
              </p>
              <button type="button" className="text-link" onClick={downloadTextTemplate}>
                <Download size={14} /> Tải file mẫu (.txt)
              </button>
            </div>
          </div>
          <pre className="sample-text">{TEXT_TEMPLATE.trim()}</pre>
        </details>

        {result && (
          <>
            <div className={`import-summary ${questions.length ? 'ok' : 'empty'}`}>
              {questions.length ? <CheckCircle2 size={17} /> : <TriangleAlert size={17} />}
              <span>
                Đọc được <strong>{questions.length}</strong> câu hỏi hợp lệ từ file {formatLabels[result.format]}
                {result.errors.length > 0 && (
                  <>
                    {' '}
                    • <strong>{result.errors.length}</strong> lỗi{questions.length ? ' (các câu lỗi sẽ bị bỏ qua)' : ''}
                  </>
                )}
              </span>
            </div>
            {result.errors.length > 0 && (
              <ul className="import-errors">
                {result.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            )}
            {questions.length > 0 && (
              <ol className="question-list import-preview">
                {questions.map((q, i) => (
                  <li key={i} className="question-item">
                    <div className="question-item-head">
                      <span className="question-number">CÂU {i + 1}</span>
                      <span className="topic-chip">{q.topic || 'Tổng quát'}</span>
                      <span className="muted">{q.source}</span>
                    </div>
                    <p>{q.prompt}</p>
                    <ul className="question-options">
                      {q.options.map((o, j) => (
                        <li key={j} className={j === q.correctIndex ? 'correct' : ''}>
                          <span className="option-letter">{String.fromCharCode(65 + j)}</span>
                          <span>{o}</span>
                          {j === q.correctIndex && <CheckCircle2 size={15} />}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
            )}
            {existingCount > 0 && questions.length > 0 && (
              <div className="mode-options">
                <label className={!replace ? 'selected' : ''}>
                  <input type="radio" name="import-mode" checked={!replace} onChange={() => setReplace(false)} />
                  <span>
                    <strong>Thêm vào cuối đề</strong>
                    <small>Giữ {existingCount} câu hiện có, đánh số tiếp theo</small>
                  </span>
                </label>
                <label className={replace ? 'selected' : ''}>
                  <input type="radio" name="import-mode" checked={replace} onChange={() => setReplace(true)} />
                  <span>
                    <strong>Thay thế toàn bộ đề</strong>
                    <small>Xóa {existingCount} câu hiện có</small>
                  </span>
                </label>
              </div>
            )}
          </>
        )}

        {(error || tooMany) && (
          <div className="error-message">
            <ShieldAlert size={15} />
            {tooMany ? `File có ${questions.length} câu, mỗi lần chỉ nhập tối đa ${MAX_IMPORT_QUESTIONS} câu. Hãy chia nhỏ file.` : error}
          </div>
        )}

        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Hủy
          </button>
          <button type="button" className="button primary" disabled={!questions.length || tooMany || importing || parsing} onClick={() => void submit()}>
            <FileUp size={16} /> {importing ? 'Đang nhập...' : `Nhập ${questions.length || ''} câu hỏi`}
          </button>
        </div>
      </div>
    </div>
  )
}
