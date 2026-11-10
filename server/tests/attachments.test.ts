import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { UserRole } from '@prisma/client'
import { createApp } from '../src/app.js'
import { prisma } from '../src/lib/prisma.js'
import { env } from '../src/config/env.js'
import { MAX_FILE_BYTES } from '../src/modules/attachments/attachments.service.js'

vi.mock('../src/lib/prisma.js', () => ({
  prisma: {
    $transaction: vi.fn(),
    user: { findUnique: vi.fn() },
    classMember: { findUnique: vi.fn() },
    assignment: { findUnique: vi.fn(), findFirst: vi.fn(), findUniqueOrThrow: vi.fn() },
    assignmentSubmission: { findUnique: vi.fn(), upsert: vi.fn(), delete: vi.fn() },
    attachment: { count: vi.fn(), create: vi.fn(), deleteMany: vi.fn(), findUnique: vi.fn() },
  },
}))

const TEACHER_ID = '00000000-0000-4000-8000-000000000002'
const OTHER_TEACHER_ID = '00000000-0000-4000-8000-000000000003'
const STUDENT_ID = '00000000-0000-4000-8000-000000000004'
const OTHER_STUDENT_ID = '00000000-0000-4000-8000-000000000005'
const CLASS_ID = '00000000-0000-4000-8000-0000000000c1'
const ASSIGNMENT_ID = '00000000-0000-4000-8000-0000000000a1'
const FILE_ID = '00000000-0000-4000-8000-0000000000f1'
const SUBMISSION_ID = '00000000-0000-4000-8000-0000000000b1'

const sign = (payload: object) => `Bearer ${jwt.sign(payload, env.JWT_SECRET)}`
const teacherAuth = sign({ sub: TEACHER_ID, role: UserRole.TEACHER })
const studentAuth = sign({ sub: STUDENT_ID, role: UserRole.STUDENT })

const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(64, 1)])
const DOCX = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(64, 2)])

const ownAssignment = { id: ASSIGNMENT_ID, classId: CLASS_ID, maxScore: 10, classroom: { id: CLASS_ID, name: '12A1', teacherId: TEACHER_ID } }
const meta = (over: Record<string, unknown> = {}) => ({ id: FILE_ID, fileName: 'Đề bài.pdf', mimeType: 'application/pdf', size: PDF.length, createdAt: new Date(), ...over })

const studentAssignment = (submission: Record<string, unknown> | null) => ({
  id: ASSIGNMENT_ID,
  title: 'Bài tập chương 1',
  instructions: '',
  dueAt: null,
  maxScore: 10,
  gradesPublished: false,
  createdAt: new Date(),
  classroom: { id: CLASS_ID, name: '12A1' },
  attachments: [meta()],
  submissions: submission ? [{ content: '', submittedAt: new Date(), score: null, feedback: null, gradedAt: null, attachments: [], ...submission }] : [],
})

const uploadAsTeacher = (name: string, body: Buffer) =>
  request(createApp())
    .post(`/api/v1/assignments/${ASSIGNMENT_ID}/attachments`)
    .query({ name })
    .set('Authorization', teacherAuth)
    .set('Content-Type', 'application/octet-stream')
    .send(body)

describe('Giáo viên đính kèm tệp đề bài (PDF / Word)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('Nhận tệp PDF, giữ tên tiếng Việt và tự xác định loại tệp', async () => {
    vi.mocked(prisma.assignment.findUnique).mockResolvedValueOnce(ownAssignment as any)
    vi.mocked(prisma.attachment.count).mockResolvedValueOnce(0)
    vi.mocked(prisma.attachment.create).mockResolvedValueOnce(meta() as any)

    const res = await uploadAsTeacher('C:\\fakepath\\Đề bài.pdf', PDF)

    expect(res.status).toBe(201)
    expect(res.body.attachment).toMatchObject({ id: FILE_ID, fileName: 'Đề bài.pdf' })
    const data = vi.mocked(prisma.attachment.create).mock.calls[0][0].data as any
    expect(data).toMatchObject({ assignmentId: ASSIGNMENT_ID, fileName: 'Đề bài.pdf', mimeType: 'application/pdf', size: PDF.length })
    expect(Buffer.compare(data.data, PDF)).toBe(0)
  })

  it('Từ chối tệp không phải PDF / Word và tệp bị đổi đuôi', async () => {
    const image = await uploadAsTeacher('anh.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]))
    expect(image.status).toBe(415)

    const renamed = await uploadAsTeacher('de-bai.pdf', DOCX)
    expect(renamed.status).toBe(415)
    expect(renamed.body.error).toBe('UNSUPPORTED_FILE')

    const empty = await uploadAsTeacher('de-bai.docx', Buffer.alloc(0))
    expect(empty.status).toBe(400)
    expect(prisma.attachment.create).not.toHaveBeenCalled()
  })

  it('Tệp quá 10 MB bị từ chối với thông báo rõ ràng', async () => {
    const res = await uploadAsTeacher('lon.pdf', Buffer.concat([PDF, Buffer.alloc(MAX_FILE_BYTES)]))
    expect(res.status).toBe(413)
    expect(res.body.error).toBe('PAYLOAD_TOO_LARGE')
    expect(res.body.message).toContain('10 MB')
  })

  it('Tối đa 5 tệp mỗi bài tập; giáo viên lớp khác không tải lên được', async () => {
    vi.mocked(prisma.assignment.findUnique).mockResolvedValueOnce(ownAssignment as any)
    vi.mocked(prisma.attachment.count).mockResolvedValueOnce(5)
    const full = await uploadAsTeacher('de.docx', DOCX)
    expect(full.status).toBe(409)
    expect(full.body.error).toBe('TOO_MANY_FILES')

    vi.mocked(prisma.assignment.findUnique).mockResolvedValueOnce({ ...ownAssignment, classroom: { ...ownAssignment.classroom, teacherId: OTHER_TEACHER_ID } } as any)
    const other = await uploadAsTeacher('de.docx', DOCX)
    expect(other.status).toBe(403)
    expect(prisma.attachment.create).not.toHaveBeenCalled()
  })

  it('Chưa đăng nhập thì không tải lên được', async () => {
    const res = await request(createApp()).post(`/api/v1/assignments/${ASSIGNMENT_ID}/attachments?name=a.pdf`).send(PDF)
    expect(res.status).toBe(401)
  })
})

