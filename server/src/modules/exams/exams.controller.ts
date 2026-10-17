import type { Request, Response, NextFunction } from 'express'
import { ExamsService } from './exams.service.js'

export class ExamsController {
  static async createExam(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await ExamsService.createExam(req.user!.sub, req.body)
      return res.status(201).json(result)
    } catch (err) {
      next(err)
    }
  }

  static async listTeacherExams(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await ExamsService.listTeacherExams(req.user!.sub, req.user!.role)
      return res.json(result)
    } catch (err) {
      next(err)
    }
  }

  static async getExamById(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await ExamsService.getExamById(req.user!.sub, req.user!.role, req.params['examId']!)
      return res.json(result)
    } catch (err) {
      next(err)
    }
  }

  static async updateExam(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await ExamsService.updateExam(req.user!.sub, req.user!.role, req.params['examId']!, req.body)
      return res.json(result)
    } catch (err) {
      next(err)
    }
  }

  static async startExam(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await ExamsService.startExam(req.user!.sub, req.user!.role, req.params['examId']!)
      return res.json(result)
    } catch (err) {
      next(err)
    }
  }

  static async finishExam(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await ExamsService.finishExam(req.user!.sub, req.user!.role, req.params['examId']!)
      return res.json(result)
    } catch (err) {
      next(err)
    }
  }
}
