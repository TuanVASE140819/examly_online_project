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

## 3. Tài khoản & Dữ liệu Mẫu

Mọi người dùng phải **đăng nhập** trước; vai trò (Giáo viên / Học sinh) được xác định từ tài khoản. Có thể tự tạo tài khoản ở tab **Đăng ký** trên màn hình đăng nhập (chọn vai trò Giáo viên hoặc Học sinh).

Sau khi chạy lệnh `npm run db:seed` sẽ có sẵn (mật khẩu chung `Password123@`):
- **Giáo viên:** `teacher@examly.vn`
- **Học sinh:** `student@examly.vn`, `student2@examly.vn`
- **Phòng thi mẫu:** `EXAM-101` (thuộc `teacher@examly.vn`) gồm 5 câu hỏi trắc nghiệm về HTML & CSS, JavaScript, ReactJS, TypeScript và Web (thang điểm 10).

### Nhập đề thi từ file

Giáo viên bấm **Nhập từ file** (khung "Đề thi") hoặc **Tạo & nhập đề từ file** khi tạo phòng. File được đọc trên trình duyệt để xem trước và báo lỗi theo từng dòng/câu, chỉ lưu khi bấm nhập. Có thể chọn *thêm vào cuối đề* hoặc *thay thế toàn bộ đề*. Tối đa 300 câu mỗi lần, mỗi câu 2–6 phương án và đúng 1 đáp án đúng.

- **Excel (.xlsx) / CSV:** dòng tiêu đề gồm `Chủ đề` (không bắt buộc), `Câu hỏi`, `A`, `B`, `C`, `D` (thêm `E`, `F` nếu cần), `Đáp án đúng` (chữ cái A–F). CSV lưu từ Excel tiếng Việt (bảng mã Windows-1258, dấu `;`) cũng đọc được.
- **Word (.docx) / TXT:** mỗi câu bắt đầu bằng `Câu 1:`, phương án `A.` `B.`... (có thể nhiều phương án trên một dòng). Đáp án đúng ghi bằng dòng `Đáp án: B`, dấu `*` trước phương án, gạch chân/in đậm phương án (Word), hoặc bảng đáp án cuối file `Đáp án: 1A 2C 3B`. Hỗ trợ cả danh sách đánh số tự động của Word.
- File mẫu Excel và TXT tải được ngay trong hộp thoại nhập đề. Chưa hỗ trợ định dạng cũ `.xls`/`.doc` và hình ảnh trong câu hỏi.

---

## 4. Kiểm thử Tự động (Automated Test Suite)

Dự án bao gồm 33 kiểm thử, bao phủ các kịch bản:
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
- Phải đăng nhập tài khoản học sinh mới tham gia được phòng thi; đăng ký không cho phép tự tạo tài khoản Admin.
- Thí sinh chưa được duyệt hoặc kỳ thi chưa bắt đầu thì không nộp được bài.
- Kết thúc kỳ thi (thủ công hoặc tự động khi hết giờ) sẽ tự nộp bài cho thí sinh đang làm và đánh dấu vắng thí sinh chưa vào thi.
- Nhập đề từ file: thêm vào cuối đề / thay thế đề, bắt buộc đúng 1 đáp án đúng mỗi câu, khóa khi kỳ thi đã bắt đầu, chặn giáo viên khác.

Chạy kiểm thử (vitest 5 yêu cầu **Node.js ≥ 22.12**):
```bash
cd server
npm test
```

---

## 5. Hướng dẫn Thử nghiệm Đồng bộ Realtime (Hai Trình duyệt)

1. **Trình duyệt A (Giáo viên):**
   - Vào `http://localhost:5173`, đăng nhập `teacher@examly.vn`.
   - Dùng phòng `EXAM-101` có sẵn, hoặc nhấn **Tạo phòng thi mới** rồi **Thêm câu hỏi** (chọn đáp án đúng cho từng câu).
2. **Trình duyệt B (Học sinh - tab Ẩn danh hoặc máy khác trong mạng LAN):**
   - Vào `http://localhost:5173`, đăng nhập `student@examly.vn` (hoặc tự đăng ký tài khoản học sinh).
   - Nhập Lớp và Mã phòng thi, bấm **Gửi yêu cầu tham gia**. Họ tên lấy theo tài khoản.
3. **Phê duyệt thời gian thực (Socket.IO):**
   - Màn hình Giáo viên **tức thời hiện yêu cầu** trong bảng thí sinh và mục Hoạt động gần đây.
   - Giáo viên nhấn **Duyệt** → màn hình Học sinh chuyển sang **Bạn đã được duyệt!**.
4. **Bắt đầu kỳ thi:**
   - Giáo viên nhấn **Bắt đầu kỳ thi** (cần ít nhất 1 câu hỏi). Đề thi bị khóa, đồng hồ đếm ngược chạy theo máy chủ.
   - Màn hình Học sinh hiện **Kỳ thi đã bắt đầu!** và nút **Vào làm bài thi**.
5. **Làm bài & Giám sát:**
   - Mỗi lần chọn đáp án được **Autosave** lên máy chủ; tải lại trang (F5) vẫn quay về đúng bài với đáp án đã chọn.
   - Chuyển tab hoặc ẩn trình duyệt: số lượt rời trang cập nhật ngay trên màn hình Giáo viên.
   - Bấm **Nộp bài**: máy chủ chấm điểm và trả về kết quả chính thức; Giáo viên thấy điểm ngay trong bảng.
6. **Kết thúc:**
   - Giáo viên nhấn **Kết thúc kỳ thi**, hoặc máy chủ **tự động kết thúc khi hết giờ** (kể cả sau khi khởi động lại server).
   - Bài đang làm dở được tự động nộp và chấm điểm; thí sinh đã duyệt nhưng chưa vào thi bị đánh dấu **Vắng thi**.
