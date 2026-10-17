import { PrismaClient, UserRole, ExamStatus, ParticipantStatus } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { createHash } from 'node:crypto'

const prisma = new PrismaClient()

function hashJoinCode(value: string) {
  return createHash('sha256').update(value.trim().toUpperCase()).digest('hex')
}

export async function seedDatabase() {
  console.log('--- Bắt đầu gieo mầm dữ liệu mẫu (Seeding)... ---')

  // 1. Tạo tài khoản giáo viên demo
  const teacherEmail = 'teacher@examly.vn'
  const passwordHash = await bcrypt.hash('Password123@', 10)

  let teacher = await prisma.user.findUnique({ where: { email: teacherEmail } })
  if (!teacher) {
    teacher = await prisma.user.create({
      data: {
        email: teacherEmail,
        passwordHash,
        displayName: 'Nguyễn Hoàng Anh',
        role: UserRole.TEACHER,
      },
    })
    console.log(`✓ Đã tạo tài khoản giáo viên demo: ${teacher.email}`)
  } else {
    console.log(`ℹ Tài khoản giáo viên demo đã tồn tại: ${teacher.email}`)
  }

  // 2. Tạo phòng thi mẫu EXAM-101
  const examJoinCode = 'EXAM-101'
  const joinCodeHash = hashJoinCode(examJoinCode)

  let exam = await prisma.exam.findUnique({ where: { joinCodeHash } })
  if (!exam) {
    exam = await prisma.exam.create({
      data: {
        ownerId: teacher.id,
        title: 'Kiểm tra kiến thức Front-end',
        description: 'Bài kiểm tra trắc nghiệm kiến thức Web, HTML, CSS, JavaScript, React và TypeScript',
        joinCode: examJoinCode,
        joinCodeHash,
        durationSeconds: 30 * 60,
        status: ExamStatus.WAITING,
      },
    })
    console.log(`✓ Đã tạo phòng thi mẫu: ${exam.title} (${exam.joinCode})`)

    // 3. Tạo 5 câu hỏi mẫu kèm đáp án
    const sampleQuestions = [
      {
        topic: 'HTML & CSS',
        prompt: 'Thẻ HTML nào được dùng để tạo liên kết đến một trang web khác?',
        position: 1,
        options: [
          { text: '<link>', isCorrect: false, position: 0 },
          { text: '<a>', isCorrect: true, position: 1 },
          { text: '<href>', isCorrect: false, position: 2 },
          { text: '<url>', isCorrect: false, position: 3 },
        ],
      },
      {
        topic: 'JavaScript',
        prompt: 'Kiểu dữ liệu nào sau đây biểu diễn giá trị đúng hoặc sai?',
        position: 2,
        options: [
          { text: 'String', isCorrect: false, position: 0 },
          { text: 'Number', isCorrect: false, position: 1 },
          { text: 'Boolean', isCorrect: true, position: 2 },
          { text: 'Object', isCorrect: false, position: 3 },
        ],
      },
      {
        topic: 'ReactJS',
        prompt: 'Hook nào được dùng để quản lý state trong function component?',
        position: 3,
        options: [
          { text: 'useEffect', isCorrect: false, position: 0 },
          { text: 'useMemo', isCorrect: false, position: 1 },
          { text: 'useState', isCorrect: true, position: 2 },
          { text: 'useRef', isCorrect: false, position: 3 },
        ],
      },
      {
        topic: 'TypeScript',
        prompt: 'TypeScript giúp bổ sung điều gì cho JavaScript?',
        position: 4,
        options: [
          { text: 'Kiểu dữ liệu tĩnh', isCorrect: true, position: 0 },
          { text: 'Cơ sở dữ liệu', isCorrect: false, position: 1 },
          { text: 'Máy chủ web', isCorrect: false, position: 2 },
          { text: 'Trình duyệt mới', isCorrect: false, position: 3 },
        ],
      },
      {
        topic: 'Web',
        prompt: 'HTTP status code 404 thường có nghĩa là gì?',
        position: 5,
        options: [
          { text: 'Thành công', isCorrect: false, position: 0 },
          { text: 'Không tìm thấy tài nguyên', isCorrect: true, position: 1 },
          { text: 'Lỗi máy chủ', isCorrect: false, position: 2 },
          { text: 'Chưa xác thực', isCorrect: false, position: 3 },
        ],
      },
    ]

    for (const q of sampleQuestions) {
      await prisma.question.create({
        data: {
          examId: exam.id,
          topic: q.topic,
          prompt: q.prompt,
          position: q.position,
          points: 2.0,
          options: {
            create: q.options,
          },
        },
      })
    }
    console.log(`✓ Đã tạo ${sampleQuestions.length} câu hỏi trắc nghiệm mẫu`)

    // 4. Tạo các thí sinh mẫu ban đầu
    const sampleParticipants = [
      { displayName: 'Nguyễn Minh Anh', className: '12A1', status: ParticipantStatus.APPROVED },
      { displayName: 'Trần Gia Huy', className: '12A2', status: ParticipantStatus.PENDING },
      { displayName: 'Lê Khánh Linh', className: '12A1', status: ParticipantStatus.PENDING },
      { displayName: 'Phạm Đức Long', className: '12A3', status: ParticipantStatus.REJECTED },
    ]

    for (const p of sampleParticipants) {
      await prisma.participant.create({
        data: {
          examId: exam.id,
          displayName: p.displayName,
          className: p.className,
          status: p.status,
          approvedById: p.status === ParticipantStatus.APPROVED ? teacher.id : null,
          approvedAt: p.status === ParticipantStatus.APPROVED ? new Date() : null,
        },
      })
    }
    console.log(`✓ Đã tạo ${sampleParticipants.length} thí sinh mẫu ban đầu`)
  }

  console.log('--- Hoàn tất seeding dữ liệu mẫu! ---')
}

// Chạy trực tiếp nếu gọi từ command line
if (process.argv[1]?.includes('seed.ts')) {
  seedDatabase()
    .catch((e) => {
      console.error('Lỗi khi seed database:', e)
      process.exit(1)
    })
    .finally(async () => {
      await prisma.$disconnect()
    })
}
