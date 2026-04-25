import bcrypt from 'bcryptjs'
import { db } from '../../shared/lib/db'
import type { RegisterInput } from './auth.schema'

export async function validateUser(email: string, password: string) {
  const user = await db.user.findUnique({ where: { email } })
  if (!user) return null
  const valid = await bcrypt.compare(password, user.password)
  if (!valid) return null
  return user
}

export async function createUser(data: RegisterInput) {
  const hashed = await bcrypt.hash(data.password, 12)

  // Si no viene tenantId, crea un tenant automáticamente
  let tenantId = data.tenantId
  if (!tenantId) {
    const tenantName = data.tenantName || `${data.name}'s workspace`
    const slug = tenantName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-')
    const tenant = await db.tenant.create({
      data: {
        name: tenantName,
        slug: `${slug}-${Date.now()}`,
      },
    })
    tenantId = tenant.id
  }

  return db.user.create({
    data: {
      name:     data.name,
      email:    data.email,
      password: hashed,
      tenantId,
    },
    select: { id: true, name: true, email: true, tenantId: true, status: true, createdAt: true },
  })
}

export async function findUserById(id: string) {
  return db.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, tenantId: true, status: true },
  })
}