describe('Tải tệp đính kèm theo quyền trong lớp', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  const assignmentFile = { ...meta(), data: PDF, assignment: { classroom: { id: CLASS_ID, teacherId: TEACHER_ID } }, submission: null }
  const submissionFile = (studentId: string) => ({
    ...meta({ fileName: 'Bài làm.docx' }),
    data: DOCX,
    assignment: null,
    submission: { studentId, assignment: { classroom: { id: CLASS_ID, teacherId: TEACHER_ID } } },
  })

  it('Học sinh trong lớp tải được đề bài; học sinh ngoài lớp nhận 404', async () => {
    vi.mocked(prisma.attachment.findUnique).mockResolvedValueOnce(assignmentFile as any)
    vi.mocked(prisma.classMember.findUnique).mockResolvedValueOnce({ id: 'm1' } as any)
    const ok = await request(createApp()).get(`/api/v1/attachments/${FILE_ID}`).set('Authorization', studentAuth).buffer(true)
    expect(ok.status).toBe(200)
    // Nhị phân chung, không kèm tên .pdf: để trình quản lý tải xuống không chặn yêu cầu fetch của giao diện
    expect(ok.headers['content-type']).toContain('application/octet-stream')
    expect(ok.headers['content-disposition']).toBeUndefined()
    expect(Buffer.compare(ok.body, PDF)).toBe(0)

    vi.mocked(prisma.attachment.findUnique).mockResolvedValueOnce(assignmentFile as any)
    vi.mocked(prisma.classMember.findUnique).mockResolvedValueOnce(null)
    const outsider = await request(createApp()).get(`/api/v1/attachments/${FILE_ID}`).set('Authorization', studentAuth)
    expect(outsider.status).toBe(404)
  })

  it('Bài làm chỉ chủ bài và giáo viên của lớp tải được', async () => {
    vi.mocked(prisma.attachment.findUnique).mockResolvedValueOnce(submissionFile(OTHER_STUDENT_ID) as any)
    const classmate = await request(createApp()).get(`/api/v1/attachments/${FILE_ID}`).set('Authorization', studentAuth)
    expect(classmate.status).toBe(404)

    vi.mocked(prisma.attachment.findUnique).mockResolvedValueOnce(submissionFile(STUDENT_ID) as any)
    const owner = await request(createApp()).get(`/api/v1/attachments/${FILE_ID}`).set('Authorization', studentAuth)
    expect(owner.status).toBe(200)

    vi.mocked(prisma.attachment.findUnique).mockResolvedValueOnce(submissionFile(STUDENT_ID) as any)
    const teacher = await request(createApp()).get(`/api/v1/attachments/${FILE_ID}`).set('Authorization', teacherAuth)
    expect(teacher.status).toBe(200)

    vi.mocked(prisma.attachment.findUnique).mockResolvedValueOnce(submissionFile(STUDENT_ID) as any)
    const otherTeacher = await request(createApp())
      .get(`/api/v1/attachments/${FILE_ID}`)
      .set('Authorization', sign({ sub: OTHER_TEACHER_ID, role: UserRole.TEACHER }))
    expect(otherTeacher.status).toBe(404)
  })
})

