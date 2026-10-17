# Đặc tả Sự kiện Thời gian thực (Realtime Events Specification)

- **Công nghệ:** Socket.IO v4
- **Cơ chế xác thực kết nối:** JWT Token thông qua `socket.handshake.auth.token`
- **Chiến lược Room:** Chia theo kỳ thi và vai trò để bảo mật tuyệt đối dữ liệu.

---

## 1. Cơ chế Phân quyền & Phân vùng Kênh (Room Channels)

Mỗi client khi kết nối Socket.IO phải gửi kèm JWT token:
- **Giáo viên:** JWT chứa `sub: userId`, `role: 'TEACHER'`
- **Học sinh:** JWT chứa `sub: participantId`, `role: 'STUDENT'`, `examId`

### Danh sách Room Channels:
1. `exam:${examId}:teacher`
   - **Thành viên:** Chỉ giáo viên sở hữu kỳ thi (`exam.ownerId === user.id`) hoặc Admin.
   - **Mục đích:** Nhận các sự kiện nhạy cảm: học sinh mới xin vào, cảnh báo chuyển tab, học sinh nộp bài.
2. `exam:${examId}:public`
   - **Thành viên:** Tất cả giáo viên và thí sinh đã được duyệt trong phòng thi đó.
   - **Mục đích:** Nhận các thông báo chung: kỳ thi bắt đầu, kỳ thi kết thúc.
3. `participant:${participantId}`
   - **Thành viên:** Duy nhất thí sinh sở hữu ID này.
   - **Mục đích:** Nhận thông báo duyệt (`participant:approved`), từ chối (`participant:rejected`), kết quả bài nộp của riêng thí sinh đó. Tránh rò rỉ thông tin cá nhân ra toàn phòng.

---

## 2. Danh mục Sự kiện Client → Server (Inbound Events)

### 2.1. `exam:subscribe`
- **Mô tả:** Client yêu cầu tham gia room của kỳ thi sau khi socket kết nối thành công.
- **Payload:**
  ```ts
  {
    examId: string
  }
  ```
- **Xác thực Server:**
  - Nếu là Giáo viên: Kiểm tra quyền sở hữu `examId` -> Cho phép join `exam:${examId}:teacher` và `exam:${examId}:public`.
  - Nếu là Thí sinh: Kiểm tra `participant.examId === examId` -> Cho phép join `participant:${participantId}` và `exam:${examId}:public`.
- **Callback / Ack:**
  ```ts
  { ok: boolean; error?: string }
  ```

### 2.2. `proctoring:tab-hidden`
- **Mô tả:** Client học sinh phát hiện sự kiện `visibilitychange` (trang bị ẩn) gửi realtime lên server.
- **Payload:**
  ```ts
  {
    examId: string;
    timestamp: number;
  }
  ```
- **Xử lý Server:** Ghi nhận vào DB `ProctoringEvent` và broadcast tới `exam:${examId}:teacher`.

---

## 3. Danh mục Sự kiện Server → Client (Outbound Events)

### 3.1. Sự kiện quản lý Thí sinh & Duyệt phòng

#### `participant:requested`
- **Kênh phát:** `exam:${examId}:teacher`
- **Ý nghĩa:** Có học sinh mới gửi yêu cầu vào phòng thi.
- **Payload:**
  ```ts
  {
    participantId: string;
    displayName: string;
    className: string;
    status: 'PENDING';
    joinedAt: string; // ISO string
    tabWarnings: number;
  }
  ```

#### `participant:approved`
- **Kênh phát:** `participant:${participantId}` VÀ `exam:${examId}:teacher`
- **Ý nghĩa:** Giáo viên đã phê duyệt yêu cầu của thí sinh. Thí sinh nhận được sự kiện này sẽ kích hoạt nút "Vào làm bài thi".
- **Payload:**
  ```ts
  {
    participantId: string;
    status: 'APPROVED';
    approvedAt: string;
  }
  ```

#### `participant:rejected`
- **Kênh phát:** `participant:${participantId}` VÀ `exam:${examId}:teacher`
- **Ý nghĩa:** Giáo viên từ chối yêu cầu của thí sinh.
- **Payload:**
  ```ts
  {
    participantId: string;
    status: 'REJECTED';
  }
  ```

---

### 3.2. Sự kiện Tiến trình Kỳ thi (Exam Lifecycle)

#### `exam:started`
- **Kênh phát:** `exam:${examId}:public`
- **Ý nghĩa:** Giáo viên chính thức bắt đầu bài thi.
- **Payload:**
  ```ts
  {
    examId: string;
    status: 'ACTIVE';
    startsAt: string; // ISO Date
    endsAt: string;   // ISO Date
    durationSeconds: number;
  }
  ```

#### `exam:ended`
- **Kênh phát:** `exam:${examId}:public`
- **Ý nghĩa:** Kỳ thi đã hết giờ hoặc giáo viên chủ động kết thúc phòng thi.
- **Payload:**
  ```ts
  {
    examId: string;
    status: 'ENDED';
    endedAt: string;
  }
  ```

---

### 3.3. Sự kiện Giám sát & Nộp bài

#### `proctoring:warning`
- **Kênh phát:** `exam:${examId}:teacher`
- **Ý nghĩa:** Báo động thời gian thực cho giáo viên khi có học sinh chuyển tab / ẩn trang.
- **Payload:**
  ```ts
  {
    participantId: string;
    displayName: string;
    tabWarnings: number;
    occurredAt: string;
  }
  ```

#### `participant:submitted`
- **Kênh phát:** `exam:${examId}:teacher`
- **Ý nghĩa:** Cập nhật bảng thí sinh khi học sinh nộp bài thành công.
- **Payload:**
  ```ts
  {
    participantId: string;
    status: 'SUBMITTED';
    score: number;
    submittedAt: string;
  }
  ```

---

## 4. Cơ chế Reconnect và Khôi phục Trạng thái (Resilience)

1. **REST API là Single Source of Truth:**
   - Socket.IO chỉ đóng vai trò kênh truyền tin hiệu tức thời (push notification).
   - Khi mạng bị ngắt kết nối hoặc người dùng tải lại trình duyệt (F5), frontend KHÔNG dựa vào socket để tái tạo trạng thái mà sẽ gọi:
     - Giáo viên: `GET /api/v1/exams/:id/participants`
     - Học sinh: `GET /api/v1/exams/my-status` và `GET /api/v1/submissions/current`
2. **Heartbeat & Tự động kết nối lại:**
   - Socket client cấu hình:
     ```ts
     reconnection: true,
     reconnectionAttempts: 10,
     reconnectionDelay: 1000,
     reconnectionDelayMax: 5000
     ```
   - Khi reconnect thành công, socket tự động phát lại `exam:subscribe` để đăng ký lại vào các room tương ứng.
