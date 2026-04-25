import { FastifyInstance } from 'fastify'
import { authenticate } from '../../shared/middleware/auth.middleware'
import { runSeed } from './seed.service'

export default async function adminRoutes(app: FastifyInstance) {
  // Seed categorías y tipos de servicio
  app.post('/seed', { preHandler: [authenticate] }, async (_req, reply) => {
    const results = await runSeed()
    return reply.send({ ok: true, results })
  })
}
