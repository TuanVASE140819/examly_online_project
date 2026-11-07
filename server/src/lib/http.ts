import type { NextFunction, Request, Response } from 'express'
import { AppError } from '../middleware/errorHandler.js'

// Bọc handler async: lỗi được chuyển cho errorHandler thay vì làm treo yêu cầu
export function handle(fn: (req: Request, res: Response) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next)
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Mã định danh trên đường dẫn; sai định dạng UUID thì coi như không tồn tại (thay vì lỗi 500 từ Postgres)
export function idParam(req: Request, name: string): string {
  const value = req.params[name] ?? ''
  if (!UUID_RE.test(value)) {
    throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy dữ liệu yêu cầu.')
  }
  return value
}
