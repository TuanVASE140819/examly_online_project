import type { Request, Response, NextFunction } from 'express'
import { SubmissionsService } from './submissions.service.js'

export class SubmissionsController {
  static async getCurrentSubmission(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await SubmissionsService.getCurrentSubmission(req.user!.sub)
      return res.json(result)
    } catch (err) {
      next(err)
    }
  }

  static async saveAnswer(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await SubmissionsService.saveAnswer(
        req.user!.sub,
        req.params['questionId']!,
        req.body
      )
      return res.json(result)
    } catch (err) {
      next(err)
    }
  }

  static async submitExam(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await SubmissionsService.submitExam(req.user!.sub, req.body)
      return res.json(result)
    } catch (err) {
      next(err)
    }
  }
}
