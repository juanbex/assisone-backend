import { FastifyInstance } from 'fastify'
import { authenticate } from '../../shared/middleware/auth.middleware'
import { getProviders, getProviderStatsHandler, getProvider, postProvider, patchProvider } from './providers.controller'

export default async function providersRoutes(app: FastifyInstance) {
  app.get('/',        { preHandler: [authenticate] }, getProviders)
  app.get('/stats',   { preHandler: [authenticate] }, getProviderStatsHandler)
  app.get('/:id',     { preHandler: [authenticate] }, getProvider)
  app.post('/',       { preHandler: [authenticate] }, postProvider)
  app.patch('/:id',   { preHandler: [authenticate] }, patchProvider)
}
