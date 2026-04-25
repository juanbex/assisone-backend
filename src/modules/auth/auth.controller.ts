import { FastifyRequest, FastifyReply } from 'fastify'
import { LoginSchema, RegisterSchema } from './auth.schema'
import { validateUser, createUser, findUserById } from './auth.service'

export async function login(request: FastifyRequest, reply: FastifyReply) {
  const body = LoginSchema.parse(request.body)
  const user = await validateUser(body.email, body.password)
  if (!user) return reply.status(401).send({ error: 'Credenciales inválidas' })

  const token = await reply.jwtSign({
    id:       user.id,
    email:    user.email,
    tenantId: user.tenantId,
  }, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' })

  return reply.send({
    token,
    user: { id: user.id, name: user.name, email: user.email, tenantId: user.tenantId },
  })
}

export async function register(request: FastifyRequest, reply: FastifyReply) {
  const body = RegisterSchema.parse(request.body)
  try {
    const user = await createUser(body)
    const token = await reply.jwtSign({ id: user.id, email: user.email, tenantId: user.tenantId })
    return reply.status(201).send({ token, user })
  } catch (err: any) {
    if (err?.code === 'P2002') return reply.status(409).send({ error: 'Email ya registrado' })
    throw err
  }
}

export async function me(request: FastifyRequest, reply: FastifyReply) {
  const payload = request.user as any
  const user = await findUserById(payload.id)
  if (!user) return reply.status(404).send({ error: 'Usuario no encontrado' })
  return reply.send({ data: user })
}
