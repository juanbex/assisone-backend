import { FastifyRequest, FastifyReply } from 'fastify'
export async function authenticate(req: FastifyRequest, reply: FastifyReply) {
  try { await req.jwtVerify() } catch { reply.status(401).send({ error: 'Unauthorized' }) }
}
