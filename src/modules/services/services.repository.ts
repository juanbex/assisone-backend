import { db } from '../../shared/lib/db'

export async function listServices(params: {
  tenantId: string
  status?: string
  search?: string
  page?: number
  limit?: number
}) {
  const { tenantId, status, search, page = 1, limit = 50 } = params
  const skip = (page - 1) * limit

  const where: any = { tenantId }
  if (status) where.status = status
  if (search) {
    where.OR = [
      { id: { contains: search, mode: 'insensitive' } },
      { client: { name: { contains: search, mode: 'insensitive' } } },
      { client: { policyNumber: { contains: search, mode: 'insensitive' } } },
    ]
  }

  const [data, total] = await Promise.all([
    db.service.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        client:      { select: { name: true, policyNumber: true, phone: true } },
        serviceType: { select: { name: true, category: { select: { name: true } } } },
        frontAgent:  { select: { name: true } },
        backAgent:   { select: { name: true } },
      },
    }),
    db.service.count({ where }),
  ])

  return { data, total, page, limit }
}

export async function getServiceById(id: string, tenantId: string) {
  return db.service.findFirst({
    where: { id, tenantId },
    include: {
      client:      true,
      serviceType: { include: { category: true } },
      frontAgent:  { select: { id: true, name: true, email: true } },
      backAgent:   { select: { id: true, name: true, email: true } },
      assignments: { include: { provider: { select: { name: true, whatsapp: true, type: true } } } },
      events:      { orderBy: { createdAt: 'asc' } },
      evidences:   true,
      appointments:true,
    },
  })
}

export async function countByStatus(tenantId: string) {
  const statuses = ['received','in_coordination','uncoordinated','coordinated','assigned','in_progress','completed','cancelled']
  const counts = await Promise.all(
    statuses.map(s => db.service.count({ where: { tenantId, status: s } }))
  )
  return Object.fromEntries(statuses.map((s, i) => [s, counts[i]]))
}
