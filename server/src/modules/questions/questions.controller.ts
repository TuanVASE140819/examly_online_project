import type { Request, Response, NextFunction } from 'express'
import { QuestionsService } from './questions.service.js'

export class QuestionsController {
  static async getQuestionsForTeacher(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await QuestionsService.getQuestionsForTeacher(req.user!.sub, req.user!.role, req.params['examId']!)
      return res.json(result)
    } catch (err) {
      next(err)
    }
  }

  static async getQuestionsForStudent(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await QuestionsService.getQuestionsForStudent(req.user!.sub, req.params['examId']!)
      return res.json(result)
    } catch (err) {
      next(err)
    }
  }

  static async createQuestion(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await QuestionsService.createQuestion(
        req.user!.sub,
        req.user!.role,
        req.params['examId']!,
        req.body
      )
      return res.status(201).json(result)
    } catch (err) {
      next(err)
    }
  }

  static async importQuestions(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await QuestionsService.importQuestions(
        req.user!.sub,
        req.user!.role,
        req.params['examId']!,
        req.body
      )
      return res.status(201).json(result)
    } catch (err) {
      next(err)
    }
  }

  static async deleteQuestion(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await QuestionsService.deleteQuestion(
        req.user!.sub,
        req.user!.role,
        req.params['examId']!,
        req.params['questionId']!
      )
      return res.json(result)
    } catch (err) {
      next(err)
    }
  }
}
