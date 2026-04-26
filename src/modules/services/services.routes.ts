import { FastifyInstance } from 'fastify'
import { authenticate } from '../../shared/middleware/auth.middleware'
import { getServices, getService, getStats, postService, patchServiceStatus, getServiceTypes } from './services.controller'
import { getServicesForTracking } from '../assignments/assignments.service'

export default async function servicesRoutes(app: FastifyInstance) {
  app.get('/',             { preHandler: [authenticate] }, getServices)
  app.get('/stats',        { preHandler: [authenticate] }, getStats)
  app.get('/types',        { preHandler: [authenticate] }, getServiceTypes)
  app.get('/seguimiento',  { preHandler: [authenticate] }, async (req, reply) => {
    const user = req.user as any
    const services = await getServicesForTracking(user.tenantId)
    return reply.send({ data: services })
  })
  app.get('/:id',          { preHandler: [authenticate] }, getService)
  app.post('/',            { preHandler: [authenticate] }, postService)
  app.patch('/:id/status', { preHandler: [authenticate] }, patchServiceStatus)
}
