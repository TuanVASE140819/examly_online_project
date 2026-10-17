import type { Request, Response, NextFunction } from 'express'
import { ProctoringService } from './proctoring.service.js'

export class ProctoringController {
  static async recordEvent(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await ProctoringService.recordEvent(req.user!.sub, req.body)
      return res.json(result)
    } catch (err) {
      next(err)
    }
  }
}
