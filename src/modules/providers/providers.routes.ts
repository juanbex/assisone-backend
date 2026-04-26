import { FastifyInstance } from 'fastify'
import { authenticate } from '../../shared/middleware/auth.middleware'
import { getProviders, getProviderStatsHandler, getProvider, postProvider, patchProvider } from './providers.controller'
import { deleteProvider } from './providers.repository'

export default async function providersRoutes(app: FastifyInstance) {
  app.get('/',       { preHandler: [authenticate] }, getProviders)
  app.get('/stats',  { preHandler: [authenticate] }, getProviderStatsHandler)
  app.get('/:id',    { preHandler: [authenticate] }, getProvider)
  app.post('/',      { preHandler: [authenticate] }, postProvider)
  app.patch('/:id',  { preHandler: [authenticate] }, patchProvider)
  app.delete('/:id', { preHandler: [authenticate] }, async (req, reply) => {
    const { id } = req.params as any
    await deleteProvider(id)
    return reply.send({ ok: true })
  })
}
