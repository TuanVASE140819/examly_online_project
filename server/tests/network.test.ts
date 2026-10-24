import { describe, it, expect, vi, beforeEach } from 'vitest'
import os from 'node:os'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { UserRole, ExamStatus, ParticipantStatus } from '@prisma/client'
import { createApp } from '../src/app.js'
import { prisma } from '../src/lib/prisma.js'
import { env } from '../src/config/env.js'
import { isSameNetworkAsServer, isSameNetworkAsTeacher } from '../src/lib/network.js'

vi.mock('../src/lib/prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    exam: { findUnique: vi.fn(), update: vi.fn() },
    participant: { findFirst: vi.fn(), create: vi.fn(), findUnique: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}))

// supertest kết nối qua loopback (proxy tin cậy) nên X-Forwarded-For giả lập IP của học sinh
const EXTERNAL_IP = '203.0.113.7'
// IP công khai của mạng trường mà giáo viên đang dùng lúc khóa mạng
const SCHOOL_IP = '198.51.100.20'

describe('Chế độ mạng của phòng thi (cùng mạng / khác mạng)', () => {
  const app = createApp()

  const teacherId = 'teacher-net-1'
  const teacherToken = jwt.sign({ sub: teacherId, role: UserRole.TEACHER }, env.JWT_SECRET)
  const otherTeacherToken = jwt.sign({ sub: 'teacher-net-2', role: UserRole.TEACHER }, env.JWT_SECRET)

  const studentId = 'student-net-1'
  const studentToken = jwt.sign({ sub: studentId, role: UserRole.STUDENT }, env.JWT_SECRET)
  const participantToken = jwt.sign(
    { sub: 'participant-net-1', role: UserRole.STUDENT, examId: 'exam-net-1' },
    env.JWT_SECRET
  )

  const joinableExam = (allowExternalNetwork: boolean) => ({
    id: 'exam-net-1',
    title: 'Thi cùng mạng',
    status: ExamStatus.WAITING,
    durationSeconds: 1800,
    joinCode: 'NET-101',
    allowExternalNetwork,
    teacherNetworkIp: allowExternalNetwork ? null : SCHOOL_IP,
  })

  const mockJoinSuccess = () => {
    vi.mocked(prisma.participant.findFirst).mockResolvedValueOnce(null)
    vi.mocked(prisma.participant.create).mockResolvedValueOnce({
      id: 'participant-net-1',
      examId: 'exam-net-1',
      displayName: 'Học sinh A',
      className: '12A1',
      status: ParticipantStatus.PENDING,
      joinedAt: new Date(),
    } as any)
  }

  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: studentId, displayName: 'Học sinh A', role: UserRole.STUDENT } as any)
  })

  it('Loopback và IP của chính máy chủ được coi là cùng mạng, IP Internet thì không', () => {
    expect(isSameNetworkAsServer('127.0.0.1')).toBe(true)
    expect(isSameNetworkAsServer('::1')).toBe(true)
    expect(isSameNetworkAsServer('::ffff:127.0.0.1')).toBe(true)
    expect(isSameNetworkAsServer(EXTERNAL_IP)).toBe(false)
    expect(isSameNetworkAsServer(undefined)).toBe(false)
    expect(isSameNetworkAsServer('not-an-ip')).toBe(false)

    const lan = Object.values(os.networkInterfaces())
      .flat()
      .find((nic) => nic && nic.family === 'IPv4' && !nic.internal)
    if (lan) expect(isSameNetworkAsServer(lan.address)).toBe(true)
  })

  it('Cùng mạng với giáo viên: cùng IP công khai (IPv4) hoặc cùng dải /64 (IPv6)', () => {
    expect(isSameNetworkAsTeacher(SCHOOL_IP, SCHOOL_IP)).toBe(true)
    expect(isSameNetworkAsTeacher(`::ffff:${SCHOOL_IP}`, SCHOOL_IP)).toBe(true)
    expect(isSameNetworkAsTeacher(EXTERNAL_IP, SCHOOL_IP)).toBe(false)
    expect(isSameNetworkAsTeacher('2001:db8:1:2::abcd', '2001:db8:1:2::1')).toBe(true)
    expect(isSameNetworkAsTeacher('2001:db8:1:3::abcd', '2001:db8:1:2::1')).toBe(false)
    expect(isSameNetworkAsTeacher(EXTERNAL_IP, null)).toBe(false)
    // Học sinh cùng mạng nội bộ với máy chủ (chạy trên máy trong lớp) luôn hợp lệ
    expect(isSameNetworkAsTeacher('127.0.0.1', SCHOOL_IP)).toBe(true)
  })

  it('Phòng chỉ cho cùng mạng: học sinh từ mạng khác bị chặn khi tham gia (403 NETWORK_NOT_ALLOWED)', async () => {
    vi.mocked(prisma.exam.findUnique).mockResolvedValueOnce(joinableExam(false) as any)

    const res = await request(app)
      .post('/api/v1/exams/join')
      .set('Authorization', `Bearer ${studentToken}`)
      .set('X-Forwarded-For', EXTERNAL_IP)
      .send({ joinCode: 'NET-101', className: '12A1' })

    expect(res.status).toBe(403)
    expect(res.body.error).toBe('NETWORK_NOT_ALLOWED')
    expect(prisma.participant.create).not.toHaveBeenCalled()
  })

  it('Phòng chỉ cho cùng mạng: học sinh dùng chung mạng trường với giáo viên vẫn tham gia được', async () => {
    vi.mocked(prisma.exam.findUnique).mockResolvedValueOnce(joinableExam(false) as any)
    mockJoinSuccess()

    const res = await request(app)
      .post('/api/v1/exams/join')
      .set('Authorization', `Bearer ${studentToken}`)
      .set('X-Forwarded-For', SCHOOL_IP)
      .send({ joinCode: 'NET-101', className: '12A1' })

    expect(res.status).toBe(201)
  })

  it('Phòng cho phép khác mạng: học sinh từ mạng khác tham gia được', async () => {
    vi.mocked(prisma.exam.findUnique).mockResolvedValueOnce(joinableExam(true) as any)
    mockJoinSuccess()

    const res = await request(app)
      .post('/api/v1/exams/join')
      .set('Authorization', `Bearer ${studentToken}`)
      .set('X-Forwarded-For', EXTERNAL_IP)
      .send({ joinCode: 'NET-101', className: '12A1' })

    expect(res.status).toBe(201)
  })

  it('Thí sinh đã vào phòng nhưng làm bài từ mạng khác sau khi giáo viên khóa mạng: bị chặn', async () => {
    vi.mocked(prisma.exam.findUnique).mockResolvedValueOnce({ allowExternalNetwork: false, teacherNetworkIp: SCHOOL_IP } as any)

    const res = await request(app)
      .get('/api/v1/submissions/current')
      .set('Authorization', `Bearer ${participantToken}`)
      .set('X-Forwarded-For', EXTERNAL_IP)

    expect(res.status).toBe(403)
    expect(res.body.error).toBe('NETWORK_NOT_ALLOWED')
  })

  it('Giáo viên khóa mạng khi kỳ thi đang diễn ra: ghi nhận IP hiện tại của giáo viên; mở lại thì xóa', async () => {
    vi.mocked(prisma.exam.findUnique).mockResolvedValue({ id: 'exam-net-1', ownerId: teacherId, status: ExamStatus.ACTIVE } as any)
    vi.mocked(prisma.exam.update).mockResolvedValueOnce({ id: 'exam-net-1', allowExternalNetwork: false, teacherNetworkIp: SCHOOL_IP } as any)

    const res = await request(app)
      .patch('/api/v1/exams/exam-net-1/network')
      .set('Authorization', `Bearer ${teacherToken}`)
      .set('X-Forwarded-For', SCHOOL_IP)
      .send({ allowExternalNetwork: false })

    expect(res.status).toBe(200)
    expect(res.body.exam.allowExternalNetwork).toBe(false)
    expect(prisma.exam.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { allowExternalNetwork: false, teacherNetworkIp: SCHOOL_IP } })
    )

    vi.mocked(prisma.exam.update).mockResolvedValueOnce({ id: 'exam-net-1', allowExternalNetwork: true, teacherNetworkIp: null } as any)
    await request(app)
      .patch('/api/v1/exams/exam-net-1/network')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ allowExternalNetwork: true })
    expect(prisma.exam.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: { allowExternalNetwork: true, teacherNetworkIp: null } })
    )
  })

  it('Không đổi được chế độ mạng của kỳ thi đã kết thúc hoặc của giáo viên khác', async () => {
    vi.mocked(prisma.exam.findUnique).mockResolvedValueOnce({ id: 'exam-net-1', ownerId: teacherId, status: ExamStatus.ENDED } as any)
    const ended = await request(app)
      .patch('/api/v1/exams/exam-net-1/network')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ allowExternalNetwork: true })
    expect(ended.status).toBe(409)

    vi.mocked(prisma.exam.findUnique).mockResolvedValueOnce({ id: 'exam-net-1', ownerId: teacherId, status: ExamStatus.WAITING } as any)
    const other = await request(app)
      .patch('/api/v1/exams/exam-net-1/network')
      .set('Authorization', `Bearer ${otherTeacherToken}`)
      .send({ allowExternalNetwork: true })
    expect(other.status).toBe(403)
    expect(prisma.exam.update).not.toHaveBeenCalled()
  })
})
