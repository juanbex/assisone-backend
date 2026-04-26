import { FastifyInstance } from 'fastify'
import { authenticate } from '../../shared/middleware/auth.middleware'
import { listUsers, createUser, updateUser, listRoles, createRole, seedSystemRoles } from './admin.repository'
import { db } from '../../shared/lib/db'

export default async function adminRoutes(app: FastifyInstance) {

  // ── USERS ──────────────────────────────────────────────
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
    return reply.send({ data: await updateUser(id, user.tenantId, body) })
  })

  // ── ROLES ──────────────────────────────────────────────
  app.get('/roles', { preHandler: [authenticate] }, async (req, reply) => {
    const user = req.user as any
    return reply.send({ data: await listRoles(user.tenantId) })
  })

  app.post('/roles', { preHandler: [authenticate] }, async (req, reply) => {
    const user = req.user as any
    const { name, description } = req.body as any
    return reply.status(201).send({ data: await createRole(user.tenantId, name, description) })
  })

  app.delete('/roles/:id', { preHandler: [authenticate] }, async (req, reply) => {
    const { id } = req.params as any
    await db.userRole.deleteMany({ where: { roleId: id } })
    await db.rolePermission.deleteMany({ where: { roleId: id } })
    await db.role.delete({ where: { id } })
    return reply.send({ ok: true })
  })

  app.post('/seed-roles', { preHandler: [authenticate] }, async (req, reply) => {
    const user = req.user as any
    return reply.send({ data: await seedSystemRoles(user.tenantId) })
  })

  // ── TENANTS ──────────────────────────────────────────────
  app.get('/tenants', { preHandler: [authenticate] }, async (_req, reply) => {
    const tenants = await db.tenant.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { users: true, services: true } } },
    })
    return reply.send({ data: tenants })
  })

  app.post('/tenants', { preHandler: [authenticate] }, async (req, reply) => {
    const { name, slug, config } = req.body as any
    try {
      const tenant = await db.tenant.create({ data: { name, slug, config: config ?? {} } })
      return reply.status(201).send({ data: tenant })
    } catch (err: any) {
      if (err?.code === 'P2002') return reply.status(409).send({ error: 'Slug ya existe' })
      throw err
    }
  })

  app.patch('/tenants/:id', { preHandler: [authenticate] }, async (req, reply) => {
    const { id } = req.params as any
    const { name, config } = req.body as any
    const tenant = await db.tenant.update({ where: { id }, data: { name, config } })
    return reply.send({ data: tenant })
  })
}
