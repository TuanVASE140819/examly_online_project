import express, { type Request } from 'express'
import { Prisma, UserRole } from '@prisma/client'
import { prisma } from '../../lib/prisma.js'
import { AppError } from '../../middleware/errorHandler.js'

export const MAX_FILE_BYTES = 10 * 1024 * 1024
export const MAX_ASSIGNMENT_FILES = 5
export const MAX_SUBMISSION_FILES = 3

// Chỉ nhận PDF và Word. Kiểm tra cả đuôi tệp lẫn chữ ký ở đầu tệp,
// để tệp khác bị đổi đuôi thành .pdf/.docx không lọt vào hệ thống.
const FILE_KINDS = [
  { ext: '.pdf', mime: 'application/pdf', matches: (d: Buffer) => d.subarray(0, 1024).includes('%PDF-') },
  {
    ext: '.docx',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    // .docx là tệp nén ZIP
    matches: (d: Buffer) => d.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])),
  },
  {
    ext: '.doc',
    mime: 'application/msword',
    // Word 97-2003 dùng định dạng OLE
    matches: (d: Buffer) => d.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])),
  },
]

export const ACCEPTED_FILES_LABEL = 'PDF hoặc Word (.pdf, .doc, .docx)'

// Thông tin tệp trả về cho giao diện; không bao giờ kèm nội dung tệp trong danh sách
export const attachmentSelect = {
  id: true,
  fileName: true,
  mimeType: true,
  size: true,
  createdAt: true,
} satisfies Prisma.AttachmentSelect

export const attachmentList = { select: attachmentSelect, orderBy: { createdAt: 'asc' as const } }

export type UploadedFile = { fileName: string; mimeType: string; size: number; data: Buffer }

// Tệp gửi lên dạng nhị phân thô (một tệp mỗi yêu cầu), tên tệp nằm ở ?name=.
// Đặt sau middleware xác thực để người lạ không làm máy chủ phải nhận 10 MB dữ liệu.
export const rawFileBody = express.raw({ type: () => true, limit: MAX_FILE_BYTES })

function cleanFileName(raw: unknown) {
  const name = String(raw ?? '')
    .split(/[\\/]/)
    .pop()!
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .normalize('NFC')
    .trim()
  if (name.length <= 180) return name
  const dot = name.lastIndexOf('.')
  const ext = dot > 0 ? name.slice(dot) : ''
  return name.slice(0, 180 - ext.length) + ext
}

export function readUploadedFile(req: Request): UploadedFile {
  const fileName = cleanFileName(req.query['name'])
  const data = req.body
  if (!fileName) {
    throw new AppError(400, 'FILE_NAME_REQUIRED', 'Thiếu tên tệp tải lên.')
  }
  if (!Buffer.isBuffer(data) || data.length === 0) {
    throw new AppError(400, 'EMPTY_FILE', `Tệp ${fileName} trống.`)
  }

  const kind = FILE_KINDS.find((k) => fileName.toLowerCase().endsWith(k.ext))
  if (!kind) {
    throw new AppError(415, 'UNSUPPORTED_FILE', `Chỉ nhận tệp ${ACCEPTED_FILES_LABEL}.`)
  }
  if (!kind.matches(data)) {
    throw new AppError(415, 'UNSUPPORTED_FILE', `Tệp ${fileName} không phải tệp ${kind.ext.slice(1).toUpperCase()} hợp lệ.`)
  }

  return { fileName, mimeType: kind.mime, size: data.length, data }
}

type Actor = { id: string; role: UserRole }

export class AttachmentsService {
  // Giáo viên của lớp và quản trị viên tải được mọi tệp của lớp.
  // Học sinh tải được tệp đề bài của lớp mình và tệp bài làm của chính mình.
  static async getForDownload(actor: Actor, attachmentId: string) {
    const file = await prisma.attachment.findUnique({
      where: { id: attachmentId },
      select: {
        ...attachmentSelect,
        data: true,
        assignment: { select: { classroom: { select: { id: true, teacherId: true } } } },
        submission: {
          select: { studentId: true, assignment: { select: { classroom: { select: { id: true, teacherId: true } } } } },
        },
      },
    })
    const classroom = file?.assignment?.classroom ?? file?.submission?.assignment.classroom
    if (!file || !classroom) {
      throw new AppError(404, 'ATTACHMENT_NOT_FOUND', 'Không tìm thấy tệp đính kèm.')
    }

    let allowed = actor.role === UserRole.ADMIN || classroom.teacherId === actor.id
    if (!allowed && actor.role === UserRole.STUDENT) {
      allowed = file.submission
        ? file.submission.studentId === actor.id
        : Boolean(
            await prisma.classMember.findUnique({
              where: { classId_studentId: { classId: classroom.id, studentId: actor.id } },
              select: { id: true },
            })
          )
    }
    // Không cho biết tệp có tồn tại hay không khi người xem không có quyền
    if (!allowed) {
      throw new AppError(404, 'ATTACHMENT_NOT_FOUND', 'Không tìm thấy tệp đính kèm.')
    }

    return { fileName: file.fileName, mimeType: file.mimeType, data: Buffer.from(file.data) }
  }
}
