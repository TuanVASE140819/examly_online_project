import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { ExamStatus, ParticipantStatus, UserRole } from '@prisma/client'
import { createApp } from '../src/app.js'
import { prisma } from '../src/lib/prisma.js'
import { env } from '../src/config/env.js'

vi.mock('../src/lib/prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn(), findMany: vi.fn(), groupBy: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    exam: { findUnique: vi.fn(), update: vi.fn() },
    participant: { findUnique: vi.fn(), findMany: vi.fn() },
    classroom: { findUnique: vi.fn() },
    classMember: { findMany: vi.fn(), createMany: vi.fn() },
    assignment: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
    assignmentSubmission: { findUnique: vi.fn(), update: vi.fn(), upsert: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}))

// UUID hợp lệ vì các route mới kiểm tra định dạng mã trên đường dẫn
const ADMIN_ID = '00000000-0000-4000-8000-000000000001'
const TEACHER_ID = '00000000-0000-4000-8000-000000000002'
const OTHER_TEACHER_ID = '00000000-0000-4000-8000-000000000003'
const STUDENT_ID = '00000000-0000-4000-8000-000000000004'
const CLASS_ID = '00000000-0000-4000-8000-0000000000c1'
const ASSIGNMENT_ID = '00000000-0000-4000-8000-0000000000a1'
const EXAM_ID = '00000000-0000-4000-8000-0000000000e1'

const sign = (payload: object) => `Bearer ${jwt.sign(payload, env.JWT_SECRET)}`
const adminAuth = sign({ sub: ADMIN_ID, role: UserRole.ADMIN })
const teacherAuth = sign({ sub: TEACHER_ID, role: UserRole.TEACHER })
const studentAuth = sign({ sub: STUDENT_ID, role: UserRole.STUDENT })
// Token phiên thi: role STUDENT nhưng sub là participantId
const participantAuth = sign({ sub: 'participant-1', role: UserRole.STUDENT, examId: EXAM_ID })

const userRow = (over: Record<string, unknown> = {}) => ({
  id: TEACHER_ID,
  email: 'gv@truong.vn',
  displayName: 'Giáo viên A',
  role: UserRole.TEACHER,
  passwordHash: 'hash',
  createdAt: new Date(),
  _count: { ownedExams: 0, teachingClasses: 0, classMemberships: 0 },
  ...over,
})

