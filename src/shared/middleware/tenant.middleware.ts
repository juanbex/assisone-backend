import { FastifyRequest, FastifyReply } from 'fastify'
export async function requireTenant(req: FastifyRequest, reply: FastifyReply) {
  const user = req.user as any
  if (!user?.tenantId) reply.status(403).send({ error: 'Tenant context required' })
}
