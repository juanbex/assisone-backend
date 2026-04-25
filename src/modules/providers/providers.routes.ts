import { FastifyInstance } from 'fastify'
import { authenticate } from '../../shared/middleware/auth.middleware'
import { getProviders, getProvider, postProvider, patchProvider, getStats } from './providers.controller'

export default async function providersRoutes(app: FastifyInstance) {
  app.get('/',       { preHandler: [authenticate] }, getProviders)
  app.get('/stats',  { preHandler: [authenticate] }, getStats)
  app.get('/:id',    { preHandler: [authenticate] }, getProvider)
  app.post('/',      { preHandler: [authenticate] }, postProvider)
  app.patch('/:id',  { preHandler: [authenticate] }, patchProvider)
}
