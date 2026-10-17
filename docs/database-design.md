# Thiết kế Cơ sở dữ liệu (Database Design & Prisma Schema)

- **Database Engine:** PostgreSQL 15+
- **ORM:** Prisma Client & Prisma Migrate
- **Character Encoding:** UTF-8
- **Timezone:** UTC

---

## 1. Sơ đồ Quan hệ Thực thể (Entity Relationship Overview)

```text
[User] (Teacher/Admin)
   │ 1
   │ 
   ├── N ── [Exam]
   │          │ 1
   │          ├── N ── [Question]
   │          │           │ 1
   │          │           ├── N ── [Option]
   │          │           │          │ 1
   │          │           │          ├── (N) ── [Answer]
   │          │           └── (1) ───────────────┘
   │          │
   │          ├── N ── [Participant]
   │          │           │ 1
   │          │           ├── 1 ── [Submission]
   │          │           ├── N ── [Answer]
   │          │           └── N ── [ProctoringEvent]
   │          │
   │          ├── N ── [ProctoringEvent]
   │          └── N ── [AuditLog]
```

---

## 2. Chi tiết các Bảng và Thuộc tính

### 2.1. Bảng `users`
Lưu trữ thông tin tài khoản Giáo viên, Quản trị viên (và Học sinh nếu có tài khoản):
- `id`: UUID (Primary Key, default uuidv4)
- `email`: VARCHAR(255) UNIQUE NOT NULL (Index)
- `password_hash`: VARCHAR(255) NOT NULL (Argon2id hoặc bcrypt)
- `display_name`: VARCHAR(120) NOT NULL
- `role`: ENUM (`TEACHER`, `STUDENT`, `ADMIN`) DEFAULT `TEACHER`
- `created_at`: TIMESTAMPTZ DEFAULT NOW()
- `updated_at`: TIMESTAMPTZ (auto update)

### 2.2. Bảng `exams`
Quản lý các phòng thi / kỳ thi do giáo viên tạo:
- `id`: UUID (Primary Key)
- `owner_id`: UUID NOT NULL REFERENCES `users(id)` ON DELETE CASCADE
- `title`: VARCHAR(160) NOT NULL
- `description`: TEXT NULL
- `join_code`: VARCHAR(32) NOT NULL (vd: `EXAM-101`)
- `join_code_hash`: VARCHAR(64) UNIQUE NOT NULL (SHA-256 hash để lookup nhanh)
- `status`: ENUM (`DRAFT`, `WAITING`, `SCHEDULED`, `ACTIVE`, `ENDED`, `CANCELLED`) DEFAULT `WAITING`
- `duration_seconds`: INT NOT NULL (tính bằng giây, vd: 1800 cho 30 phút)
- `starts_at`: TIMESTAMPTZ NULL
- `ends_at`: TIMESTAMPTZ NULL
- `created_at`: TIMESTAMPTZ DEFAULT NOW()
- `updated_at`: TIMESTAMPTZ
- **Indexes:**
  - `@@index([owner_id, status])`
  - `@@index([status])`
  - `@@unique([join_code_hash])`

### 2.3. Bảng `questions`
Các câu hỏi trắc nghiệm trong kỳ thi:
- `id`: UUID (Primary Key)
- `exam_id`: UUID NOT NULL REFERENCES `exams(id)` ON DELETE CASCADE
- `topic`: VARCHAR(80) NOT NULL DEFAULT 'Tổng hợp'
- `prompt`: TEXT NOT NULL (Nội dung câu hỏi)
- `position`: INT NOT NULL (Thứ tự câu hỏi trong đề: 1, 2, 3...)
- `points`: FLOAT NOT NULL DEFAULT 1.0 (Điểm số của câu)
- `created_at`: TIMESTAMPTZ DEFAULT NOW()
- **Constraints & Indexes:**
  - `@@unique([exam_id, position])`
  - `@@index([exam_id])`

### 2.4. Bảng `options`
Các phương án trả lời cho từng câu hỏi:
- `id`: UUID (Primary Key)
- `question_id`: UUID NOT NULL REFERENCES `questions(id)` ON DELETE CASCADE
- `text`: TEXT NOT NULL (Nội dung đáp án A, B, C, D)
- `position`: INT NOT NULL (0, 1, 2, 3...)
- `is_correct`: BOOLEAN NOT NULL DEFAULT FALSE (Chỉ server được đọc khi chấm điểm, không bao giờ lộ cho học sinh)
- **Constraints & Indexes:**
  - `@@unique([question_id, position])`

