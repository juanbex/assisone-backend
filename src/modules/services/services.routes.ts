import { FastifyInstance } from 'fastify'
import { authenticate } from '../../shared/middleware/auth.middleware'
import { getServices, getService, getStats } from './services.controller'

export default async function servicesRoutes(app: FastifyInstance) {
  app.get('/',        { preHandler: [authenticate] }, getServices)
  app.get('/stats',   { preHandler: [authenticate] }, getStats)
  app.get('/:id',     { preHandler: [authenticate] }, getService)
}
