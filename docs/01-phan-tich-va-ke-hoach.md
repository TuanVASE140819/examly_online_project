# 1. Phân tích tài liệu và kế hoạch phát triển

## 1.1. Phạm vi theo tài liệu gốc
Tài liệu yêu cầu bản demo ReactJS + TypeScript, chưa có backend/database. Hai vai trò chính:

**Giáo viên**
- Tạo phòng thi mẫu với tên, mã phòng và thời lượng.
- Xem danh sách học sinh.
- Duyệt hoặc từ chối yêu cầu tham gia.
- Theo dõi trạng thái và cảnh báo chuyển tab.

**Học sinh**
- Nhập họ tên, lớp và mã phòng thi.
- Chờ giáo viên duyệt.
- Chỉ khi được duyệt mới vào bài thi.
- Làm câu hỏi trắc nghiệm, xem đồng hồ đếm ngược.

**Giám sát**
- Dùng `visibilitychange` để ghi nhận trang thi bị ẩn.
- Hiển thị số lần rời trang và cảnh báo.

Tài liệu lưu ý `localStorage`/React state chỉ dùng trên cùng trình duyệt; để các máy khác nhau giao tiếp cần backend/API và cơ chế realtime như WebSocket/Socket.IO.

## 1.2. Vai trò và luồng nghiệp vụ
1. Giáo viên tạo kỳ thi/phòng thi.
2. Hệ thống sinh mã phòng.
3. Học sinh gửi yêu cầu tham gia với họ tên, lớp và mã phòng.
4. Trạng thái ban đầu `PENDING`.
5. Giáo viên duyệt → `APPROVED`, hoặc từ chối → `REJECTED`.
6. Chỉ `APPROVED` mới được bắt đầu khi kỳ thi ở trạng thái cho phép.
7. Học sinh trả lời; đáp án được lưu tạm trong demo.
8. Học sinh xác nhận nộp bài hoặc hết giờ.
9. Hệ thống tính điểm demo và ghi nhận sự kiện giám sát.

## 1.3. Các trạng thái cần thống nhất
- Exam: `DRAFT`, `WAITING`, `SCHEDULED`, `ACTIVE`, `ENDED`, `CANCELLED`.
- Participant: `PENDING`, `APPROVED`, `REJECTED`, `IN_PROGRESS`, `SUBMITTED`, `ABSENT`, `DISCONNECTED`.
- Submission: `IN_PROGRESS`, `SUBMITTED`, `AUTO_SUBMITTED`, `GRADED`.
- Violation event: `TAB_HIDDEN`, `TAB_VISIBLE`, `FULLSCREEN_EXIT` (hai event sau chỉ triển khai nếu có nhu cầu và thông báo rõ cho người dự thi).

## 1.4. Kế hoạch phát triển theo sprint

### Sprint 0 — Làm rõ nghiệp vụ
- Chốt vai trò: giáo viên, học sinh, quản trị viên.
- Chốt hình thức đề: trắc nghiệm đơn lựa chọn trước; tự luận, nhiều đáp án, file đính kèm để sau.
- Chốt chính sách: thời gian mở/đóng, nộp sớm, hết giờ, vào muộn, làm lại, xem điểm.
- Chốt dữ liệu cá nhân cần thu thập, thời hạn lưu và ai được xem.
- Viết acceptance criteria và sơ đồ trạng thái.

**Đầu ra:** PRD, user stories, glossary, wireframe.

### Sprint 1 — UI/UX và frontend demo
- Design tokens, responsive layout, component dùng chung.
- Dashboard giáo viên, tạo phòng, danh sách học sinh, trạng thái chờ duyệt.
- Form tham gia, màn hình chờ, trang làm bài, kết quả.
- Mock data và localStorage; loading/empty/error states.
- Kiểm tra keyboard navigation, focus, tương phản, màn hình nhỏ.

**Tiêu chí nghiệm thu:** luồng end-to-end chạy trên một trình duyệt; trạng thái hiển thị dễ hiểu; không tự kết luận gian lận từ việc chuyển tab.

### Sprint 2 — Backend và database
- Khởi tạo API, cấu hình env, logging và error handler.
- Đăng nhập và phân quyền; mật khẩu được hash.
- Schema users, exams, questions, options, participants, answers, events.
- Endpoint tạo phòng, tham gia, duyệt, bắt đầu, lưu đáp án, nộp bài.
- Validation phía server và transaction cho các thao tác quan trọng.

**Tiêu chí nghiệm thu:** dữ liệu sống qua restart; học sinh không thể tự đổi trạng thái duyệt hoặc sửa điểm bằng request client.

### Sprint 3 — Realtime và đồng bộ bài thi
- Socket.IO room theo `examId` và xác thực socket.
- Push trạng thái duyệt, bắt đầu/kết thúc kỳ thi, cảnh báo, tình trạng kết nối.
- Reconnect, resync snapshot từ API, heartbeat phù hợp.
- Đồng hồ dựa trên `endsAt` từ server, không tin đồng hồ client.

**Tiêu chí nghiệm thu:** giáo viên và học sinh ở các trình duyệt/thiết bị khác nhau nhận cập nhật; tải lại không mất câu trả lời đã lưu server-side.

### Sprint 4 — Hoàn thiện kỳ thi
- Autosave câu trả lời có debounce và retry.
- Server-side submit, chấm điểm ở server.
- Audit log, báo cáo kết quả, lọc/tìm kiếm, export CSV nếu cần.
- Rate limit, kiểm thử quyền truy cập, chống truy cập ID không thuộc phòng.

### Sprint 5 — QA và production
- Unit, integration, E2E tests.
- Kiểm thử tải ở số lượng thí sinh mục tiêu.
- HTTPS, secrets, database backup/restore, monitoring, alerting.
- CI/CD, staging, rollback, runbook vận hành.
- Chính sách riêng tư, thông báo giám sát, retention và quy trình xử lý sự cố.

## 1.5. Ưu tiên MVP thực tế
**P0:** xác thực, tạo kỳ thi, mã tham gia, duyệt thí sinh, trắc nghiệm, timer server-based, autosave, nộp bài, chấm điểm, realtime cơ bản, audit log.

**P1:** ngân hàng câu hỏi, trộn câu/đáp án, lịch thi, báo cáo, xuất CSV, email/thông báo.

**P2:** tự luận, chấm thủ công, import đề, phân tích nâng cao, tích hợp LMS.

## 1.6. Rủi ro và biện pháp
- Mất kết nối: lưu đáp án lên server định kỳ, retry và khôi phục sau reconnect.
- Đồng hồ bị chỉnh: server là nguồn thời gian chuẩn; client chỉ hiển thị `endsAt - serverNow`.
- Học sinh giả mạo request: server kiểm tra quyền và trạng thái ở mọi endpoint.
- Mã phòng bị chia sẻ: mã đủ ngẫu nhiên, có thể hết hạn/đóng phòng và giới hạn thử mã.
- Cảnh báo tab sai lệch: lưu như sự kiện quan sát, không tự động kết luận gian lận.
- Tải cao khi autosave: debounce, batch có giới hạn, idempotency và kiểm thử tải.

## 1.7. Definition of Done
- Acceptance criteria được kiểm tra.
- Không có lỗi TypeScript/lint/test nghiêm trọng.
- Mọi endpoint kiểm tra authentication/authorization.
- Có trạng thái loading/empty/error và thông báo rõ ràng.
- Có log nhưng không ghi mật khẩu/token/đáp án nhạy cảm không cần thiết.
- README, biến môi trường mẫu, migration và hướng dẫn triển khai được cập nhật.