describe('Quản trị viên quản lý giáo viên và học sinh', () => {
  const app = createApp()

  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('Giáo viên không vào được trang quản trị', async () => {
    const res = await request(app).get('/api/v1/admin/users').set('Authorization', teacherAuth)
    expect(res.status).toBe(403)
  })

  it('Token admin cũ mất quyền ngay khi tài khoản đã bị hạ xuống giáo viên', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({ role: UserRole.TEACHER } as any)
    const res = await request(app).get('/api/v1/admin/users').set('Authorization', adminAuth)
    expect(res.status).toBe(403)
  })

  it('Danh sách người dùng không lộ mật khẩu băm, cho biết cách đăng nhập và tổng theo vai trò', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({ role: UserRole.ADMIN } as any)
    vi.mocked(prisma.user.findMany).mockResolvedValueOnce([
      userRow({ _count: { ownedExams: 2, teachingClasses: 1, classMemberships: 0 } }),
      userRow({ id: STUDENT_ID, email: 'hs@truong.vn', role: UserRole.STUDENT, passwordHash: null, _count: { ownedExams: 0, teachingClasses: 0, classMemberships: 3 } }),
    ] as any)
    vi.mocked(prisma.user.groupBy).mockResolvedValueOnce([
      { role: UserRole.TEACHER, _count: { _all: 1 } },
      { role: UserRole.STUDENT, _count: { _all: 1 } },
    ] as any)

    const res = await request(app).get('/api/v1/admin/users?role=TEACHER&q=gv').set('Authorization', adminAuth)

    expect(res.status).toBe(200)
    expect(JSON.stringify(res.body)).not.toContain('hash')
    expect(res.body.users[0]).toMatchObject({ loginMethod: 'PASSWORD', examCount: 2, classCount: 1 })
    expect(res.body.users[1]).toMatchObject({ loginMethod: 'GOOGLE', classCount: 3 })
    expect(res.body.totals).toEqual({ ADMIN: 0, TEACHER: 1, STUDENT: 1 })
    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ role: 'TEACHER' }) }))
  })

  it('Tạo tài khoản trùng email bị từ chối; tạo mới không mật khẩu thì đăng nhập bằng Google', async () => {
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce({ role: UserRole.ADMIN } as any)
      .mockResolvedValueOnce({ id: 'existing' } as any)
    const dup = await request(app)
      .post('/api/v1/admin/users')
      .set('Authorization', adminAuth)
      .send({ email: 'GV@truong.vn', displayName: 'Giáo viên A', role: 'TEACHER' })
    expect(dup.status).toBe(409)
    expect(prisma.user.findUnique).toHaveBeenLastCalledWith({ where: { email: 'gv@truong.vn' }, select: { id: true } })

    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({ role: UserRole.ADMIN } as any).mockResolvedValueOnce(null)
    vi.mocked(prisma.user.create).mockResolvedValueOnce(userRow({ passwordHash: null }) as any)
    const created = await request(app)
      .post('/api/v1/admin/users')
      .set('Authorization', adminAuth)
      .send({ email: 'gv@truong.vn', displayName: 'Giáo viên A', role: 'TEACHER' })
    expect(created.status).toBe(201)
    expect(created.body.user.loginMethod).toBe('GOOGLE')
    expect(prisma.user.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ passwordHash: null }) }))
  })

  it('Không tự xóa, không tự đổi vai trò, không xóa giáo viên còn phòng thi', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({ role: UserRole.ADMIN } as any)
    const self = await request(app).delete(`/api/v1/admin/users/${ADMIN_ID}`).set('Authorization', adminAuth)
    expect(self.status).toBe(409)
    expect(self.body.error).toBe('CANNOT_DELETE_SELF')

    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce({ role: UserRole.ADMIN } as any)
      .mockResolvedValueOnce(userRow({ id: ADMIN_ID, role: UserRole.ADMIN }) as any)
    const demoteSelf = await request(app).patch(`/api/v1/admin/users/${ADMIN_ID}`).set('Authorization', adminAuth).send({ role: 'TEACHER' })
    expect(demoteSelf.status).toBe(409)
    expect(demoteSelf.body.error).toBe('CANNOT_CHANGE_OWN_ROLE')

    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce({ role: UserRole.ADMIN } as any)
      .mockResolvedValueOnce(userRow({ _count: { ownedExams: 3, teachingClasses: 0, classMemberships: 0 } }) as any)
    const withExams = await request(app).delete(`/api/v1/admin/users/${TEACHER_ID}`).set('Authorization', adminAuth)
    expect(withExams.status).toBe(409)
    expect(withExams.body.error).toBe('USER_HAS_CONTENT')
    expect(prisma.user.delete).not.toHaveBeenCalled()
  })
})

