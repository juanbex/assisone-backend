import { FastifyRequest, FastifyReply } from 'fastify'
import { listServices, getServiceById, countByStatus } from './services.repository'

export async function getServices(request: FastifyRequest, reply: FastifyReply) {
  const user = request.user as any
  const { status, search, page, limit } = request.query as any

  const result = await listServices({
    tenantId: user.tenantId,
    status,
    search,
    page: page ? parseInt(page) : 1,
    limit: limit ? parseInt(limit) : 50,
  })

  return reply.send(result)
}

export async function getService(request: FastifyRequest, reply: FastifyReply) {
  const user = request.user as any
  const { id } = request.params as any
  const service = await getServiceById(id, user.tenantId)
  if (!service) return reply.status(404).send({ error: 'Servicio no encontrado' })
  return reply.send({ data: service })
}

export async function getStats(request: FastifyRequest, reply: FastifyReply) {
  const user = request.user as any
  const counts = await countByStatus(user.tenantId)
  const total = Object.values(counts).reduce((a: number, b) => a + (b as number), 0)
  return reply.send({ data: { total, ...counts } })
}
