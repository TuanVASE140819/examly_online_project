import { Router, type Request } from 'express'
import { UserRole } from '@prisma/client'
import { requireAuth, requireRole, requireUserAccount } from '../../middleware/auth.js'
import { validateBody } from '../../middleware/validate.js'
import { handle, idParam } from '../../lib/http.js'
import { ClassesService, type Actor } from './classes.service.js'
import { rawFileBody, readUploadedFile } from '../attachments/attachments.service.js'
import {
  addMembersSchema,
  classSchema,
  createAssignmentSchema,
  gradeAssignmentSchema,
  publishSchema,
  updateAssignmentSchema,
} from './classes.schemas.js'

// Giáo viên (và quản trị viên) quản lý lớp học, học sinh và bài tập
export const classesRoutes = Router()

const teacherAuth = [requireAuth, requireUserAccount, requireRole(UserRole.TEACHER, UserRole.ADMIN)]
const actor = (req: Request): Actor => ({ id: req.user!.sub, role: req.user!.role })

classesRoutes.get('/classes', ...teacherAuth, handle(async (req, res) => {
  res.json(await ClassesService.listClasses(actor(req)))
}))

classesRoutes.post('/classes', ...teacherAuth, validateBody(classSchema), handle(async (req, res) => {
  res.status(201).json(await ClassesService.createClass(actor(req), req.body))
}))

classesRoutes.get('/classes/:classId', ...teacherAuth, handle(async (req, res) => {
  res.json(await ClassesService.getClass(actor(req), idParam(req, 'classId')))
}))

classesRoutes.patch('/classes/:classId', ...teacherAuth, validateBody(classSchema), handle(async (req, res) => {
  res.json(await ClassesService.updateClass(actor(req), idParam(req, 'classId'), req.body))
}))

classesRoutes.delete('/classes/:classId', ...teacherAuth, handle(async (req, res) => {
  res.json(await ClassesService.deleteClass(actor(req), idParam(req, 'classId')))
}))

classesRoutes.post('/classes/:classId/members', ...teacherAuth, validateBody(addMembersSchema), handle(async (req, res) => {
  res.json(await ClassesService.addMembers(actor(req), idParam(req, 'classId'), req.body))
}))

classesRoutes.delete('/classes/:classId/members/:studentId', ...teacherAuth, handle(async (req, res) => {
  res.json(await ClassesService.removeMember(actor(req), idParam(req, 'classId'), idParam(req, 'studentId')))
}))

classesRoutes.post('/classes/:classId/assignments', ...teacherAuth, validateBody(createAssignmentSchema), handle(async (req, res) => {
  res.status(201).json(await ClassesService.createAssignment(actor(req), idParam(req, 'classId'), req.body))
}))

classesRoutes.get('/assignments/:assignmentId', ...teacherAuth, handle(async (req, res) => {
  res.json(await ClassesService.getAssignmentRoster(actor(req), idParam(req, 'assignmentId')))
}))

classesRoutes.patch('/assignments/:assignmentId', ...teacherAuth, validateBody(updateAssignmentSchema), handle(async (req, res) => {
  res.json(await ClassesService.updateAssignment(actor(req), idParam(req, 'assignmentId'), req.body))
}))

classesRoutes.delete('/assignments/:assignmentId', ...teacherAuth, handle(async (req, res) => {
  res.json(await ClassesService.deleteAssignment(actor(req), idParam(req, 'assignmentId')))
}))

classesRoutes.put(
  '/assignments/:assignmentId/submissions/:studentId/grade',
  ...teacherAuth,
  validateBody(gradeAssignmentSchema),
  handle(async (req, res) => {
    res.json(await ClassesService.gradeSubmission(actor(req), idParam(req, 'assignmentId'), idParam(req, 'studentId'), req.body))
  })
)

classesRoutes.post('/assignments/:assignmentId/publish', ...teacherAuth, validateBody(publishSchema), handle(async (req, res) => {
  res.json(await ClassesService.publishGrades(actor(req), idParam(req, 'assignmentId'), req.body.published))
}))

// Tệp đề bài: thân yêu cầu là nội dung tệp (nhị phân), tên tệp ở ?name=
classesRoutes.post('/assignments/:assignmentId/attachments', ...teacherAuth, rawFileBody, handle(async (req, res) => {
  res.status(201).json(await ClassesService.addAttachment(actor(req), idParam(req, 'assignmentId'), readUploadedFile(req)))
}))

classesRoutes.delete('/assignments/:assignmentId/attachments/:attachmentId', ...teacherAuth, handle(async (req, res) => {
  res.json(await ClassesService.removeAttachment(actor(req), idParam(req, 'assignmentId'), idParam(req, 'attachmentId')))
}))