describe('Giáo viên quản lý lớp học và bài tập', () => {
  const app = createApp()

  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('Giáo viên không xem được lớp của giáo viên khác', async () => {
    vi.mocked(prisma.classroom.findUnique).mockResolvedValueOnce({ id: CLASS_ID, teacherId: OTHER_TEACHER_ID } as any)
    const res = await request(app).get(`/api/v1/classes/${CLASS_ID}`).set('Authorization', teacherAuth)
    expect(res.status).toBe(403)
  })

  it('Mã lớp sai định dạng UUID trả 404 thay vì lỗi máy chủ', async () => {
    const res = await request(app).get('/api/v1/classes/khong-phai-uuid').set('Authorization', teacherAuth)
    expect(res.status).toBe(404)
  })

  it('Thêm học sinh theo email: chỉ thêm tài khoản học sinh, báo lại email không hợp lệ', async () => {
    vi.mocked(prisma.classroom.findUnique).mockResolvedValueOnce({ id: CLASS_ID, teacherId: TEACHER_ID } as any)
    vi.mocked(prisma.user.findMany).mockResolvedValueOnce([
      { id: STUDENT_ID, email: 'hs1@truong.vn', role: UserRole.STUDENT },
      { id: 's2', email: 'hs2@truong.vn', role: UserRole.STUDENT },
      { id: OTHER_TEACHER_ID, email: 'gv@truong.vn', role: UserRole.TEACHER },
    ] as any)
    vi.mocked(prisma.classMember.findMany).mockResolvedValueOnce([{ studentId: 's2' }] as any)

    const res = await request(app)
      .post(`/api/v1/classes/${CLASS_ID}/members`)
      .set('Authorization', teacherAuth)
      .send({ emails: ['HS1@truong.vn', 'hs2@truong.vn', 'gv@truong.vn', 'chua-co@truong.vn', 'hs1@truong.vn'] })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      added: ['hs1@truong.vn'],
      alreadyMember: ['hs2@truong.vn'],
      notStudent: ['gv@truong.vn'],
      notFound: ['chua-co@truong.vn'],
    })
    expect(prisma.classMember.createMany).toHaveBeenCalledWith({ data: [{ classId: CLASS_ID, studentId: STUDENT_ID }], skipDuplicates: true })
  })

  it('Chấm bài tập: không vượt thang điểm, học sinh phải nộp bài trước', async () => {
    const assignment = { id: ASSIGNMENT_ID, classId: CLASS_ID, maxScore: 10, classroom: { id: CLASS_ID, name: '12A1', teacherId: TEACHER_ID } }
    vi.mocked(prisma.assignment.findUnique).mockResolvedValue(assignment as any)

    const tooHigh = await request(app)
      .put(`/api/v1/assignments/${ASSIGNMENT_ID}/submissions/${STUDENT_ID}/grade`)
      .set('Authorization', teacherAuth)
      .send({ score: 11 })
    expect(tooHigh.status).toBe(400)

    vi.mocked(prisma.assignmentSubmission.findUnique).mockResolvedValueOnce(null)
    const missing = await request(app)
      .put(`/api/v1/assignments/${ASSIGNMENT_ID}/submissions/${STUDENT_ID}/grade`)
      .set('Authorization', teacherAuth)
      .send({ score: 8 })
    expect(missing.status).toBe(404)
    expect(missing.body.error).toBe('NOT_SUBMITTED')
  })
})

describe('Học sinh: bài tập về nhà và bảng điểm chỉ hiện điểm đã công bố', () => {
  const app = createApp()

  beforeEach(() => {
    vi.resetAllMocks()
  })

  const assignmentRow = (published: boolean) => ({
    id: ASSIGNMENT_ID,
    title: 'Bài tập chương 1',
    instructions: 'Làm bài 1-5',
    dueAt: new Date('2026-01-01T00:00:00Z'),
    maxScore: 10,
    gradesPublished: published,
    createdAt: new Date(),
    classroom: { id: CLASS_ID, name: '12A1' },
    submissions: [
      { content: 'Bài làm', submittedAt: new Date('2026-01-02T00:00:00Z'), score: 9, feedback: 'Tốt', gradedAt: new Date() },
    ],
  })

  it('Token phiên thi không dùng được cho các chức năng theo tài khoản', async () => {
    const res = await request(app).get('/api/v1/me/assignments').set('Authorization', participantAuth)
    expect(res.status).toBe(403)
    expect(res.body.error).toBe('ACCOUNT_TOKEN_REQUIRED')
  })

  it('Điểm và nhận xét bài tập bị ẩn cho tới khi giáo viên công bố', async () => {
    vi.mocked(prisma.assignment.findMany).mockResolvedValueOnce([assignmentRow(false)] as any)
    const hidden = await request(app).get('/api/v1/me/assignments').set('Authorization', studentAuth)
    expect(hidden.status).toBe(200)
    expect(hidden.body.assignments[0].submission).toMatchObject({ score: null, feedback: null, locked: true, late: true })

    vi.mocked(prisma.assignment.findMany).mockResolvedValueOnce([assignmentRow(true)] as any)
    const shown = await request(app).get('/api/v1/me/assignments').set('Authorization', studentAuth)
    expect(shown.body.assignments[0].submission).toMatchObject({ score: 9, feedback: 'Tốt' })
  })

  it('Không sửa được bài tập đã được chấm', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({ role: UserRole.STUDENT } as any)
    vi.mocked(prisma.assignment.findFirst).mockResolvedValueOnce({ id: ASSIGNMENT_ID } as any)
    vi.mocked(prisma.assignmentSubmission.findUnique).mockResolvedValueOnce({ gradedAt: new Date() } as any)

    const res = await request(app)
      .put(`/api/v1/me/assignments/${ASSIGNMENT_ID}/submission`)
      .set('Authorization', studentAuth)
      .send({ content: 'Sửa bài' })
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('ALREADY_GRADED')
    expect(prisma.assignmentSubmission.upsert).not.toHaveBeenCalled()
  })

  it('Bảng điểm: bài kiểm tra chưa công bố không lộ điểm, bài đã công bố có điểm', async () => {
    const submission = { score: 7.5, maxScore: 10, correctCount: 6, totalQuestions: 8, submittedAt: new Date() }
    vi.mocked(prisma.participant.findMany).mockResolvedValueOnce([
      { status: ParticipantStatus.SUBMITTED, className: '12A1', submission, exam: { id: 'e1', title: 'Giữa kỳ', resultsPublished: false, endsAt: null, owner: { displayName: 'GV' } } },
      { status: ParticipantStatus.SUBMITTED, className: '12A1', submission, exam: { id: 'e2', title: 'Cuối kỳ', resultsPublished: true, endsAt: null, owner: { displayName: 'GV' } } },
      { status: ParticipantStatus.ABSENT, className: '12A1', submission: null, exam: { id: 'e3', title: '15 phút', resultsPublished: true, endsAt: null, owner: { displayName: 'GV' } } },
    ] as any)
    vi.mocked(prisma.assignment.findMany).mockResolvedValueOnce([assignmentRow(false)] as any)

    const res = await request(app).get('/api/v1/me/grades').set('Authorization', studentAuth)

    expect(res.status).toBe(200)
    expect(res.body.exams.map((e: any) => [e.status, e.score])).toEqual([
      ['UNPUBLISHED', null],
      ['PUBLISHED', 7.5],
      ['ABSENT', null],
    ])
    expect(res.body.homework[0]).toMatchObject({ status: 'UNPUBLISHED', score: null, feedback: null })
  })
})

