import { FastifyInstance } from 'fastify'
import { authenticate } from '../../shared/middleware/auth.middleware'
import { listUsers, createUser, updateUser, listRoles, createRole, seedSystemRoles } from './admin.repository'

export default async function adminRoutes(app: FastifyInstance) {
  // Users
  app.get('/users', { preHandler: [authenticate] }, async (req, reply) => {
    const user = req.user as any
    return reply.send({ data: await listUsers(user.tenantId) })
  })

  app.post('/users', { preHandler: [authenticate] }, async (req, reply) => {
    const user = req.user as any
    const body = req.body as any
    try {
      const created = await createUser({ tenantId: user.tenantId, ...body })
      return reply.status(201).send({ data: created })
    } catch (err: any) {
      if (err?.code === 'P2002') return reply.status(409).send({ error: 'Email ya registrado' })
      throw err
    }
  })

  app.patch('/users/:id', { preHandler: [authenticate] }, async (req, reply) => {
    const user = req.user as any
    const { id } = req.params as any
    const body = req.body as any
    const updated = await updateUser(id, user.tenantId, body)
    return reply.send({ data: updated })
  })

  // Roles
  app.get('/roles', { preHandler: [authenticate] }, async (req, reply) => {
    const user = req.user as any
    return reply.send({ data: await listRoles(user.tenantId) })
  })

  app.post('/roles', { preHandler: [authenticate] }, async (req, reply) => {
    const user = req.user as any
    const { name, description } = req.body as any
    const role = await createRole(user.tenantId, name, description)
    return reply.status(201).send({ data: role })
  })

  app.post('/seed-roles', { preHandler: [authenticate] }, async (req, reply) => {
    const user = req.user as any
    const roles = await seedSystemRoles(user.tenantId)
    return reply.send({ data: roles })
  })
}
