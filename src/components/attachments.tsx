import { useEffect, useRef, useState, type DragEvent } from 'react'
import { createPortal } from 'react-dom'
import { CloudUpload, Download, ExternalLink, Eye, FileWarning, LoaderCircle, X } from 'lucide-react'
import { api } from '../api/client'
import type { AttachmentMeta } from '../api/types'

// Đồng bộ với máy chủ (server/src/modules/attachments/attachments.service.ts)
export const MAX_FILE_MB = 10
export const ACCEPT_FILES = '.pdf,.doc,.docx'

export type FileKind = 'pdf' | 'docx' | 'doc'

export const fileKind = (name: string): FileKind | null => {
  const lower = name.toLowerCase()
  if (lower.endsWith('.pdf')) return 'pdf'
  if (lower.endsWith('.docx')) return 'docx'
  if (lower.endsWith('.doc')) return 'doc'
  return null
}

export const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`
}

// Tệp đã chọn trên máy nhưng chưa tải lên
export interface DraftFile {
  key: string
  file: File
}

let draftSeq = 0
export const toDrafts = (files: File[]): DraftFile[] => files.map((file) => ({ key: `draft-${++draftSeq}`, file }))

// Lọc tệp hợp lệ trước khi gửi: đúng loại, không quá dung lượng, không vượt số tệp cho phép
export function pickFiles(files: File[], slotsLeft: number): { accepted: File[]; error: string } {
  const problems: string[] = []
  const accepted: File[] = []
  for (const file of files) {
    if (!fileKind(file.name)) problems.push(`${file.name}: chỉ nhận PDF hoặc Word`)
    else if (file.size > MAX_FILE_MB * 1024 * 1024) problems.push(`${file.name}: lớn hơn ${MAX_FILE_MB} MB`)
    else if (file.size === 0) problems.push(`${file.name}: tệp trống`)
    else if (accepted.length >= slotsLeft) problems.push(`${file.name}: đã đủ số tệp tối đa`)
    else accepted.push(file)
  }
  return { accepted, error: problems.join(' • ') }
}

export function FileDropzone({
  onFiles,
  disabled,
  title = 'Kéo thả tệp vào đây hoặc bấm để chọn',
  hint,
}: {
  onFiles: (files: File[]) => void
  disabled?: boolean
  title?: string
  hint: string
}) {
  const [over, setOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setOver(false)
    if (!disabled && e.dataTransfer.files.length) onFiles(Array.from(e.dataTransfer.files))
  }

  return (
    <label
      className={`dropzone ${over ? 'over' : ''} ${disabled ? 'disabled' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        if (!disabled) setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT_FILES}
        disabled={disabled}
        onChange={(e) => {
          if (e.target.files?.length) onFiles(Array.from(e.target.files))
          // Cho phép chọn lại đúng tệp vừa gỡ
          e.target.value = ''
        }}
      />
      <span className="dropzone-icon">
        <CloudUpload size={20} />
      </span>
      <span className="dropzone-copy">
        <strong>{title}</strong>
        <small>{hint}</small>
      </span>
    </label>
  )
}

export function FileBadge({ name }: { name: string }) {
  const kind = fileKind(name)
  return <span className={`file-badge ${kind ?? 'other'}`}>{kind === 'pdf' ? 'PDF' : kind ? 'DOC' : 'FILE'}</span>
}

export type FileSource = { type: 'remote'; meta: AttachmentMeta } | { type: 'local'; file: File }

const sourceName = (s: FileSource) => (s.type === 'remote' ? s.meta.fileName : s.file.name)
const sourceSize = (s: FileSource) => (s.type === 'remote' ? s.meta.size : s.file.size)

export function FileChip({
  source,
  onOpen,
  onRemove,
  removeLabel = 'Gỡ tệp',
}: {
  source: FileSource
  onOpen: (s: FileSource) => void
  onRemove?: () => void
  removeLabel?: string
}) {
  const name = sourceName(source)
  return (
    <li className={`file-chip ${source.type === 'local' ? 'pending' : ''}`}>
      <button type="button" className="file-chip-main" onClick={() => onOpen(source)} title={`Xem ${name}`}>
        <FileBadge name={name} />
        <span className="file-chip-copy">
          <strong>{name}</strong>
          <small>
            {formatBytes(sourceSize(source))}
            {source.type === 'local' && <em> • chưa tải lên</em>}
          </small>
        </span>
        <Eye size={15} className="file-chip-eye" />
      </button>
      {onRemove && (
        <button type="button" className="file-chip-remove" onClick={onRemove} title={removeLabel} aria-label={`${removeLabel} ${name}`}>
          <X size={14} />
        </button>
      )}
    </li>
  )
}

// Danh sách tệp đã tải lên (remote) và tệp mới chọn (drafts); bấm vào tệp để xem trước
export function FileList({
  attachments,
  drafts = [],
  onRemoveAttachment,
  onRemoveDraft,
  empty,
}: {
  attachments: AttachmentMeta[]
  drafts?: DraftFile[]
  onRemoveAttachment?: (a: AttachmentMeta) => void
  onRemoveDraft?: (d: DraftFile) => void
  empty?: string
}) {
  const [viewing, setViewing] = useState<FileSource | null>(null)
  if (!attachments.length && !drafts.length) return empty ? <p className="file-empty">{empty}</p> : null
  return (
    <>
      <ul className="file-list">
        {attachments.map((a) => (
          <FileChip key={a.id} source={{ type: 'remote', meta: a }} onOpen={setViewing} onRemove={onRemoveAttachment && (() => onRemoveAttachment(a))} />
        ))}
        {drafts.map((d) => (
          <FileChip key={d.key} source={{ type: 'local', file: d.file }} onOpen={setViewing} onRemove={onRemoveDraft && (() => onRemoveDraft(d))} />
        ))}
      </ul>
      {viewing && <FilePreview source={viewing} onClose={() => setViewing(null)} />}
    </>
  )
}

