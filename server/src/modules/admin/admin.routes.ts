import { Router } from 'express'
import { requireAdmin, requireAuth } from '../../middleware/auth.js'
import { validateBody, validateQuery } from '../../middleware/validate.js'
import { handle, idParam } from '../../lib/http.js'
import { AdminService } from './admin.service.js'
import { createUserSchema, listUsersQuerySchema, updateUserSchema, type ListUsersQuery } from './admin.schemas.js'

export const adminRoutes = Router()

adminRoutes.use(requireAuth, requireAdmin)

adminRoutes.get(
  '/users',
  validateQuery(listUsersQuerySchema),
  handle(async (req, res) => {
    res.json(await AdminService.listUsers(req.query as ListUsersQuery))
  })
)

adminRoutes.post(
  '/users',
  validateBody(createUserSchema),
  handle(async (req, res) => {
    res.status(201).json(await AdminService.createUser(req.user!.sub, req.body))
  })
)

adminRoutes.patch(
  '/users/:userId',
  validateBody(updateUserSchema),
  handle(async (req, res) => {
    res.json(await AdminService.updateUser(req.user!.sub, idParam(req, 'userId'), req.body))
  })
)

adminRoutes.delete(
  '/users/:userId',
  handle(async (req, res) => {
    res.json(await AdminService.deleteUser(req.user!.sub, idParam(req, 'userId')))
  })
)
