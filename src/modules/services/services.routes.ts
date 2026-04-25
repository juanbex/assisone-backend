import { FastifyInstance } from 'fastify'
import { authenticate } from '../../shared/middleware/auth.middleware'

export default async function servicesRoutes(app: FastifyInstance) {
  app.get('/',             { preHandler: [authenticate] }, async (_q, r) => r.send({ data: [] }))
  app.post('/',            { preHandler: [authenticate] }, async (_q, r) => r.status(201).send({ data: {} }))
  app.get('/:id',          { preHandler: [authenticate] }, async (_q, r) => r.send({ data: {} }))
  app.patch('/:id/status', { preHandler: [authenticate] }, async (_q, r) => r.send({ data: {} }))
}
