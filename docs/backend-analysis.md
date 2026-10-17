# Báo cáo khảo sát Source Code & Phân tích nghiệp vụ Backend (Phase 1)

## 1. Tổng quan cấu trúc Repository

Repository hiện tại bao gồm hai phần chính:
- **Frontend (Gốc):** React 18, Vite 6, TypeScript, Lucide React, cấu trúc CSS tùy biến (`src/styles.css`). Toàn bộ giao diện và luồng điều khiển đang tập trung trong `src/App.tsx`.
- **Backend Scaffold (`server/`):** Node.js LTS, Express 4, TypeScript (`tsx`), Prisma 6, PostgreSQL, Socket.IO 4, Argon2, JWT, Zod. Hiện mới chỉ có khung ban đầu tại `server/src/index.ts` và schema tại `server/prisma/schema.prisma`.

---

## 2. Khảo sát chi tiết Frontend (`src/App.tsx`)

### 2.1. Các vai trò và màn hình (Views)
Ứng dụng sử dụng state `role` (`'teacher' | 'student'`) và `page`:

| Vai trò | `page` | Mô tả màn hình | Trạng thái & hành vi |
| :--- | :--- | :--- | :--- |
| **Teacher** | `dashboard` | Bảng điều khiển quản lý kỳ thi | - Hiển thị 4 thẻ thống kê: Tổng thí sinh, Chờ duyệt, Đã duyệt, Đã nộp bài.<br/>- Thẻ phòng thi: Tên phòng, Mã phòng (EXAM-xxx), Trạng thái (waiting/active/ended), Thời lượng.<br/>- Danh sách hoạt động gần đây (live alerts).<br/>- Bảng học sinh: Xem danh sách, Duyệt (`approved`), Từ chối (`rejected`), Duyệt lại.<br/>- Modal tạo phòng thi: Tên phòng, chọn thời lượng (15, 30, 45, 60 phút). |
| **Student** | `join` | Màn hình nhập thông tin tham gia | - Nhập Họ và tên, Lớp học, Mã phòng thi.<br/>- Gửi yêu cầu tham gia (chuyển sang `waiting`). |
| **Student** | `waiting` | Phòng chờ duyệt | - Kiểm tra trạng thái học sinh: `pending` (đang chờ), `approved` (đã duyệt), `rejected` (từ chối).<br/>- Khi đã duyệt: Nút "Vào làm bài thi" kích hoạt chuyển sang `exam`. |
| **Student** | `exam` | Phòng làm bài thi trắc nghiệm | - Thanh header: Mã phòng, Tên phòng, Đồng hồ đếm ngược (`secondsLeft`).<br/>- Tiến độ bài làm (số câu đã chọn / tổng số câu).<br/>- Cảnh báo giám sát (`tabWarning`) khi trang bị ẩn (`visibilitychange`).<br/>- Cột điều hướng câu hỏi (1..N) với trạng thái: Đang xem, Đã trả lời, Chưa làm.<br/>- Thẻ câu hỏi: Chủ đề, nội dung câu hỏi, danh sách 4 lựa chọn (A, B, C, D).<br/>- Chuyển câu (Trước / Sau), Nút "Kiểm tra & Nộp bài".<br/>- Modal xác nhận nộp bài. |
| **Student** | `result` | Màn hình kết quả | - Hiển thị điểm số (thang điểm 10).<br/>- Số câu trả lời đúng / tổng số câu.<br/>- Tổng số lượt rời trang (tab warnings).<br/>- Nút quay lại trang tham gia. |

### 2.2. Các dữ liệu đang lưu trong `localStorage` & React State

1. **`exam-room` (`Room`):**
   ```ts
   { name: string; code: string; duration: number; status: 'waiting' | 'active' | 'ended'; createdAt: string }
   ```
2. **`exam-students` (`Student[]`):**
   ```ts
   { id: string; name: string; className: string; roomCode: string; status: 'pending' | 'approved' | 'rejected' | 'submitted'; joinedAt: string; tabWarnings: number; score?: number }
   ```
3. **`exam-current-student` (`string`):**
   Lưu ID của học sinh đang mở phiên trên trình duyệt.
4. **`exam-answers` (`Record<number, number>`):**
   Lưu cặp `[questionId]: selectedOptionIndex` trên client.

### 2.3. Dữ liệu Mock hiện có
- `initialQuestions`: 5 câu hỏi trắc nghiệm chuyên đề HTML, JS, React, TypeScript, HTTP. Mỗi câu có 4 đáp án dạng mảng chuỗi `options: string[]` và `answer: number` (vị trí đáp án đúng: 0, 1, 2...).
- `initialRoom`: Phòng mặc định `EXAM-101`, 30 phút.
- `initialStudents`: 4 học sinh mẫu (`Nguyễn Minh Anh`, `Trần Gia Huy`, `Lê Khánh Linh`, `Phạm Đức Long`).

---

## 3. Bảng Mapping giữa Frontend Models, API và Database

