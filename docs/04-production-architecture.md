# 4. Kiến trúc nâng cấp production

## 4.1. Stack đề xuất
- **Frontend:** React + TypeScript + Vite (giữ stack demo); React Router; TanStack Query cho server state; React Hook Form + Zod cho form; Socket.IO client cho realtime.
- **Backend:** Node.js + TypeScript + Express hoặc Fastify; REST API; Socket.IO.
- **Database:** PostgreSQL + Prisma ORM; migration được version-control.
- **Cache/rate limit/scale:** Redis khi cần scale nhiều backend instances hoặc quản lý session/rate limits; Socket.IO Redis adapter cho broadcast giữa instances.
- **Deploy:** Docker; frontend static hosting/CDN; backend container; managed PostgreSQL; HTTPS; CI/CD.

Đây là khuyến nghị kiến trúc, không phải nội dung đã có trong tài liệu demo. Có thể thay Express/Prisma/Redis theo hạ tầng và năng lực đội ngũ.

## 4.2. Sơ đồ luồng

```text
Browser (Teacher / Student)
  ├── HTTPS REST API ──────────────┐
  └── Authenticated Socket.IO ─────┤
                                   ▼
                           API / Realtime Server
                           ├── Auth + RBAC
                           ├── Exam state machine
                           ├── Validation + rate limit
                           ├── Submission / grading service
                           └── Event publisher
                                   │
                                   ▼
                              PostgreSQL
                                   │
                         optional Redis adapter/cache
```

## 4.3. Mô hình dữ liệu tối thiểu

### `users`
- `id` UUID PK
- `email` unique nullable nếu hỗ trợ đăng nhập bằng email
- `password_hash` nullable nếu dùng SSO
- `display_name`
- `role` enum `TEACHER | STUDENT | ADMIN`
- `created_at`, `updated_at`

### `exams`
- `id` UUID PK
- `owner_id` FK users
- `title`, `description`
- `join_code_hash` hoặc mã phòng được sinh đủ ngẫu nhiên; tránh log mã nếu không cần
- `status` enum `DRAFT | WAITING | SCHEDULED | ACTIVE | ENDED | CANCELLED`
- `duration_seconds`, `starts_at`, `ends_at`
- `created_at`, `updated_at`

### `questions`
- `id` UUID PK, `exam_id` FK
- `type` (MVP: `SINGLE_CHOICE`)
- `prompt`, `position`, `points`
- `options` lưu thành bảng riêng nếu cần quản lý/trộn tốt
- `correct_option_id` chỉ được server dùng khi chấm; không gửi cho học sinh trước thời điểm cho phép

### `participants`
- `id` UUID PK, `exam_id` FK, `user_id` nullable FK
- `display_name`, `class_name`
- `status` enum `PENDING | APPROVED | REJECTED | IN_PROGRESS | SUBMITTED | ABSENT`
- `approved_by`, `approved_at`, `joined_at`
- unique constraint phù hợp để tránh đăng ký trùng cùng một kỳ thi

### `answers`
- `id` UUID PK, `participant_id` FK, `question_id` FK
- `selected_option_id` nullable
- `answer_text` nullable nếu bổ sung tự luận
- `saved_at`, `version`
- unique `(participant_id, question_id)`; upsert có kiểm tra participant còn được làm bài

### `submissions`
- `id` UUID PK, `participant_id` unique FK
- `submitted_at`, `submit_reason` (`MANUAL | TIMEOUT`), `score`, `graded_at`
- điểm được backend tính từ answers và answer key

### `proctoring_events` và `audit_logs`
- `id`, `exam_id`, `participant_id` nullable, `actor_id` nullable
- `event_type`, `occurred_at`, `metadata` JSON hạn chế dữ liệu
- Không coi event `TAB_HIDDEN` là bằng chứng độc lập của gian lận.
- Đặt retention period và quyền xem/xóa phù hợp chính sách riêng tư.

## 4.4. REST API đề xuất

