import { FastifyRequest, FastifyReply } from 'fastify'
import { listServices, getServiceById, countByStatus, createService, updateServiceStatus, listServiceTypes } from './services.repository'
import { startCoordination } from '../assignments/assignments.service'

export async function getServices(request: FastifyRequest, reply: FastifyReply) {
  const user = request.user as any
  const { status, search, page, limit } = request.query as any
  const result = await listServices({ tenantId: user.tenantId, status, search, page: page ? parseInt(page) : 1, limit: limit ? parseInt(limit) : 50 })
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
  return reply.send({ data: counts })
}

export async function postService(request: FastifyRequest, reply: FastifyReply) {
  const user = request.user as any
  const body = request.body as any
  try {
    const service = await createService({ tenantId: user.tenantId, frontAgentId: user.id, ...body })
    return reply.status(201).send({ data: service })
  } catch (err: any) {
    return reply.status(400).send({ error: err.message })
  }
}

export async function patchServiceStatus(request: FastifyRequest, reply: FastifyReply) {
  const user = request.user as any
  const { id } = request.params as any
  const { status, notes } = request.body as any

  try {
    if (status === 'in_coordination') {
      const result = await startCoordination(id)
      const service = await getServiceById(id, user.tenantId)
      return reply.send({
        data: service,
        coordination: result,
        message: result.eligible > 0
          ? `Push enviado a ${result.eligible} proveedor(es). Timer de 10 minutos activo.`
          : 'Sin proveedores disponibles → servicio marcado como no coordinado.',
      })
    }

    const service = await updateServiceStatus(id, user.tenantId, status, notes)
    return reply.send({ data: service })
  } catch (err: any) {
    return reply.status(400).send({ error: err.message })
  }
}

export async function getServiceTypes(request: FastifyRequest, reply: FastifyReply) {
  const user = request.user as any
  const types = await listServiceTypes(user.tenantId)
  return reply.send({ data: types })
}