// Tệp đã tải về được giữ lại để mở lại nhanh trong phiên làm việc
const blobCache = new Map<string, Promise<Blob>>()

function loadBlob(source: FileSource): Promise<Blob> {
  if (source.type === 'local') return Promise.resolve(source.file)
  const id = source.meta.id
  let cached = blobCache.get(id)
  if (!cached) {
    // Máy chủ gửi dạng octet-stream; gắn lại đúng loại tệp để trình duyệt mở được
    const { mimeType } = source.meta
    cached = api.downloadAttachment(id).then((blob) => new Blob([blob], { type: mimeType }))
    cached.catch(() => blobCache.delete(id))
    blobCache.set(id, cached)
  }
  return cached
}

export function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

// Nội dung .docx được chuyển sang HTML ngay trên trình duyệt; chỉ giữ thẻ định dạng an toàn
function sanitizeHtml(html: string) {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html')
  doc.querySelectorAll('script,style,iframe,object,embed,link,meta,form,input,button,textarea,select').forEach((n) => n.remove())
  doc.querySelectorAll('*').forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase()
      const value = attr.value.trim().toLowerCase()
      const safeUrl = /^(https?:|mailto:|#)/.test(value) || (name === 'src' && value.startsWith('data:image/'))
      if (name.startsWith('on') || name === 'style' || ((name === 'href' || name === 'src') && !safeUrl)) {
        el.removeAttribute(attr.name)
      }
    }
    if (el.tagName === 'A') {
      el.setAttribute('target', '_blank')
      el.setAttribute('rel', 'noopener noreferrer')
    }
  })
  return doc.body.firstElementChild?.innerHTML ?? ''
}

type PreviewState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'pdf'; url: string; blob: Blob }
  | { status: 'docx'; html: string; blob: Blob }
  | { status: 'nopreview'; blob: Blob }

export function FilePreview({ source, onClose }: { source: FileSource; onClose: () => void }) {
  const name = sourceName(source)
  const kind = fileKind(name)
  const [state, setState] = useState<PreviewState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null
    ;(async () => {
      try {
        const blob = await loadBlob(source)
        if (cancelled) return
        if (kind === 'pdf') {
          // Đặt đúng loại tệp để trình duyệt mở bằng trình xem PDF có sẵn
          objectUrl = URL.createObjectURL(blob.type === 'application/pdf' ? blob : new Blob([blob], { type: 'application/pdf' }))
          setState({ status: 'pdf', url: objectUrl, blob })
        } else if (kind === 'docx') {
          const mammoth = (await import('mammoth')).default
          const { value } = await mammoth.convertToHtml({ arrayBuffer: await blob.arrayBuffer() })
          if (!cancelled) setState({ status: 'docx', html: sanitizeHtml(value), blob })
        } else {
          setState({ status: 'nopreview', blob })
        }
      } catch (err: any) {
        if (!cancelled) setState({ status: 'error', message: err?.message || 'Không mở được tệp này.' })
      }
    })()
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [source])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const blob = 'blob' in state ? state.blob : null

  // Gắn thẳng vào body để không bị lồng trong form / hộp thoại đang mở
  return createPortal(
    <div className="file-viewer-backdrop" role="dialog" aria-modal="true" aria-label={`Xem tệp ${name}`} onClick={onClose}>
      <div className="file-viewer" onClick={(e) => e.stopPropagation()}>
        <header className="file-viewer-head">
          <FileBadge name={name} />
          <div className="file-viewer-title">
            <strong>{name}</strong>
            <small>{formatBytes(sourceSize(source))}</small>
          </div>
          {state.status === 'pdf' && (
            <a className="button secondary small-button" href={state.url} target="_blank" rel="noreferrer">
              <ExternalLink size={14} /> Mở tab mới
            </a>
          )}
          <button type="button" className="button secondary small-button" disabled={!blob} onClick={() => blob && saveBlob(blob, name)}>
            <Download size={14} /> Tải về
          </button>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Đóng">
            <X size={18} />
          </button>
        </header>
        <div className="file-viewer-body">
          {state.status === 'loading' && (
            <div className="file-viewer-message">
              <LoaderCircle size={26} className="spin" />
              <span>Đang mở tệp...</span>
            </div>
          )}
          {state.status === 'error' && (
            <div className="file-viewer-message">
              <FileWarning size={26} />
              <strong>Không mở được tệp</strong>
              <span>{state.message}</span>
            </div>
          )}
          {state.status === 'pdf' && <iframe title={name} src={state.url} />}
          {state.status === 'docx' && (
            <div className="docx-page">
              {state.html ? <article className="docx-content" dangerouslySetInnerHTML={{ __html: state.html }} /> : <p className="file-empty">Tệp Word này không có nội dung chữ.</p>}
              <p className="docx-note">Bản xem nhanh có thể khác bản gốc ở phông chữ, công thức và bố cục. Tải về để xem đầy đủ.</p>
            </div>
          )}
          {state.status === 'nopreview' && (
            <div className="file-viewer-message">
              <FileWarning size={26} />
              <strong>Không xem trước được tệp Word 97-2003 (.doc)</strong>
              <span>Hãy tải về để mở bằng Word, hoặc lưu lại thành .docx / .pdf trước khi tải lên.</span>
              <button type="button" className="button primary" onClick={() => saveBlob(state.blob, name)}>
                <Download size={15} /> Tải về
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
