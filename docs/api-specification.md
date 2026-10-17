# Đặc tả API Hệ thống Thi Trực tuyến (API Specification)

- **Base URL:** `/api/v1`
- **Content-Type:** `application/json`
- **Authentication:** Bearer JWT Header (`Authorization: Bearer <token>`)

---

## 1. Chuẩn hóa Định dạng Response và Error Code

### Response thành công (chuẩn REST / JSON Object)
```json
{
  "ok": true,
  "data": { ... }
}
```
*(hoặc trả trực tiếp đối tượng tài nguyên đối với các endpoint REST chuẩn)*

### Response thất bại
```json
{
  "error": "ERROR_CODE",
  "message": "Mô tả lỗi dễ hiểu cho người dùng",
  "details": { ... }
}
```

### Mã lỗi chuẩn (Standard Error Codes)
- `VALIDATION_ERROR` (400): Dữ liệu gửi lên không đúng định dạng Zod.
- `UNAUTHORIZED` (401): Thiếu token hoặc token không hợp lệ / hết hạn.
- `FORBIDDEN` (403): Không đủ quyền truy cập tài nguyên (ví dụ giáo viên truy cập đề của giáo viên khác).
- `NOT_FOUND` (404): Không tìm thấy tài nguyên.
- `ROOM_NOT_FOUND` (404): Không tìm thấy mã phòng thi tương ứng.
- `EXAM_CLOSED` (409): Kỳ thi đã kết thúc hoặc bị hủy.
- `INVALID_STATE` (409): Hành động không được phép trong trạng thái hiện tại (ví dụ: thi chưa bắt đầu, hoặc học sinh chưa được duyệt).
- `RATE_LIMIT_EXCEEDED` (429): Gửi quá nhiều yêu cầu trong thời gian ngắn.
- `INTERNAL_SERVER_ERROR` (500): Lỗi máy chủ chưa được kiểm soát.

---

## 2. Authentication & Authorization

### 2.1. Đăng nhập Giáo viên
- **Endpoint:** `POST /api/v1/auth/login`
- **Access:** Public (có Rate Limit)
- **Request Body:**
  ```json
  {
    "email": "teacher@examly.vn",
    "password": "Password123@"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "token": "eyJhbGciOiJIUzI1...",
    "user": {
      "id": "c138b32e-503d-4c31-9ec5-e3d64c9d9685",
      "email": "teacher@examly.vn",
      "displayName": "Thầy Nguyễn Hoàng Anh",
      "role": "TEACHER"
    }
  }
  ```

### 2.2. Lấy thông tin cá nhân (Profile)
- **Endpoint:** `GET /api/v1/auth/me`
- **Access:** Authenticated (Teacher / Admin / Student)
- **Response (200 OK):**
  ```json
  {
    "user": {
      "id": "c138b32e-503d-4c31-9ec5-e3d64c9d9685",
      "email": "teacher@examly.vn",
      "displayName": "Thầy Nguyễn Hoàng Anh",
      "role": "TEACHER"
    }
  }
  ```

---

## 3. Quản lý Kỳ thi & Câu hỏi (Teacher APIs)

### 3.1. Tạo phòng thi mới
- **Endpoint:** `POST /api/v1/exams`
- **Access:** Teacher / Admin
- **Request Body:**
  ```json
  {
    "title": "Kiểm tra kiến thức Front-end",
    "description": "Bài thi giữa kỳ môn Web Development",
    "durationMinutes": 30
  }
  ```
- **Response (201 Created):**
  ```json
  {
    "exam": {
      "id": "e9a0bc98-75c6-43b5-920f-043b3513a968",
      "title": "Kiểm tra kiến thức Front-end",
      "status": "WAITING",
      "durationSeconds": 1800,
      "createdAt": "2026-10-13T20:00:00.000Z"
    },
    "joinCode": "EXAM-101"
  }
  ```

