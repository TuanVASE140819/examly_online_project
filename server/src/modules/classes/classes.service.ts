import { randomInt } from 'node:crypto'
import { Prisma, UserRole } from '@prisma/client'
import { prisma } from '../../lib/prisma.js'
import { AppError } from '../../middleware/errorHandler.js'
import type {
  AddMembersInput,
  ClassInput,
  CreateAssignmentInput,
  GradeAssignmentInput,
  UpdateAssignmentInput,
} from './classes.schemas.js'

export type Actor = { id: string; role: UserRole }

// Bỏ các ký tự dễ nhầm (0/O, 1/I) để học sinh gõ mã lớp không bị sai
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function generateClassCode() {
  let code = ''
  for (let i = 0; i < 6; i++) code += CODE_CHARS[randomInt(CODE_CHARS.length)]
  return `LOP-${code}`
}

const classInclude = {
  teacher: { select: { displayName: true } },
  _count: { select: { members: true, assignments: true } },
} satisfies Prisma.ClassroomInclude

type ClassRow = Prisma.ClassroomGetPayload<{ include: typeof classInclude }>

export function toClassSummary(c: ClassRow) {
  return {
    id: c.id,
    name: c.name,
    description: c.description,
    joinCode: c.joinCode,
    teacherId: c.teacherId,
    teacherName: c.teacher.displayName,
    memberCount: c._count.members,
    assignmentCount: c._count.assignments,
    createdAt: c.createdAt,
  }
}

type AssignmentRow = Prisma.AssignmentGetPayload<{ include: { submissions: { select: { gradedAt: true } } } }>

function toTeacherAssignment(a: AssignmentRow) {
  return {
    id: a.id,
    classId: a.classId,
    title: a.title,
    instructions: a.instructions,
    dueAt: a.dueAt,
    maxScore: a.maxScore,
    gradesPublished: a.gradesPublished,
    publishedAt: a.publishedAt,
    createdAt: a.createdAt,
    submittedCount: a.submissions.length,
    gradedCount: a.submissions.filter((s) => s.gradedAt).length,
  }
}

const roundScore = (n: number) => Math.round(n * 100) / 100

// Giáo viên chỉ thao tác trên lớp của mình; quản trị viên thao tác được mọi lớp
async function assertClassAccess(actor: Actor, classId: string) {
  const classroom = await prisma.classroom.findUnique({ where: { id: classId } })
  if (!classroom) {
    throw new AppError(404, 'CLASS_NOT_FOUND', 'Không tìm thấy lớp học.')
  }
  if (actor.role !== UserRole.ADMIN && classroom.teacherId !== actor.id) {
    throw new AppError(403, 'FORBIDDEN', 'Bạn không phải giáo viên của lớp học này.')
  }
  return classroom
}

async function assertAssignmentAccess(actor: Actor, assignmentId: string) {
  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    include: { classroom: { select: { id: true, name: true, teacherId: true } } },
  })
  if (!assignment) {
    throw new AppError(404, 'ASSIGNMENT_NOT_FOUND', 'Không tìm thấy bài tập.')
  }
  if (actor.role !== UserRole.ADMIN && assignment.classroom.teacherId !== actor.id) {
    throw new AppError(403, 'FORBIDDEN', 'Bạn không phải giáo viên của lớp có bài tập này.')
  }
  return assignment
}

export class ClassesService {
  static async listClasses(actor: Actor) {
    const classes = await prisma.classroom.findMany({
      where: actor.role === UserRole.ADMIN ? {} : { teacherId: actor.id },
      include: classInclude,
      orderBy: { createdAt: 'desc' },
    })
    return { classes: classes.map(toClassSummary) }
  }

  static async createClass(actor: Actor, data: ClassInput) {
    let joinCode = generateClassCode()
    for (let retry = 0; retry < 5 && (await prisma.classroom.findUnique({ where: { joinCode }, select: { id: true } })); retry++) {
      joinCode = generateClassCode()
    }

    const classroom = await prisma.classroom.create({
      data: { teacherId: actor.id, name: data.name, description: data.description || null, joinCode },
      include: classInclude,
    })
    return { class: toClassSummary(classroom) }
  }

  static async updateClass(actor: Actor, classId: string, data: ClassInput) {
    await assertClassAccess(actor, classId)
    const classroom = await prisma.classroom.update({
      where: { id: classId },
      data: { name: data.name, description: data.description || null },
      include: classInclude,
    })
    return { class: toClassSummary(classroom) }
  }

  static async deleteClass(actor: Actor, classId: string) {
    await assertClassAccess(actor, classId)
    await prisma.classroom.delete({ where: { id: classId } })
    return { deleted: true }
  }

  static async getClass(actor: Actor, classId: string) {
    await assertClassAccess(actor, classId)
    const [classroom, members, assignments] = await Promise.all([
      prisma.classroom.findUniqueOrThrow({ where: { id: classId }, include: classInclude }),
      prisma.classMember.findMany({
        where: { classId },
        include: { student: { select: { id: true, displayName: true, email: true } } },
        orderBy: { joinedAt: 'asc' },
      }),
      prisma.assignment.findMany({
        where: { classId },
        include: { submissions: { select: { gradedAt: true } } },
        orderBy: { createdAt: 'desc' },
      }),
    ])

    return {
      class: toClassSummary(classroom),
      members: members.map((m) => ({ id: m.student.id, displayName: m.student.displayName, email: m.student.email, joinedAt: m.joinedAt })),
      assignments: assignments.map(toTeacherAssignment),
    }
  }

