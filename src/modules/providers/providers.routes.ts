import { FastifyInstance } from 'fastify'
import { authenticate } from '../../shared/middleware/auth.middleware'
import { listProviders, getProviderById, createProvider, updateProvider, getProviderStats } from './providers.repository'

export default async function providersRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: [authenticate] }, async (req, reply) => {
    const { type, search, zone } = req.query as any
    return reply.send({ data: await listProviders({ type, search, zone }) })
  })

  app.get('/stats', { preHandler: [authenticate] }, async (_req, reply) => {
    return reply.send({ data: await getProviderStats() })
  })

  app.get('/:id', { preHandler: [authenticate] }, async (req, reply) => {
    const { id } = req.params as any
    const provider = await getProviderById(id)
    if (!provider) return reply.status(404).send({ error: 'Proveedor no encontrado' })
    return reply.send({ data: provider })
  })

  app.post('/', { preHandler: [authenticate] }, async (req, reply) => {
    const body = req.body as any
    try {
      const provider = await createProvider({
        name:          body.name,
        whatsapp:      body.whatsapp,
        type:          body.type,
        coverageZones: body.coverageZones ?? [],
      })
      return reply.status(201).send({ data: provider })
    } catch (err: any) {
      if (err?.code === 'P2002') return reply.status(409).send({ error: 'WhatsApp ya registrado' })
      throw err
    }
  })

  app.patch('/:id', { preHandler: [authenticate] }, async (req, reply) => {
    const { id } = req.params as any
    const body = req.body as any
    return reply.send({ data: await updateProvider(id, body) })
  })
}
