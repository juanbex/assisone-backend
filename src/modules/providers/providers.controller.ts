import { FastifyRequest, FastifyReply } from 'fastify'
import { listProviders, getProviderById, createProvider, updateProvider, getProviderStats } from './providers.repository'

export async function getProviders(request: FastifyRequest, reply: FastifyReply) {
  const { type, search, zone } = request.query as any
  return reply.send({ data: await listProviders({ type, search, zone }) })
}

export async function getProviderStatsHandler(request: FastifyRequest, reply: FastifyReply) {
  return reply.send({ data: await getProviderStats() })
}

export async function getProvider(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any
  const provider = await getProviderById(id)
  if (!provider) return reply.status(404).send({ error: 'Proveedor no encontrado' })
  return reply.send({ data: provider })
}

export async function postProvider(request: FastifyRequest, reply: FastifyReply) {
  const body = request.body as any
  try {
    const provider = await createProvider({
      name: body.name, whatsapp: body.whatsapp,
      type: body.type, coverageZones: body.coverageZones ?? [],
    })
    return reply.status(201).send({ data: provider })
  } catch (err: any) {
    if (err?.code === 'P2002') return reply.status(409).send({ error: 'WhatsApp ya registrado' })
    throw err
  }
}

export async function patchProvider(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any
  const body = request.body as any
  return reply.send({ data: await updateProvider(id, body) })
}