| Khái niệm nghiệp vụ | Frontend Model (`App.tsx`) | Database Model (`schema.prisma`) | API Request / Response Mapping |
| :--- | :--- | :--- | :--- |
| **Người dùng Giáo viên** | Role `'teacher'` (hardcoded 'Nguyễn Hoàng Anh') | `User` (role: `TEACHER`, email, passwordHash) | `POST /api/v1/auth/login` -> `{ token, user }` |
| **Kỳ thi / Phòng thi** | `Room` (`name`, `code`, `duration`, `status`) | `Exam` (`title`, `joinCode`, `joinCodeHash`, `durationSeconds`, `status`) | `POST /api/v1/exams`, `GET /api/v1/exams/:id` |
| **Học sinh / Thí sinh** | `Student` (`id`, `name`, `className`, `status`, `tabWarnings`, `score`) | `Participant` (`id`, `displayName`, `className`, `status`) + quan hệ `Submission` | `POST /api/v1/exams/join` -> `{ participantToken, participant }` |
| **Câu hỏi** | `Question` (`id`, `topic`, `text`, `options: string[]`, `answer: number`) | `Question` (`prompt`, `topic`, `position`, `points`) + `Option[]` (`text`, `position`, `isCorrect`) | `GET /api/v1/exams/:id/student-questions` (đã giấu `isCorrect`), `GET /api/v1/exams/:id/questions` (cho GV) |
| **Đáp án học sinh** | `answers: Record<number, number>` | `Answer` (`participantId`, `questionId`, `selectedOptionId`) | `PUT /api/v1/submissions/current/answers/:questionId` |
| **Bài nộp & Điểm số** | `Student.score`, `page === 'result'` | `Submission` (`score`, `reason`, `submittedAt`, `gradedAt`) | `POST /api/v1/submissions/current/submit` -> `{ score, maxScore }` |
| **Giám sát chuyển tab** | `Student.tabWarnings`, `tabWarning` | `ProctoringEvent` (`eventType: 'TAB_HIDDEN'`, `metadata`) | `POST /api/v1/proctoring/events` |

---

## 4. Các điểm chưa rõ trong nghiệp vụ và Quyết định kỹ thuật (Assumptions)

1. **Cơ chế xác thực Học sinh (Guest vs Account):**
   - *Khảo sát:* Frontend cho phép học sinh chỉ cần nhập Họ tên + Lớp + Mã phòng thi mà không cần đăng ký tài khoản trước.
   - *Quyết định:* Giữ nguyên trải nghiệm mượt mà này của frontend. Khi học sinh gọi `POST /api/v1/exams/join`, backend kiểm tra mã phòng, tạo bản ghi `Participant` và ký một JWT chuyên biệt: `participantToken` (chứa `sub: participantId`, `role: 'STUDENT'`, `examId`). Token này được lưu an toàn trong sessionStorage/localStorage của thí sinh để xác thực mọi request làm bài, nộp bài và socket connection.
2. **Bảo mật đề thi & chống lộ đáp án:**
   - *Quyết định:* API lấy đề cho học sinh (`/student-questions`) tuyệt đối không trả trường `isCorrect`. Việc chấm điểm hoàn toàn thực hiện tại server trong transaction khi nộp bài.
3. **Thời gian thi và đồng hồ đếm ngược:**
   - *Khảo sát:* Client đang dùng `duration * 60` và đếm lùi bằng `setInterval`.
   - *Quyết định:* Khi giáo viên bắt đầu kỳ thi (`POST /api/v1/exams/:id/start`), server thiết lập `startsAt = now()` và `endsAt = now() + durationSeconds`. Client nhận `endsAt` và tính `Math.max(0, Math.floor((endsAt - Date.now()) / 1000))`. Khi hết giờ, server từ chối nhận thêm đáp án và tự động chốt bài thi với lý do `TIMEOUT`.
4. **Tránh gian lận client-side:**
   - Không cho phép client gửi điểm (`score`).
   - Mọi thao tác duyệt/từ chối đều phải xác thực JWT của giáo viên và kiểm tra quyền sở hữu kỳ thi (`exam.ownerId === req.user.sub`).
   - Rate limit cho việc gửi sự kiện `TAB_HIDDEN` để tránh spam DDoS từ client.

---

## 5. Danh sách các API cần thiết thay thế Mock Data

1. **Auth & Profile:**
   - `POST /api/v1/auth/login`
   - `POST /api/v1/auth/register` (hạt giống hoặc đăng ký giáo viên)
   - `GET /api/v1/auth/me`
2. **Kỳ thi & Quản lý đề (Teacher):**
   - `GET /api/v1/exams`
   - `POST /api/v1/exams`
   - `GET /api/v1/exams/:id`
   - `PATCH /api/v1/exams/:id`
   - `POST /api/v1/exams/:id/start`
   - `POST /api/v1/exams/:id/finish`
   - `GET /api/v1/exams/:id/questions` (đầy đủ đáp án đúng)
   - `POST /api/v1/exams/:id/questions`
   - `GET /api/v1/exams/:id/participants`
   - `POST /api/v1/exams/:id/participants/:participantId/decision`
   - `GET /api/v1/exams/:id/results`
3. **Thí sinh & Làm bài (Student):**
   - `POST /api/v1/exams/join`
   - `GET /api/v1/exams/my-status`
   - `GET /api/v1/exams/:id/student-questions` (đã giấu đáp án đúng)
   - `GET /api/v1/submissions/current` (lấy danh sách đáp án đã lưu phục vụ khôi phục khi tải lại trang)
   - `PUT /api/v1/submissions/current/answers/:questionId` (autosave từng câu)
   - `POST /api/v1/submissions/current/submit` (nộp bài & chấm điểm)
   - `POST /api/v1/proctoring/events` (ghi nhận chuyển tab)
