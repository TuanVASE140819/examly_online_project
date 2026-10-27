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

  static async getParticipantSubmission(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await SubmissionsService.getParticipantSubmission(
        req.user!.sub,
        req.user!.role,
        req.params['examId']!,
        req.params['participantId']!
      )
      return res.json(result)
    } catch (err) {
      next(err)
    }
  }

  static async gradeEssay(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await SubmissionsService.gradeEssay(
        req.user!.sub,
        req.user!.role,
        req.params['examId']!,
        req.params['participantId']!,
        req.params['questionId']!,
        req.body
      )
      return res.json(result)
    } catch (err) {
      next(err)
    }
  }
}
