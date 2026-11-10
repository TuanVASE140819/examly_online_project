import { Router } from 'express'
import { requireAuth, requireUserAccount } from '../../middleware/auth.js'
import { handle, idParam } from '../../lib/http.js'
import { AttachmentsService } from './attachments.service.js'

// Tải nội dung tệp đính kèm (đề bài tập, bài làm). Quyền xem được kiểm tra theo lớp học trong service.
//
// Chỉ giao diện gọi đường dẫn này (fetch kèm token) rồi tự gắn loại tệp, tên tệp từ danh sách tệp đính kèm.
// Vì vậy cố ý gửi dạng nhị phân chung, không kèm tên tệp: trả "application/pdf" hoặc tên "*.pdf" thì
// trình quản lý tải xuống (IDM...) và Chromium chạy tự động chặn cả yêu cầu fetch thành lượt tải về,
// giao diện nhận nội dung rỗng.
export const attachmentsRoutes = Router()

attachmentsRoutes.get('/attachments/:attachmentId', requireAuth, requireUserAccount, handle(async (req, res) => {
  const file = await AttachmentsService.getForDownload(
    { id: req.user!.sub, role: req.user!.role },
    idParam(req, 'attachmentId')
  )
  res.type('application/octet-stream')
  res.setHeader('Cache-Control', 'private, max-age=3600')
  res.send(file.data)
}))
