# CBRN-e — Hệ thống Thi Trực tuyến Thời gian thực (Full-stack)

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

# Tạo bảng trong PostgreSQL
docker compose exec backend npx prisma db push
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

#### Bước 2: Khởi tạo Database
Trong thư mục `server`:
```bash
cd server
npm install
npx prisma generate
npx prisma db push
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

## 3. Tài khoản

Mọi người dùng phải **đăng nhập** trước; vai trò (Giáo viên / Học sinh) được xác định từ tài khoản. Hệ thống không có sẵn tài khoản hay phòng thi nào — tạo tài khoản ở tab **Đăng ký** trên màn hình đăng nhập (chọn vai trò Giáo viên hoặc Học sinh).

### Câu hỏi trắc nghiệm và tự luận

Khi **Thêm câu hỏi**, giáo viên chọn loại **Trắc nghiệm** (2–6 phương án, đúng 1 đáp án) hoặc **Tự luận** (học sinh tự viết câu trả lời), và đặt **số điểm** cho từng câu (mặc định 1). Điểm bài thi quy về thang 10 theo tỷ lệ điểm đạt được trên tổng điểm của đề.

- Học sinh gõ câu trả lời tự luận vào ô văn bản; bài làm tự lưu lên máy chủ khi ngừng gõ và được lưu nốt trước khi nộp.
- Khi nộp bài, phần trắc nghiệm được chấm ngay. Nếu còn câu tự luận chưa chấm, bài ở trạng thái **Chờ chấm** (chưa có điểm chính thức, không tính vào điểm trung bình). Câu tự luận bỏ trống tính 0 điểm, không cần chấm.
- Giáo viên bấm **Chấm bài** ở bảng thí sinh để đọc bài làm (kèm phương án học sinh chọn ở phần trắc nghiệm) và nhập điểm từng câu tự luận (từ 0 đến số điểm của câu, có thể chấm lại). Chấm xong câu cuối cùng, điểm chính thức hiện ngay trên màn hình giáo viên và học sinh.

### Nhập đề thi từ file

Giáo viên bấm **Nhập từ file** (khung "Đề thi") hoặc **Tạo & nhập đề từ file** khi tạo phòng. File được đọc trên trình duyệt để xem trước và báo lỗi theo từng dòng/câu, chỉ lưu khi bấm nhập. Có thể chọn *thêm vào cuối đề* hoặc *thay thế toàn bộ đề*. Tối đa 300 câu mỗi lần; câu trắc nghiệm có 2–6 phương án và đúng 1 đáp án đúng, câu không có phương án nào là câu tự luận.

- **Excel (.xlsx) / CSV:** dòng tiêu đề gồm `Chủ đề` (không bắt buộc), `Câu hỏi`, `A`, `B`, `C`, `D` (thêm `E`, `F` nếu cần), `Đáp án đúng` (chữ cái A–F), `Điểm` (không bắt buộc, mặc định 1). Dòng để trống phương án và đáp án là câu tự luận. CSV lưu từ Excel tiếng Việt (bảng mã Windows-1258, dấu `;`) cũng đọc được.
- **Word (.docx) / TXT:** mỗi câu bắt đầu bằng `Câu 1:`, phương án `A.` `B.`... (có thể nhiều phương án trên một dòng). Đáp án đúng ghi bằng dòng `Đáp án: B`, dấu `*` trước phương án, gạch chân/in đậm phương án (Word), hoặc bảng đáp án cuối file `Đáp án: 1A 2C 3B`. Câu không có phương án là câu tự luận; ghi số điểm ngay sau số câu, ví dụ `Câu 4 (2 điểm):`. Hỗ trợ cả danh sách đánh số tự động của Word.
- File mẫu Excel và TXT tải được ngay trong hộp thoại nhập đề. Chưa hỗ trợ định dạng cũ `.xls`/`.doc` và hình ảnh trong câu hỏi.

### Học sinh cùng mạng / khác mạng

Frontend chuyển tiếp API và Socket.IO qua chính cổng của trang web, nên học sinh chỉ cần mở được địa chỉ trang (ví dụ `http://<IP máy giáo viên>:5173`).

Trong khung "Phòng thi đang quản lý", công tắc **Cho phép học sinh khác mạng** quyết định ai được vào phòng (đổi được cả khi đang thi, mặc định bật):
- **Bật:** học sinh cùng mạng hoặc khác mạng đều tham gia được.
- **Tắt:** chỉ học sinh dùng chung mạng với giáo viên. Lúc tắt, hệ thống ghi nhận IP hiện tại của giáo viên (hiển thị ngay dưới công tắc). Học sinh được vào khi cùng mạng nội bộ với máy chạy backend, hoặc ra Internet qua cùng IP công khai với giáo viên (chung Wi-Fi của trường). Học sinh mạng khác bị từ chối khi tham gia, lấy đề, lưu đáp án và nộp bài. Giáo viên đổi mạng thì bật rồi tắt lại công tắc để cập nhật.