describe('Công bố điểm bài kiểm tra', () => {
  const app = createApp()

  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('Không công bố được khi kỳ thi chưa kết thúc', async () => {
    vi.mocked(prisma.exam.findUnique).mockResolvedValueOnce({ id: EXAM_ID, ownerId: TEACHER_ID, status: ExamStatus.ACTIVE } as any)
    const res = await request(app).post(`/api/v1/exams/${EXAM_ID}/results`).set('Authorization', teacherAuth).send({ published: true })
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('EXAM_NOT_ENDED')
    expect(prisma.exam.update).not.toHaveBeenCalled()
  })

  it('Giáo viên công bố điểm sau khi kỳ thi kết thúc', async () => {
    vi.mocked(prisma.exam.findUnique).mockResolvedValueOnce({ id: EXAM_ID, ownerId: TEACHER_ID, status: ExamStatus.ENDED } as any)
    vi.mocked(prisma.exam.update).mockResolvedValueOnce({ id: EXAM_ID, resultsPublished: true, resultsPublishedAt: new Date() } as any)
    const res = await request(app).post(`/api/v1/exams/${EXAM_ID}/results`).set('Authorization', teacherAuth).send({ published: true })
    expect(res.status).toBe(200)
    expect(res.body.exam.resultsPublished).toBe(true)
  })

  it('Thí sinh xem lại bài nộp: điểm ẩn khi chưa công bố, hiện khi đã công bố', async () => {
    const participant = (published: boolean) => ({
      id: 'participant-1',
      status: ParticipantStatus.SUBMITTED,
      exam: { id: EXAM_ID, status: ExamStatus.ENDED, durationSeconds: 1800, endsAt: new Date(), resultsPublished: published },
      submission: { id: 'sub-1', score: 8, correctCount: 4, totalQuestions: 5, pendingEssays: 0 },
      answers: [],
    })

    vi.mocked(prisma.participant.findUnique).mockResolvedValueOnce(participant(false) as any)
    const hidden = await request(app).get('/api/v1/submissions/current').set('Authorization', participantAuth)
    expect(hidden.status).toBe(200)
    expect(hidden.body.submission).toMatchObject({ score: null, correctCount: null, totalQuestions: 5, resultsPublished: false })

    vi.mocked(prisma.participant.findUnique).mockResolvedValueOnce(participant(true) as any)
    const shown = await request(app).get('/api/v1/submissions/current').set('Authorization', participantAuth)
    expect(shown.body.submission).toMatchObject({ score: 8, correctCount: 4, resultsPublished: true })
  })
})
