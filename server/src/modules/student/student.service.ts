import { ParticipantStatus, Prisma, UserRole } from '@prisma/client'
import { prisma } from '../../lib/prisma.js'
import { AppError } from '../../middleware/errorHandler.js'
import { toClassSummary } from '../classes/classes.service.js'

type StudentAssignmentRow = Prisma.AssignmentGetPayload<{
  include: { classroom: { select: { id: true; name: true } }; submissions: true }
}>

// Điểm và nhận xét chỉ gửi cho học sinh khi giáo viên đã công bố
function toStudentAssignment(a: StudentAssignmentRow) {
  const s = a.submissions[0]
  return {
    id: a.id,
    classId: a.classroom.id,
    className: a.classroom.name,
    title: a.title,
    instructions: a.instructions,
    dueAt: a.dueAt,
    maxScore: a.maxScore,
    gradesPublished: a.gradesPublished,
    createdAt: a.createdAt,
    submission: s
      ? {
          content: s.content,
          submittedAt: s.submittedAt,
          late: Boolean(a.dueAt && s.submittedAt > a.dueAt),
          // Đã chấm thì khóa bài, kể cả khi điểm chưa công bố
          locked: s.gradedAt !== null,
          score: a.gradesPublished ? s.score : null,
          feedback: a.gradesPublished ? s.feedback : null,
        }
      : null,
  }
}

const memberOf = (studentId: string): Prisma.AssignmentWhereInput => ({
  classroom: { members: { some: { studentId } } },
})

// Đối chiếu với cơ sở dữ liệu: vai trò trong token có thể đã cũ
async function assertStudent(userId: string) {
  const account = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } })
  if (account?.role !== UserRole.STUDENT) {
    throw new AppError(403, 'STUDENT_ACCOUNT_REQUIRED', 'Chức năng này dành cho tài khoản học sinh.')
  }
}

export class StudentService {
  static async joinClass(userId: string, joinCode: string) {
    await assertStudent(userId)
    const classroom = await prisma.classroom.findUnique({ where: { joinCode }, select: { id: true } })
    if (!classroom) {
      throw new AppError(404, 'CLASS_NOT_FOUND', 'Mã lớp không đúng. Hãy kiểm tra lại với giáo viên.')
    }

    const existing = await prisma.classMember.findUnique({
      where: { classId_studentId: { classId: classroom.id, studentId: userId } },
      select: { id: true },
    })
    if (!existing) {
      await prisma.classMember.create({ data: { classId: classroom.id, studentId: userId } })
    }

    const full = await prisma.classroom.findUniqueOrThrow({
      where: { id: classroom.id },
      include: { teacher: { select: { displayName: true } }, _count: { select: { members: true, assignments: true } } },
    })
    return { class: toClassSummary(full), alreadyMember: Boolean(existing) }
  }

  static async listMyClasses(userId: string) {
    const memberships = await prisma.classMember.findMany({
      where: { studentId: userId },
      include: {
        classroom: {
          include: { teacher: { select: { displayName: true } }, _count: { select: { members: true, assignments: true } } },
        },
      },
      orderBy: { joinedAt: 'desc' },
    })
    // Học sinh không cần mã lớp của bạn khác, nhưng mã lớp giúp mời bạn vào cùng lớp nên vẫn trả về
    return { classes: memberships.map((m) => toClassSummary(m.classroom)) }
  }

  static async listMyAssignments(userId: string) {
    const assignments = await prisma.assignment.findMany({
      where: memberOf(userId),
      include: { classroom: { select: { id: true, name: true } }, submissions: { where: { studentId: userId } } },
      orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
    })
    return { assignments: assignments.map(toStudentAssignment) }
  }

  static async submitAssignment(userId: string, assignmentId: string, content: string) {
    await assertStudent(userId)
    const assignment = await prisma.assignment.findFirst({ where: { id: assignmentId, ...memberOf(userId) }, select: { id: true } })
    if (!assignment) {
      throw new AppError(404, 'ASSIGNMENT_NOT_FOUND', 'Không tìm thấy bài tập trong các lớp của bạn.')
    }

    const existing = await prisma.assignmentSubmission.findUnique({
      where: { assignmentId_studentId: { assignmentId, studentId: userId } },
      select: { gradedAt: true },
    })
    if (existing?.gradedAt) {
      throw new AppError(409, 'ALREADY_GRADED', 'Bài tập đã được giáo viên chấm nên không sửa được nữa.')
    }

    await prisma.assignmentSubmission.upsert({
      where: { assignmentId_studentId: { assignmentId, studentId: userId } },
      create: { assignmentId, studentId: userId, content },
      update: { content, submittedAt: new Date() },
    })

    const updated = await prisma.assignment.findUniqueOrThrow({
      where: { id: assignmentId },
      include: { classroom: { select: { id: true, name: true } }, submissions: { where: { studentId: userId } } },
    })
    return { assignment: toStudentAssignment(updated) }
  }

  // Bảng điểm: bài kiểm tra (phòng thi đã tham gia) và bài tập về nhà.
  // Chỉ hiện điểm của những bài giáo viên đã công bố.
  static async getMyGrades(userId: string) {
    const [participants, assignments] = await Promise.all([
      prisma.participant.findMany({
        where: { userId, status: { in: [ParticipantStatus.SUBMITTED, ParticipantStatus.ABSENT] } },
        include: {
          exam: { select: { id: true, title: true, endsAt: true, resultsPublished: true, owner: { select: { displayName: true } } } },
          submission: true,
        },
        orderBy: { joinedAt: 'desc' },
      }),
      prisma.assignment.findMany({
        where: memberOf(userId),
        include: { classroom: { select: { id: true, name: true } }, submissions: { where: { studentId: userId } } },
        orderBy: { createdAt: 'desc' },
      }),
    ])

    const exams = participants.map((p) => {
      const s = p.submission
      const published = p.exam.resultsPublished
      const status =
        p.status === ParticipantStatus.ABSENT || !s
          ? 'ABSENT'
          : !published
            ? 'UNPUBLISHED'
            : s.score === null
              ? 'PENDING_GRADING'
              : 'PUBLISHED'
      return {
        examId: p.exam.id,
        title: p.exam.title,
        teacherName: p.exam.owner.displayName,
        className: p.className,
        date: s?.submittedAt ?? p.exam.endsAt,
        status,
        score: status === 'PUBLISHED' ? s!.score : null,
        maxScore: s?.maxScore ?? 10,
        correctCount: status === 'PUBLISHED' ? s!.correctCount : null,
        totalQuestions: status === 'PUBLISHED' ? s!.totalQuestions : null,
      }
    })

    const homework = assignments.map((a) => {
      const s = a.submissions[0]
      const status = !a.gradesPublished ? 'UNPUBLISHED' : !s ? 'NOT_SUBMITTED' : s.score === null ? 'UNGRADED' : 'PUBLISHED'
      return {
        assignmentId: a.id,
        title: a.title,
        className: a.classroom.name,
        dueAt: a.dueAt,
        submittedAt: s?.submittedAt ?? null,
        status,
        score: status === 'PUBLISHED' ? s!.score : null,
        maxScore: a.maxScore,
        feedback: status === 'PUBLISHED' ? s!.feedback : null,
      }
    })

    return { exams, homework }
  }
}
