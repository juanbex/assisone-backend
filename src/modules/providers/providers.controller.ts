import { FastifyRequest, FastifyReply } from 'fastify'
import { listProviders, getProviderById, createProvider, updateProvider, getProviderStats } from './providers.repository'

export async function getProviders(req: FastifyRequest, reply: FastifyReply) {
  const { search, type, page, limit } = req.query as any
  const result = await listProviders({ search, type, page: page ? parseInt(page) : 1, limit: limit ? parseInt(limit) : 50 })
  return reply.send(result)
}

export async function getProvider(req: FastifyRequest, reply: FastifyReply) {
  const { id } = req.params as any
  const provider = await getProviderById(id)
  if (!provider) return reply.status(404).send({ error: 'Proveedor no encontrado' })
  return reply.send({ data: provider })
}

export async function postProvider(req: FastifyRequest, reply: FastifyReply) {
  const body = req.body as any
  try {
    const provider = await createProvider(body)
    return reply.status(201).send({ data: provider })
  } catch (err: any) {
    if (err?.code === 'P2002') return reply.status(409).send({ error: 'WhatsApp ya registrado' })
    return reply.status(400).send({ error: err.message })
  }
}

export async function patchProvider(req: FastifyRequest, reply: FastifyReply) {
  const { id } = req.params as any
  const body = req.body as any
  const provider = await updateProvider(id, body)
  return reply.send({ data: provider })
}

export async function getStats(req: FastifyRequest, reply: FastifyReply) {
  const stats = await getProviderStats()
  return reply.send({ data: stats })
}