  // Thêm học sinh theo email: chỉ tài khoản học sinh đã đăng ký mới được thêm
  static async addMembers(actor: Actor, classId: string, data: AddMembersInput) {
    await assertClassAccess(actor, classId)
    const emails = [...new Set(data.emails)]

    const users = await prisma.user.findMany({ where: { email: { in: emails } }, select: { id: true, email: true, role: true } })
    const found = new Set(users.map((u) => u.email))
    const students = users.filter((u) => u.role === UserRole.STUDENT)

    const existing = await prisma.classMember.findMany({
      where: { classId, studentId: { in: students.map((s) => s.id) } },
      select: { studentId: true },
    })
    const existingIds = new Set(existing.map((m) => m.studentId))
    const toAdd = students.filter((s) => !existingIds.has(s.id))

    if (toAdd.length) {
      await prisma.classMember.createMany({ data: toAdd.map((s) => ({ classId, studentId: s.id })), skipDuplicates: true })
    }

    return {
      added: toAdd.map((s) => s.email),
      alreadyMember: students.filter((s) => existingIds.has(s.id)).map((s) => s.email),
      notStudent: users.filter((u) => u.role !== UserRole.STUDENT).map((u) => u.email),
      notFound: emails.filter((e) => !found.has(e)),
    }
  }

  static async removeMember(actor: Actor, classId: string, studentId: string) {
    await assertClassAccess(actor, classId)
    const { count } = await prisma.classMember.deleteMany({ where: { classId, studentId } })
    if (!count) {
      throw new AppError(404, 'MEMBER_NOT_FOUND', 'Học sinh không có trong lớp này.')
    }
    return { removed: true }
  }

  static async createAssignment(actor: Actor, classId: string, data: CreateAssignmentInput) {
    await assertClassAccess(actor, classId)
    const assignment = await prisma.assignment.create({
      data: {
        classId,
        title: data.title,
        instructions: data.instructions,
        dueAt: data.dueAt ?? null,
        maxScore: data.maxScore,
      },
      include: { submissions: { select: { gradedAt: true } } },
    })
    return { assignment: toTeacherAssignment(assignment) }
  }

  static async updateAssignment(actor: Actor, assignmentId: string, data: UpdateAssignmentInput) {
    await assertAssignmentAccess(actor, assignmentId)

    if (data.maxScore !== undefined) {
      const top = await prisma.assignmentSubmission.aggregate({ where: { assignmentId }, _max: { score: true } })
      if (top._max.score !== null && top._max.score > data.maxScore) {
        throw new AppError(409, 'SCORE_ABOVE_MAX', `Đã có bài được chấm ${top._max.score} điểm, thang điểm mới không được thấp hơn.`)
      }
    }

    const assignment = await prisma.assignment.update({
      where: { id: assignmentId },
      data: { title: data.title, instructions: data.instructions, dueAt: data.dueAt, maxScore: data.maxScore },
      include: { submissions: { select: { gradedAt: true } } },
    })
    return { assignment: toTeacherAssignment(assignment) }
  }

  static async deleteAssignment(actor: Actor, assignmentId: string) {
    await assertAssignmentAccess(actor, assignmentId)
    await prisma.assignment.delete({ where: { id: assignmentId } })
    return { deleted: true }
  }

  // Danh sách học sinh của lớp kèm bài nộp (nếu có) để giáo viên chấm
  static async getAssignmentRoster(actor: Actor, assignmentId: string) {
    const assignment = await assertAssignmentAccess(actor, assignmentId)
    const [members, submissions] = await Promise.all([
      prisma.classMember.findMany({
        where: { classId: assignment.classId },
        include: { student: { select: { id: true, displayName: true, email: true } } },
        orderBy: { joinedAt: 'asc' },
      }),
      prisma.assignmentSubmission.findMany({ where: { assignmentId } }),
    ])
    const byStudent = new Map(submissions.map((s) => [s.studentId, s]))

    return {
      assignment: {
        ...toTeacherAssignment({ ...assignment, submissions: submissions.map((s) => ({ gradedAt: s.gradedAt })) }),
        className: assignment.classroom.name,
      },
      roster: members.map((m) => {
        const s = byStudent.get(m.student.id)
        return {
          student: { id: m.student.id, displayName: m.student.displayName, email: m.student.email },
          submission: s
            ? { content: s.content, submittedAt: s.submittedAt, score: s.score, feedback: s.feedback, gradedAt: s.gradedAt }
            : null,
        }
      }),
    }
  }

  static async gradeSubmission(actor: Actor, assignmentId: string, studentId: string, data: GradeAssignmentInput) {
    const assignment = await assertAssignmentAccess(actor, assignmentId)
    if (data.score > assignment.maxScore) {
      throw new AppError(400, 'SCORE_ABOVE_MAX', `Điểm tối đa của bài tập này là ${assignment.maxScore}.`)
    }

    const submission = await prisma.assignmentSubmission.findUnique({
      where: { assignmentId_studentId: { assignmentId, studentId } },
    })
    if (!submission) {
      throw new AppError(404, 'NOT_SUBMITTED', 'Học sinh chưa nộp bài tập này.')
    }

    const updated = await prisma.assignmentSubmission.update({
      where: { id: submission.id },
      data: { score: roundScore(data.score), feedback: data.feedback || null, gradedAt: new Date() },
    })

    return {
      submission: {
        content: updated.content,
        submittedAt: updated.submittedAt,
        score: updated.score,
        feedback: updated.feedback,
        gradedAt: updated.gradedAt,
      },
    }
  }

  static async publishGrades(actor: Actor, assignmentId: string, published: boolean) {
    await assertAssignmentAccess(actor, assignmentId)
    const assignment = await prisma.assignment.update({
      where: { id: assignmentId },
      data: { gradesPublished: published, publishedAt: published ? new Date() : null },
      include: { submissions: { select: { gradedAt: true } } },
    })
    return { assignment: toTeacherAssignment(assignment) }
  }
}