Học sinh ở mạng khác (ví dụ ở nhà) chỉ vào được khi trang web có địa chỉ công khai: triển khai lên Render (mục 6) hoặc mở đường hầm như `cloudflared tunnel --url http://localhost:5173`.

---

## 4. Kiểm thử Tự động (Automated Test Suite)

Dự án bao gồm 48 kiểm thử, bao phủ các kịch bản:
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
- Câu hỏi tự luận: điểm theo trọng số từng câu, bài có câu tự luận chưa chấm ở trạng thái chờ chấm, giáo viên chấm (không vượt số điểm của câu, chỉ chấm câu tự luận của bài đã nộp, chặn giáo viên khác và học sinh).
- Chế độ mạng: phòng "chỉ cùng mạng" chặn học sinh khác mạng với giáo viên (so IP công khai, IPv6 theo dải /64) khi tham gia và khi làm bài; giáo viên đổi được chế độ khi đang thi, không đổi được khi kỳ thi đã kết thúc hoặc phòng của giáo viên khác.

Chạy kiểm thử (vitest 5 yêu cầu **Node.js ≥ 22.12**):
```bash
cd server
npm test
```

---

## 5. Hướng dẫn Thử nghiệm Đồng bộ Realtime (Hai Trình duyệt)

1. **Trình duyệt A (Giáo viên):**
   - Vào `http://localhost:5173`, đăng ký/đăng nhập tài khoản giáo viên.
   - Nhấn **Tạo phòng thi mới** rồi **Thêm câu hỏi** (chọn đáp án đúng cho từng câu) hoặc **Nhập từ file**.
2. **Trình duyệt B (Học sinh - tab Ẩn danh hoặc máy khác trong mạng LAN):**
   - Vào `http://localhost:5173`, đăng ký/đăng nhập tài khoản học sinh.
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
   - Bấm **Nộp bài**: máy chủ chấm điểm và trả về kết quả chính thức; Giáo viên thấy điểm ngay trong bảng. Đề có câu tự luận thì bài hiện **Chờ chấm** cho tới khi giáo viên bấm **Chấm bài** và chấm xong.
6. **Kết thúc:**
   - Giáo viên nhấn **Kết thúc kỳ thi**, hoặc máy chủ **tự động kết thúc khi hết giờ** (kể cả sau khi khởi động lại server).
   - Bài đang làm dở được tự động nộp và chấm điểm; thí sinh đã duyệt nhưng chưa vào thi bị đánh dấu **Vắng thi**.

---

## 6. Triển khai lên Render (học sinh vào từ bất kỳ đâu)

File `render.yaml` tạo **một Web Service** phục vụ cả giao diện lẫn API + Socket.IO tại cùng một địa chỉ (ví dụ `https://cbrn-e.onrender.com`). Database dùng **Neon** (Postgres miễn phí, không hết hạn).

1. **Tạo database trên Neon:** đăng ký tại [neon.tech](https://neon.tech), tạo project (chọn region *AWS Asia Pacific (Singapore)*), vào **Connect**, tắt **Connection pooling** rồi sao chép chuỗi kết nối dạng `postgresql://...neon.tech/neondb?sslmode=require`.
2. **Đẩy code lên GitHub** (repo đã có `render.yaml` ở thư mục gốc).
3. **Tạo dịch vụ trên Render:** đăng nhập [render.com](https://render.com) bằng GitHub → **New → Blueprint** → chọn repo này. Khi được hỏi `DATABASE_URL`, dán chuỗi kết nối Neon ở bước 1. `JWT_SECRET` được Render tự sinh.
4. Đợi build xong (vài phút), mở địa chỉ `https://<tên-dịch-vụ>.onrender.com`. Bảng dữ liệu được tạo tự động lúc khởi động; đăng ký tài khoản giáo viên đầu tiên ở tab **Đăng ký**.
5. **Kiểm tra IP:** tạo phòng thi, tắt công tắc **Cho phép học sinh khác mạng**. Dòng chú thích phải hiện IP công khai của mạng bạn (giống IP trên trang như whatismyip.com). Nếu hiện IP dạng `10.x.x.x`, đổi biến `TRUST_PROXY` trên Render (thử `2`) rồi deploy lại.

Lưu ý gói miễn phí của Render:
- Dịch vụ "ngủ" sau 15 phút không có truy cập; lần mở đầu tiên sau đó mất khoảng 1 phút. Hãy mở trang trước giờ thi vài phút, hoặc nâng lên gói trả phí (từ 7 USD/tháng) để luôn chạy.
- Mỗi lần push lên nhánh chính, Render tự build và deploy lại.