### 3.2. Lấy danh sách kỳ thi của tôi
- **Endpoint:** `GET /api/v1/exams`
- **Access:** Teacher / Admin
- **Response (200 OK):**
  ```json
  {
    "exams": [
      {
        "id": "e9a0bc98-75c6-43b5-920f-043b3513a968",
        "title": "Kiểm tra kiến thức Front-end",
        "status": "WAITING",
        "joinCode": "EXAM-101",
        "durationMinutes": 30,
        "participantCount": 4,
        "createdAt": "2026-10-13T20:00:00.000Z"
      }
    ]
  }
  ```

### 3.3. Xem chi tiết kỳ thi
- **Endpoint:** `GET /api/v1/exams/:examId`
- **Access:** Owner / Admin
- **Response (200 OK):** Thông tin đầy đủ của kỳ thi và số lượng thí sinh.

### 3.4. Bắt đầu kỳ thi
- **Endpoint:** `POST /api/v1/exams/:examId/start`
- **Access:** Owner / Admin
- **Response (200 OK):**
  ```json
  {
    "exam": {
      "id": "e9a0bc98-75c6-43b5-920f-043b3513a968",
      "status": "ACTIVE",
      "startsAt": "2026-10-13T20:15:00.000Z",
      "endsAt": "2026-10-13T20:45:00.000Z",
      "durationSeconds": 1800
    }
  }
  ```

### 3.5. Kết thúc kỳ thi
- **Endpoint:** `POST /api/v1/exams/:examId/finish`
- **Access:** Owner / Admin
- **Response (200 OK):** Chuyển trạng thái sang `ENDED` và tự động chấm các bài thi còn dang dở.

### 3.6. Lấy danh sách câu hỏi đề thi (Kèm đáp án đúng cho Giáo viên)
- **Endpoint:** `GET /api/v1/exams/:examId/questions`
- **Access:** Owner / Admin
- **Response (200 OK):** Danh sách các câu hỏi, các lựa chọn và cờ `isCorrect`.

### 3.7. Tạo / Cập nhật câu hỏi
- **Endpoint:** `POST /api/v1/exams/:examId/questions`
- **Access:** Owner / Admin
- **Request Body:**
  ```json
  {
    "topic": "ReactJS",
    "prompt": "Hook nào được dùng để quản lý state trong function component?",
    "points": 2,
    "position": 1,
    "options": [
      { "text": "useEffect", "isCorrect": false, "position": 0 },
      { "text": "useMemo", "isCorrect": false, "position": 1 },
      { "text": "useState", "isCorrect": true, "position": 2 },
      { "text": "useRef", "isCorrect": false, "position": 3 }
    ]
  }
  ```

---

## 4. Quản lý Thí sinh & Duyệt (Participant Approval APIs)

### 4.1. Lấy danh sách thí sinh trong phòng
- **Endpoint:** `GET /api/v1/exams/:examId/participants`
- **Access:** Owner / Admin
- **Response (200 OK):**
  ```json
  {
    "participants": [
      {
        "id": "p-1",
        "displayName": "Nguyễn Minh Anh",
        "className": "12A1",
        "status": "APPROVED",
        "joinedAt": "2026-10-13T20:05:00.000Z",
        "tabWarnings": 0,
        "score": null
      }
    ]
  }
  ```

### 4.2. Giáo viên duyệt / từ chối thí sinh
- **Endpoint:** `POST /api/v1/exams/:examId/participants/:participantId/decision`
- **Access:** Owner / Admin
- **Request Body:**
  ```json
  {
    "decision": "APPROVED" // hoặc "REJECTED" | "RESET"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "participant": {
      "id": "p-1",
      "status": "APPROVED",
      "approvedAt": "2026-10-13T20:10:00.000Z"
    }
  }
  ```

---

## 5. Thí sinh Tham gia & Làm bài (Student APIs)

