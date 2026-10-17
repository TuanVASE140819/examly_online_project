# 3. Prompt cho AI coding agent

Sao chép prompt dưới đây vào coding agent có quyền đọc/ghi repository. Yêu cầu agent đọc source trước khi sửa và triển khai theo từng phase, không tạo một lượng code lớn mà không kiểm tra build.

---

Bạn là Senior Full-stack Engineer, Product-minded Tech Lead và QA Engineer. Hãy phát triển website thi trực tuyến dựa trên repository hiện có và tài liệu nghiệp vụ trong `docs/01-phan-tich-va-ke-hoach.md`, `docs/02-ui-ux.md`, `docs/04-production-architecture.md`.

## Mục tiêu
Nâng demo React + TypeScript thành ứng dụng thi trực tuyến production-ready, có giáo viên tạo kỳ thi, học sinh gửi yêu cầu tham gia, giáo viên duyệt/từ chối, làm bài trắc nghiệm có timer server-based, autosave, nộp bài và đồng bộ realtime trên nhiều thiết bị.

## Quy tắc bắt buộc
1. Trước khi code: kiểm tra cấu trúc repository, package scripts, code conventions, README và các thay đổi hiện có. Không ghi đè thay đổi không liên quan.
2. Viết một kế hoạch ngắn, danh sách file cần sửa/tạo, rủi ro và tiêu chí nghiệm thu. Sau đó thực hiện theo phase.
3. TypeScript strict; tránh `any`; tách UI, business logic, API client, validation và realtime service.
4. Không để client quyết định quyền, điểm số cuối cùng, thời gian kết thúc hoặc trạng thái được phép thi. Backend là nguồn sự thật.
5. Mọi endpoint kiểm tra authentication, authorization theo resource, validation, trạng thái nghiệp vụ và rate limit phù hợp.
6. Không lưu mật khẩu dạng rõ; dùng hash an toàn. Không đưa secret vào source control.
7. Không dùng localStorage làm nguồn dữ liệu thật cho kỳ thi production. Có thể lưu preference không nhạy cảm; câu trả lời phải được autosave lên backend.
8. Xác thực Socket.IO handshake và kiểm tra quyền trước khi join room; không broadcast dữ liệu nhạy cảm cho toàn bộ room.
9. Ghi sự kiện chuyển tab như tín hiệu tham khảo; không tự động kết luận gian lận, khóa hoặc nộp bài chỉ vì sự kiện này.
10. Không tuyên bố hoàn tất nếu chưa chạy build/test. Nếu môi trường không chạy được test, ghi rõ lệnh và lý do.

## Phase A — Audit và đặc tả
- Đọc toàn bộ source liên quan.
- So sánh code với yêu cầu và tạo checklist thiếu.
- Xác định API contracts, schema, trạng thái exam/participant/submission.
- Đề xuất cấu trúc thư mục; không thay stack hiện tại nếu không có lý do.

## Phase B — UI/UX frontend
- Duy trì visual system trong `docs/02-ui-ux.md`.
- Tạo dashboard, create exam, participant review, join, waiting, taking exam, result.
- Xử lý loading/empty/error, responsive, keyboard focus, validation.
- Tạo mock service có interface tương thích với API thật để frontend phát triển độc lập.
- Không để mock data trộn vào production path.

## Phase C — Backend/database
- Triển khai schema cho users, exams, questions, options, participants, answers/submissions, proctoring events và audit logs.
- Có migration, seed data, indexes, foreign keys và constraints phù hợp.
- Triển khai auth, role-based authorization và ownership checks.
- Tạo API theo `docs/04-production-architecture.md`.
- Mọi chuyển trạng thái phải được kiểm tra ở server; dùng transaction ở thao tác nhạy cảm.

## Phase D — Realtime
- Đồng bộ participant requested/approved/rejected, exam started/ended, submission updates và proctoring events.
- Socket reconnect phải gọi API lấy snapshot mới nhất; không dựa hoàn toàn vào event đã bỏ lỡ.
- Dùng `endsAt` từ server làm chuẩn cho timer.

## Phase E — An toàn bài thi
- Autosave đáp án với debounce, retry, idempotency và xử lý conflict rõ ràng.
- Submit idempotent; khi hết giờ server đóng bài theo quy tắc đã thống nhất.
- Tính điểm ở backend, không tin điểm client gửi lên.
- Không trả correct answer trước khi kỳ thi kết thúc theo chính sách.
- Audit log cho tạo kỳ thi, duyệt, bắt đầu, nộp bài và hành động quản trị.

## Phase F — QA và bàn giao
- Unit test cho business rules, integration test cho API/permissions, E2E cho luồng giáo viên-học sinh.
- Test các trường hợp: sai mã phòng, chưa duyệt, kỳ thi chưa bắt đầu/đã kết thúc, reconnect, submit lặp, hết giờ, truy cập tài nguyên của người khác.
- Chạy lint/typecheck/test/build và sửa lỗi.
- Cập nhật `.env.example`, migration/seed, README, hướng dẫn local/staging/production.
- Báo cáo cuối: thay đổi, lệnh đã chạy, kết quả test thực tế, việc còn thiếu và rủi ro.

## Tiêu chí nghiệm thu chính
- Giáo viên và học sinh trên các trình duyệt/thiết bị khác nhau đồng bộ được.
- Học sinh chưa duyệt không thể bắt đầu thi bằng cách gọi API trực tiếp.
- Refresh/reconnect không làm mất câu trả lời đã được server xác nhận lưu.
- Timer và thời điểm đóng bài theo server.
- Điểm số do backend tính.
- Không có secret trong repository; quyền truy cập và dữ liệu cá nhân được bảo vệ.

Bắt đầu bằng Phase A. Không nhảy thẳng sang Phase C trước khi nêu ra các quyết định kiến trúc và tiêu chí nghiệm thu.
