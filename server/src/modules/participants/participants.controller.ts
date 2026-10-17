import type { Request, Response, NextFunction } from 'express'
import { ParticipantsService } from './participants.service.js'

export class ParticipantsController {
  static async joinRoom(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await ParticipantsService.joinRoom(req.body)
      return res.status(201).json(result)
    } catch (err) {
      next(err)
    }
  }

  static async getExamParticipants(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await ParticipantsService.getExamParticipants(
        req.user!.sub,
        req.user!.role,
        req.params['examId']!
      )
      return res.json(result)
    } catch (err) {
      next(err)
    }
  }

  static async decideParticipant(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await ParticipantsService.decideParticipant(
        req.user!.sub,
        req.user!.role,
        req.params['examId']!,
        req.params['participantId']!,
        req.body
      )
      return res.json(result)
    } catch (err) {
      next(err)
    }
  }

  static async getMyStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await ParticipantsService.getMyStatus(req.user!.sub)
      return res.json(result)
    } catch (err) {
      next(err)
    }
  }
}
