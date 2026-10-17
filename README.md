# Examly — Hệ thống Thi Trực tuyến Thời gian thực (Full-stack)

Hệ thống thi trắc nghiệm trực tuyến toàn diện bao gồm **Frontend React + TypeScript + Vite**, **Backend Node.js + Express + TypeScript**, **Cơ sở dữ liệu PostgreSQL + Prisma ORM** và kênh giao tiếp thời gian thực **Socket.IO**.

---

## 1. Kiến trúc & Công nghệ sử dụng

- **Frontend:** React 18, TypeScript (Strict Mode), Vite, Lucide Icons, Socket.IO Client.
- **Backend:** Node.js LTS, Express, TypeScript (Strict Mode), Prisma ORM, Socket.IO.
- **Database:** PostgreSQL (hỗ trợ Docker Container hoặc Cloud PostgreSQL).
- **Bảo mật:** JWT Authentication, RBAC (Teacher / Student / Admin), `bcryptjs`, Rate Limiting (`express-rate-limit`), Helmet, CORS Allowlist, Zod Validation.
- **Kiểm thử:** Vitest + Supertest (Bao phủ 15+ kịch bản nghiệp vụ bắt buộc).

---

## 2. Hướng dẫn Khởi chạy Nhanh

### Cách 1: Khởi chạy bằng Docker Compose (Khuyên dùng cho toàn bộ hệ thống)

Yêu cầu đã cài đặt Docker Desktop:

```bash
# Khởi động PostgreSQL, Backend API và Frontend Nginx
docker compose up -d

# Chạy seed dữ liệu mẫu vào PostgreSQL
docker compose exec backend npx prisma db push
docker compose exec backend npm run db:seed
```

- **Frontend:** [http://localhost:5173](http://localhost:5173)
- **Backend API:** [http://localhost:4000/api/v1/health](http://localhost:4000/api/v1/health)

---

### Cách 2: Khởi chạy thủ công trên máy cục bộ (Local Development)

Yêu cầu: **Node.js LTS (>= 18)** và **PostgreSQL** (cục bộ hoặc Cloud DB như Supabase, Neon, Render).

#### Bước 1: Khởi động Database PostgreSQL
Nếu dùng Docker chạy riêng Postgres:
```bash
cd server
docker compose up -d
```
Hoặc cung cấp chuỗi kết nối vào file `server/.env`:
```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/examly?schema=public"
JWT_SECRET="8f4b62d854ce4e76949b2ecbe36d75b39e248b1d9c3a649666f2cb09dc28b03e"
PORT=4000
FRONTEND_ORIGIN="http://localhost:5173"
```

#### Bước 2: Khởi tạo Database & Seed dữ liệu mẫu
Trong thư mục `server`:
```bash
cd server
npm install
npx prisma generate
npx prisma db push
npm run db:seed
```

#### Bước 3: Khởi chạy Backend API & Socket Server
Trong thư mục `server`:
```bash
npm run dev
```
> Server sẽ lắng nghe tại `http://localhost:4000`

#### Bước 4: Khởi chạy Frontend
Mở một terminal mới ở thư mục gốc của dự án:
```bash
npm install
npm run dev
```
> Mở trình duyệt tại `http://localhost:5173`

---

## 3. Tài khoản Demo & Dữ liệu Mẫu

Sau khi chạy lệnh `npm run db:seed`:
- **Tài khoản Giáo viên:** `teacher@examly.vn`
- **Mật khẩu:** `Password123@`
- **Mã phòng thi mẫu:** `EXAM-101`
- **Đề thi mẫu:** Gồm 5 câu hỏi trắc nghiệm chủ đề HTML & CSS, JavaScript, ReactJS, TypeScript và Web Network (thang điểm 10).

---

## 4. Kiểm thử Tự động (Automated Test Suite)

Dự án bao gồm bộ test toàn diện 17 kiểm thử bao phủ toàn bộ 15 kịch bản:
- Đăng nhập hợp lệ và không hợp lệ.
- Student không thể tạo kỳ thi (RBAC).
- Teacher không thể xem/sửa kỳ thi của người khác.
- Mã phòng không tồn tại.
- Học sinh gửi yêu cầu tham gia phòng (PENDING).
- Chống tạo trùng lặp thí sinh.
- Giáo viên duyệt và từ chối thí sinh.
- Học sinh chưa duyệt không được lấy đề thi.
- Đề thi của học sinh **tuyệt đối không chứa đáp án đúng**.
- Autosave từng câu trả lời và khôi phục khi tải lại trang (F5).
- Chống nộp bài nhiều lần (Idempotency).
- Từ chối lưu bài khi kỳ thi đã hết giờ (TIMEOUT).
- Chấm điểm nguyên tử server-side bằng Transaction ($transaction).
- Giám sát chuyển tab (Proctoring event `TAB_HIDDEN`).

Chạy kiểm thử:
```bash
cd server
npm test
```

---

## 5. Hướng dẫn Thử nghiệm Đồng bộ Realtime (Hai Trình duyệt)

1. **Trình duyệt A (Giáo viên):**
   - Vào `http://localhost:5173` ở chế độ **Giáo viên**.
   - Quan sát mã phòng (ví dụ `EXAM-101`) hoặc nhấn **Tạo phòng thi mới**.
2. **Trình duyệt B (Học sinh - Có thể dùng tab Ẩn danh hoặc máy khác trong mạng LAN):**
   - Vào `http://localhost:5173` ở chế độ **Học sinh**.
   - Nhập Họ tên, Lớp học và Mã phòng thi vừa tạo, bấm **Gửi yêu cầu tham gia**.
3. **Phê duyệt thời gian thực (Socket.IO):**
   - Màn hình Giáo viên (Trình duyệt A) sẽ **tức thời xuất hiện thông báo** và tên học sinh trong bảng chờ duyệt mà không cần tải lại trang.
   - Giáo viên nhấn **Duyệt**.
   - Ngay lập tức, màn hình Học sinh (Trình duyệt B) tự động chuyển sang trạng thái **Đã được duyệt** và nút **Vào làm bài thi** phát sáng.
4. **Làm bài & Giám sát:**
   - Học sinh bắt đầu làm bài trắc nghiệm, mỗi câu chọn đáp án được **Autosave** lên máy chủ.
   - Thử chuyển tab hoặc ẩn trình duyệt: Cảnh báo giám sát xuất hiện và cập nhật số lượt rời trang trên màn hình Giáo viên.
   - Bấm **Nộp bài**: Máy chủ tự động chấm điểm và trả về kết quả chính thức.
