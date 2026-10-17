# 2. Thiết kế UI/UX

## 2.1. Định hướng hình ảnh
- Tên demo: **Examly**.
- Phong cách: sản phẩm SaaS giáo dục hiện đại, gọn, nhiều khoảng trắng, trạng thái rõ ràng.
- Màu chính: xanh tím `#526EF4`; chữ chính `#17233C`; nền `#F6F8FC`; viền `#E9EDF4`.
- Trạng thái: xanh lá = đã duyệt/hoàn thành; vàng = chờ duyệt; đỏ = từ chối/lỗi; tím xanh = đang hoạt động.
- Font: Be Vietnam Pro (có fallback system font).
- Bo góc 8–14px, shadow rất nhẹ; tránh dashboard quá dày đặc.

## 2.2. Sitemap
- `/teacher/dashboard`: tổng quan, phòng thi, số liệu, danh sách thí sinh.
- `/teacher/exams/new`: tạo kỳ thi.
- `/teacher/exams/:id/participants`: quản lý yêu cầu, duyệt/từ chối, trạng thái.
- `/student/join`: nhập họ tên/lớp/mã phòng (production nên dùng tài khoản hoặc mã dự thi theo yêu cầu nghiệp vụ).
- `/student/waiting/:examId`: chờ duyệt, trạng thái và hướng dẫn.
- `/student/exams/:examId/take`: câu hỏi, điều hướng, timer, autosave.
- `/student/exams/:examId/result`: kết quả theo chính sách kỳ thi.
- `/admin`: quản lý người dùng và cấu hình (ngoài phạm vi demo).

## 2.3. Màn hình đã dựng trong demo
1. **Dashboard giáo viên:** sidebar, breadcrumb, thống kê, phòng thi hiện tại, hoạt động gần đây, bảng thí sinh.
2. **Tạo phòng thi:** modal tên phòng, thời lượng, mã sinh tự động.
3. **Tham gia thi:** form 3 trường, hướng dẫn quy trình, thông báo lỗi.
4. **Phòng chờ:** trạng thái duyệt, thông tin thí sinh/phòng, hướng dẫn thao tác.
5. **Làm bài:** timer, progress, danh sách câu, lựa chọn đáp án, xác nhận nộp, cảnh báo tab.
6. **Kết quả:** điểm demo, số câu đã trả lời, số lần rời trang.

## 2.4. Quy tắc tương tác
- Nút hành động chính duy nhất cho mỗi khu vực.
- Duyệt/từ chối luôn cập nhật trạng thái bằng nhãn và màu, không chỉ dùng màu đơn độc.
- Thao tác nộp bài có bước xác nhận.
- Câu chưa trả lời/đã trả lời/đang xem có ký hiệu riêng.
- Timer cảnh báo khi sắp hết giờ, nhưng không dùng màu làm tín hiệu duy nhất.
- Tab hidden chỉ hiện cảnh báo giải thích; không tự động khóa hoặc nộp bài.
- Mọi form có lỗi validation cạnh trường hoặc ở đầu form.
- Responsive: sidebar thu gọn trên màn hình nhỏ; câu hỏi xếp một cột; vùng bấm đủ lớn.

## 2.5. Accessibility và nội dung
- Tất cả nút có label/tooltip khi chỉ có icon.
- Tương phản chữ/nền nên đạt WCAG AA ở bản production.
- Hỗ trợ tab/keyboard focus và trạng thái focus nhìn thấy được.
- Dialog phải giữ focus, đóng bằng Escape và trả focus về nút mở khi hoàn thiện production.
- Nội dung tiếng Việt nhất quán: “Phòng thi”, “Thí sinh”, “Chờ duyệt”, “Đã duyệt”, “Nộp bài”.
- Tránh dùng từ “gian lận” tự động trong cảnh báo kỹ thuật.

## 2.6. Components đề xuất cho bản production
`AppShell`, `Sidebar`, `Topbar`, `StatCard`, `ExamCard`, `ParticipantTable`, `StatusBadge`, `CreateExamDialog`, `JoinExamForm`, `WaitingStatus`, `ExamTimer`, `QuestionNavigator`, `QuestionCard`, `AnswerOption`, `SubmitConfirmDialog`, `ResultSummary`, `Toast`, `EmptyState`, `ErrorState`, `LoadingSkeleton`.