### 2.5. Bảng `participants`
Thí sinh tham gia phòng thi:
- `id`: UUID (Primary Key)
- `exam_id`: UUID NOT NULL REFERENCES `exams(id)` ON DELETE CASCADE
- `user_id`: UUID NULL REFERENCES `users(id)` ON DELETE SET NULL (NULL nếu là khách guest)
- `display_name`: VARCHAR(120) NOT NULL (Họ và tên thí sinh)
- `class_name`: VARCHAR(60) NOT NULL (Lớp học, vd: 12A1)
- `status`: ENUM (`PENDING`, `APPROVED`, `REJECTED`, `IN_PROGRESS`, `SUBMITTED`, `ABSENT`) DEFAULT `PENDING`
- `approved_by_id`: UUID NULL REFERENCES `users(id)` ON DELETE SET NULL
- `approved_at`: TIMESTAMPTZ NULL
- `joined_at`: TIMESTAMPTZ DEFAULT NOW()
- **Constraints & Indexes:**
  - `@@index([exam_id, status])`
  - `@@index([exam_id, joined_at])`

### 2.6. Bảng `answers`
Các câu trả lời của thí sinh (phục vụ autosave và khôi phục khi tải lại trang):
- `id`: UUID (Primary Key)
- `participant_id`: UUID NOT NULL REFERENCES `participants(id)` ON DELETE CASCADE
- `question_id`: UUID NOT NULL REFERENCES `questions(id)` ON DELETE CASCADE
- `selected_option_id`: UUID NULL REFERENCES `options(id)` ON DELETE SET NULL
- `saved_at`: TIMESTAMPTZ DEFAULT NOW() (auto update)
- **Constraints & Indexes:**
  - `@@unique([participant_id, question_id])` (Đảm bảo mỗi câu chỉ có 1 bản ghi đáp án, upsert dễ dàng)

### 2.7. Bảng `submissions`
Lưu trữ kết quả nộp bài và chấm điểm chính thức:
- `id`: UUID (Primary Key)
- `participant_id`: UUID UNIQUE NOT NULL REFERENCES `participants(id)` ON DELETE CASCADE
- `exam_id`: UUID NOT NULL REFERENCES `exams(id)` ON DELETE CASCADE
- `submitted_at`: TIMESTAMPTZ DEFAULT NOW()
- `reason`: ENUM (`MANUAL`, `TIMEOUT`) DEFAULT `MANUAL`
- `score`: FLOAT NULL (Điểm số chính thức do server tính)
- `max_score`: FLOAT NOT NULL DEFAULT 10.0
- `correct_count`: INT NOT NULL DEFAULT 0
- `total_questions`: INT NOT NULL DEFAULT 0
- `graded_at`: TIMESTAMPTZ NULL
- **Constraints & Indexes:**
  - `@@unique([participant_id])` (Mỗi thí sinh chỉ có tối đa 1 bản ghi nộp bài)
  - `@@index([exam_id, submitted_at])`

### 2.8. Bảng `proctoring_events`
Lưu nhật ký giám sát (rời trang, ẩn tab):
- `id`: UUID (Primary Key)
- `exam_id`: UUID NOT NULL REFERENCES `exams(id)` ON DELETE CASCADE
- `participant_id`: UUID NULL REFERENCES `participants(id)` ON DELETE SET NULL
- `event_type`: VARCHAR(50) NOT NULL (vd: `TAB_HIDDEN`, `TAB_VISIBLE`)
- `occurred_at`: TIMESTAMPTZ DEFAULT NOW()
- `metadata`: JSONB NULL
- **Indexes:**
  - `@@index([exam_id, occurredAt])`
  - `@@index([participant_id])`

### 2.9. Bảng `audit_logs`
Ghi vết các hành động quan trọng của hệ thống (tạo đề, duyệt thí sinh, nộp bài):
- `id`: UUID (Primary Key)
- `exam_id`: UUID NULL REFERENCES `exams(id)` ON DELETE SET NULL
- `actor_id`: VARCHAR(64) NULL (User ID hoặc Participant ID)
- `action`: VARCHAR(100) NOT NULL (vd: `EXAM_CREATED`, `PARTICIPANT_APPROVED`, `EXAM_SUBMITTED`)
- `metadata`: JSONB NULL
- `created_at`: TIMESTAMPTZ DEFAULT NOW()
- **Indexes:**
  - `@@index([exam_id, createdAt])`

---

## 3. Quy tắc Bảo mật và Toàn vẹn Dữ liệu (Integrity & Security Rules)

1. **Transaction khi Nộp bài & Chấm điểm (`$transaction`):**
   - Đọc toàn bộ câu hỏi và đáp án đúng (`options.is_correct = true`).
   - Đọc các câu trả lời của thí sinh từ bảng `answers`.
   - Tính tổng số câu đúng và quy đổi ra thang điểm 10.
   - Tạo bản ghi `submissions` và cập nhật `participants.status = 'SUBMITTED'`.
   - Mọi thao tác này thực hiện trong một Atomic Transaction duy nhất để chống race condition.
2. **Khóa chống sửa bài thi đã nộp:**
   - Khi `participant.status === 'SUBMITTED'`, API `PUT /answers` sẽ từ chối ngay lập tức với mã lỗi `409 INVALID_STATE`.
3. **Mã phòng thi an toàn:**
   - Mã phòng `joinCode` được lưu kèm một chuỗi băm SHA-256 (`joinCodeHash`). Tìm kiếm phòng thi bằng hash để tối ưu hiệu năng và an toàn index.
