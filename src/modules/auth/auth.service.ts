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
  return db.user.create({
    data: {
      name:     data.name,
      email:    data.email,
      password: hashed,
      tenantId: data.tenantId,
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
