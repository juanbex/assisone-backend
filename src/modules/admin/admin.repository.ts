import { db } from '../../shared/lib/db'

export async function listUsers(tenantId: string) {
  return db.user.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, name: true, email: true, phone: true,
      status: true, createdAt: true,
      userRoles: { include: { role: { select: { id: true, name: true } } } },
    },
  })
}

export async function createUser(data: {
  tenantId: string; name: string; email: string
  password: string; phone?: string; roleIds?: string[]
}) {
  const bcrypt = await import('bcryptjs')
  const hashed = await bcrypt.default.hash(data.password, 12)
  return db.user.create({
    data: {
      tenantId: data.tenantId,
      name:     data.name,
      email:    data.email,
      password: hashed,
      phone:    data.phone,
      userRoles: data.roleIds?.length
        ? { create: data.roleIds.map(roleId => ({ roleId })) }
        : undefined,
    },
    select: {
      id: true, name: true, email: true, phone: true, status: true, createdAt: true,
      userRoles: { include: { role: { select: { id: true, name: true } } } },
    },
  })
}

export async function updateUser(id: string, tenantId: string, data: {
  name?: string; phone?: string; status?: string; roleIds?: string[]
}) {
  if (data.roleIds !== undefined) {
    await db.userRole.deleteMany({ where: { userId: id } })
    if (data.roleIds.length > 0) {
      await db.userRole.createMany({
        data: data.roleIds.map(roleId => ({ userId: id, roleId })),
      })
    }
  }
  return db.user.update({
    where: { id },
    data: { name: data.name, phone: data.phone, status: data.status },
    select: {
      id: true, name: true, email: true, phone: true, status: true,
      userRoles: { include: { role: { select: { id: true, name: true } } } },
    },
  })
}

export async function listRoles(tenantId: string) {
  return db.role.findMany({
    where: { tenantId },
    orderBy: { isSystem: 'desc' },
  })
}

export async function createRole(tenantId: string, name: string, description?: string) {
  return db.role.create({ data: { tenantId, name, description } })
}

export async function seedSystemRoles(tenantId: string) {
  const roles = ['admin', 'agente-front', 'agente-back', 'supervisor', 'proveedor']
  const existing = await db.role.findMany({ where: { tenantId, isSystem: true }, select: { name: true } })
  const existingNames = existing.map(r => r.name)
  const toCreate = roles.filter(r => !existingNames.includes(r))
  if (toCreate.length > 0) {
    await db.role.createMany({
      data: toCreate.map(name => ({ tenantId, name, isSystem: true })),
    })
  }
  return db.role.findMany({ where: { tenantId } })
}
