import type { Request, Response, NextFunction } from 'express'
import type { AnyZodObject, ZodTypeAny } from 'zod'

export function validateBody(schema: ZodTypeAny) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      req.body = await schema.parseAsync(req.body)
      next()
    } catch (err) {
      next(err)
    }
  }
}

export function validateQuery(schema: AnyZodObject) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      req.query = await schema.parseAsync(req.query)
      next()
    } catch (err) {
      next(err)
    }
  }
}

export function validateParams(schema: AnyZodObject) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      req.params = await schema.parseAsync(req.params)
      next()
    } catch (err) {
      next(err)
    }
  }
}