### 5.1. Học sinh gửi yêu cầu vào phòng thi
- **Endpoint:** `POST /api/v1/exams/join`
- **Access:** Public (có Rate Limit)
- **Request Body:**
  ```json
  {
    "joinCode": "EXAM-101",
    "displayName": "Nguyễn Minh Anh",
    "className": "12A1"
  }
  ```
- **Response (201 Created):**
  ```json
  {
    "participantToken": "eyJhbGciOiJIUzI1...",
    "participant": {
      "id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
      "examId": "e9a0bc98-75c6-43b5-920f-043b3513a968",
      "displayName": "Nguyễn Minh Anh",
      "className": "12A1",
      "status": "PENDING"
    },
    "exam": {
      "title": "Kiểm tra kiến thức Front-end",
      "status": "WAITING",
      "durationMinutes": 30
    }
  }
  ```

### 5.2. Kiểm tra trạng thái duyệt của thí sinh
- **Endpoint:** `GET /api/v1/exams/my-status`
- **Access:** Authenticated (Student `participantToken`)
- **Response (200 OK):**
  ```json
  {
    "participant": {
      "id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
      "status": "APPROVED",
      "examStatus": "ACTIVE",
      "startsAt": "2026-10-13T20:15:00.000Z",
      "endsAt": "2026-10-13T20:45:00.000Z",
      "secondsRemaining": 1780
    }
  }
  ```

### 5.3. Lấy đề thi cho Thí sinh (TUYỆT ĐỐI KHÔNG TRẢ ĐÁP ÁN ĐÚNG)
- **Endpoint:** `GET /api/v1/exams/:examId/student-questions`
- **Access:** Authenticated (Chỉ cho phép khi `participant.status === 'APPROVED'`)
- **Response (200 OK):**
  ```json
  {
    "questions": [
      {
        "id": "q-1",
        "topic": "ReactJS",
        "prompt": "Hook nào được dùng để quản lý state trong function component?",
        "points": 1,
        "position": 1,
        "options": [
          { "id": "opt-1", "text": "useEffect", "position": 0 },
          { "id": "opt-2", "text": "useMemo", "position": 1 },
          { "id": "opt-3", "text": "useState", "position": 2 },
          { "id": "opt-4", "text": "useRef", "position": 3 }
        ]
      }
    ]
  }
  ```

### 5.4. Lấy bài làm hiện tại (Autosave Recovery)
- **Endpoint:** `GET /api/v1/submissions/current`
- **Access:** Authenticated Student
- **Response (200 OK):**
  ```json
  {
    "answers": {
      "q-1": "opt-3"
    },
    "submitted": false,
    "secondsRemaining": 1540
  }
  ```

### 5.5. Autosave đáp án từng câu
- **Endpoint:** `PUT /api/v1/submissions/current/answers/:questionId`
- **Access:** Authenticated Student
- **Request Body:**
  ```json
  {
    "selectedOptionId": "opt-3"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "saved": true,
    "savedAt": "2026-10-13T20:20:15.000Z"
  }
  ```

### 5.6. Nộp bài thi & Chấm điểm
- **Endpoint:** `POST /api/v1/submissions/current/submit`
- **Access:** Authenticated Student
- **Request Body:**
  ```json
  {
    "reason": "MANUAL" // hoặc "TIMEOUT"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "submission": {
      "id": "sub-1",
      "status": "SUBMITTED",
      "submittedAt": "2026-10-13T20:35:10.000Z",
      "score": 8.0,
      "maxScore": 10.0,
      "correctAnswers": 4,
      "totalQuestions": 5
    }
  }
  ```

---

## 6. Giám sát & Proctoring APIs

### 6.1. Ghi nhận sự kiện rời màn hình (Tab Hidden)
- **Endpoint:** `POST /api/v1/proctoring/events`
- **Access:** Authenticated Student
- **Request Body:**
  ```json
  {
    "eventType": "TAB_HIDDEN",
    "metadata": {
      "userAgent": "Mozilla/5.0 ...",
      "timestamp": 1791901200000
    }
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "ok": true,
    "tabWarnings": 1
  }
  ```