### Auth
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`

### Giáo viên
- `POST /api/v1/exams` — tạo kỳ thi
- `GET /api/v1/exams` — kỳ thi thuộc quyền giáo viên
- `GET /api/v1/exams/:examId`
- `PATCH /api/v1/exams/:examId` — chỉ khi trạng thái cho phép
- `POST /api/v1/exams/:examId/start`
- `POST /api/v1/exams/:examId/end`
- `GET /api/v1/exams/:examId/participants`
- `POST /api/v1/exams/:examId/participants/:participantId/approve`
- `POST /api/v1/exams/:examId/participants/:participantId/reject`
- `GET /api/v1/exams/:examId/results`

### Học sinh
- `POST /api/v1/exams/join` — gửi join code và thông tin cần thiết
- `GET /api/v1/exams/:examId/my-participation`
- `GET /api/v1/exams/:examId/questions` — chỉ trả nội dung được phép, không lộ đáp án
- `PUT /api/v1/exams/:examId/answers/:questionId` — autosave idempotent
- `POST /api/v1/exams/:examId/submit` — submit idempotent
- `POST /api/v1/exams/:examId/proctoring-events` — event đã validate/rate-limit

API cần envelope lỗi nhất quán, pagination cho danh sách dài, validation schema và correlation/request ID.

## 4.5. Socket.IO events

**Client → server**
- `exam:join` — server xác thực token và quyền tham gia trước khi thêm socket vào room.
- `participant:heartbeat` — chỉ khi cần trạng thái kết nối.

**Server → client**
- `participant:requested`
- `participant:approved`
- `participant:rejected`
- `exam:started`
- `exam:ended`
- `participant:submitted`
- `proctoring:event-recorded`

Không dùng socket làm nơi lưu dữ liệu duy nhất. REST/database là nguồn sự thật; sau reconnect client tải snapshot qua API để đồng bộ event bị bỏ lỡ.

## 4.6. Quy tắc thời gian và nộp bài
- Khi bắt đầu thi, server ghi `starts_at` và `ends_at`.
- Client hiển thị thời gian còn lại dựa trên `ends_at` do server trả về; không tin giờ hệ điều hành của client.
- Mỗi request save/submit kiểm tra trạng thái exam và thời điểm server.
- Submit là idempotent: request lặp không tạo nhiều bài nộp.
- Khi timeout, server đóng bài theo một job hoặc kiểm tra nhất quán trong request; không dựa vào `setTimeout` ở trình duyệt.
- Tính điểm tại server trong transaction hoặc job tin cậy.

## 4.7. Bảo mật tối thiểu
- HTTPS bắt buộc ở production.
- Auth bằng session cookie `HttpOnly`, `Secure`, `SameSite` hoặc token strategy được đánh giá; tránh lưu bearer token dài hạn trong localStorage.
- RBAC và kiểm tra ownership/resource-level trên từng endpoint.
- Hash password bằng Argon2id hoặc bcrypt với cấu hình phù hợp; không tự thiết kế thuật toán hash.
- Rate limit login, join-code attempts, autosave và event endpoints.
- CORS allowlist, CSRF protection nếu dùng cookie, input validation, output encoding.
- Không trả answer key cho client trước thời điểm được phép.
- Không tin điểm, role, participant status hay exam timer từ payload client.
- Secrets trong secret manager/env; có backup, rotation và quy trình incident response.
- Audit các hành động quan trọng; log không chứa mật khẩu, session token hoặc thông tin cá nhân không cần thiết.

## 4.8. Kiểm thử và vận hành
- Unit: chuyển trạng thái kỳ thi, tính điểm, quy tắc hết giờ.
- Integration: authorization, join/approve, save answer, submit idempotent.
- E2E: giáo viên mở phòng → học sinh tham gia → duyệt → làm bài → nộp → xem kết quả.
- Security: truy cập chéo examId, giả mạo participantId, sửa score, lộ đáp án, spam join code.
- Load: số thí sinh đồng thời, autosave burst, socket reconnect.
- Observability: structured logs, error tracking, API latency, DB pool, socket count, submit failures.
- Backups: kiểm tra khôi phục định kỳ, không chỉ kiểm tra job backup chạy thành công.

## 4.9. Những quyết định cần xác nhận trước production
1. Có cần đăng nhập tài khoản học sinh hay chỉ mã dự thi?
2. Mục tiêu số thí sinh đồng thời và số kỳ thi đồng thời?
3. Có cần câu tự luận, ảnh/file, trộn đề, chấm thủ công?
4. Kết quả có hiển thị ngay hay chờ giáo viên công bố?
5. Thời hạn lưu thông tin học sinh và log giám sát?
6. Hạ tầng triển khai, ngân sách, miền và đơn vị vận hành?
