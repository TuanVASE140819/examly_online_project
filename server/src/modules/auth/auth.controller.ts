import type { Request, Response, NextFunction } from 'express'
import { AuthService } from './auth.service.js'

export class AuthController {
  static async login(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await AuthService.login(req.body)
      return res.json(result)
    } catch (err) {
      next(err)
    }
  }

  static async registerTeacher(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await AuthService.registerTeacher(req.body)
      return res.status(201).json(result)
    } catch (err) {
      next(err)
    }
  }

  static async getMe(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await AuthService.getMe(req.user!.sub)
      return res.json(result)
    } catch (err) {
      next(err)
    }
  }
}
