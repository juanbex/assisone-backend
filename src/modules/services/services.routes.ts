import { FastifyInstance } from 'fastify'
import { authenticate } from '../../shared/middleware/auth.middleware'
import { getServices, getService, getStats, postService, patchServiceStatus, getServiceTypes } from './services.controller'

export default async function servicesRoutes(app: FastifyInstance) {
  app.get('/',              { preHandler: [authenticate] }, getServices)
  app.get('/stats',         { preHandler: [authenticate] }, getStats)
  app.get('/types',         { preHandler: [authenticate] }, getServiceTypes)
  app.get('/:id',           { preHandler: [authenticate] }, getService)
  app.post('/',             { preHandler: [authenticate] }, postService)
  app.patch('/:id/status',  { preHandler: [authenticate] }, patchServiceStatus)
}