describe('Học sinh nộp bài kèm tệp PDF / Word', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => fn(prisma))
  })

  const asStudent = () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({ role: UserRole.STUDENT } as any)
    vi.mocked(prisma.assignment.findFirst).mockResolvedValueOnce({ id: ASSIGNMENT_ID } as any)
  }

  it('Không nộp được bài trống cả chữ lẫn tệp; có tệp thì phần chữ được để trống', async () => {
    asStudent()
    vi.mocked(prisma.assignmentSubmission.findUnique).mockResolvedValueOnce(null)
    const empty = await request(createApp())
      .put(`/api/v1/me/assignments/${ASSIGNMENT_ID}/submission`)
      .set('Authorization', studentAuth)
      .send({ content: '   ' })
    expect(empty.status).toBe(400)
    expect(empty.body.error).toBe('EMPTY_SUBMISSION')
    expect(prisma.assignmentSubmission.upsert).not.toHaveBeenCalled()

    asStudent()
    vi.mocked(prisma.assignmentSubmission.findUnique).mockResolvedValueOnce({ id: SUBMISSION_ID, content: '', gradedAt: null, _count: { attachments: 1 } } as any)
    vi.mocked(prisma.assignment.findUniqueOrThrow).mockResolvedValueOnce(studentAssignment({ attachments: [meta({ fileName: 'Bài làm.pdf' })] }) as any)
    const fileOnly = await request(createApp())
      .put(`/api/v1/me/assignments/${ASSIGNMENT_ID}/submission`)
      .set('Authorization', studentAuth)
      .send({ content: '' })
    expect(fileOnly.status).toBe(200)
    expect(fileOnly.body.assignment.attachments).toHaveLength(1)
    expect(fileOnly.body.assignment.submission.attachments[0].fileName).toBe('Bài làm.pdf')
  })

  it('Tải tệp bài làm tạo bài nộp; tối đa 3 tệp; bài đã chấm thì khóa', async () => {
    asStudent()
    vi.mocked(prisma.assignmentSubmission.findUnique).mockResolvedValueOnce(null)
    vi.mocked(prisma.assignmentSubmission.upsert).mockResolvedValueOnce({ id: SUBMISSION_ID } as any)
    vi.mocked(prisma.attachment.create).mockResolvedValueOnce({ id: FILE_ID } as any)
    vi.mocked(prisma.assignment.findUniqueOrThrow).mockResolvedValueOnce(studentAssignment({}) as any)
    const created = await request(createApp())
      .post(`/api/v1/me/assignments/${ASSIGNMENT_ID}/submission/files?name=bai-lam.docx`)
      .set('Authorization', studentAuth)
      .set('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
      .send(DOCX)
    expect(created.status).toBe(201)
    expect(prisma.assignmentSubmission.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ content: '' }) }))
    expect(prisma.attachment.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ submissionId: SUBMISSION_ID, fileName: 'bai-lam.docx' }) }))

    asStudent()
    vi.mocked(prisma.assignmentSubmission.findUnique).mockResolvedValueOnce({ id: SUBMISSION_ID, content: '', gradedAt: null, _count: { attachments: 3 } } as any)
    const full = await request(createApp())
      .post(`/api/v1/me/assignments/${ASSIGNMENT_ID}/submission/files?name=bai-4.pdf`)
      .set('Authorization', studentAuth)
      .send(PDF)
    expect(full.status).toBe(409)
    expect(full.body.error).toBe('TOO_MANY_FILES')

    asStudent()
    vi.mocked(prisma.assignmentSubmission.findUnique).mockResolvedValueOnce({ id: SUBMISSION_ID, content: '', gradedAt: new Date(), _count: { attachments: 1 } } as any)
    const graded = await request(createApp())
      .post(`/api/v1/me/assignments/${ASSIGNMENT_ID}/submission/files?name=bai-moi.pdf`)
      .set('Authorization', studentAuth)
      .send(PDF)
    expect(graded.status).toBe(409)
    expect(graded.body.error).toBe('ALREADY_GRADED')
    expect(prisma.attachment.create).toHaveBeenCalledTimes(1)
  })

  it('Gỡ tệp cuối cùng của bài nộp không có chữ thì rút bài nộp', async () => {
    asStudent()
    vi.mocked(prisma.assignmentSubmission.findUnique).mockResolvedValueOnce({ id: SUBMISSION_ID, content: '', gradedAt: null, _count: { attachments: 1 } } as any)
    vi.mocked(prisma.attachment.deleteMany).mockResolvedValueOnce({ count: 1 })
    vi.mocked(prisma.assignment.findUniqueOrThrow).mockResolvedValueOnce(studentAssignment(null) as any)

    const res = await request(createApp())
      .delete(`/api/v1/me/assignments/${ASSIGNMENT_ID}/submission/files/${FILE_ID}`)
      .set('Authorization', studentAuth)

    expect(res.status).toBe(200)
    expect(prisma.attachment.deleteMany).toHaveBeenCalledWith({ where: { id: FILE_ID, submissionId: SUBMISSION_ID } })
    expect(prisma.assignmentSubmission.delete).toHaveBeenCalledWith({ where: { id: SUBMISSION_ID } })
    expect(res.body.assignment.submission).toBeNull()
  })
})
