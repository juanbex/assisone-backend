import { db } from '../../shared/lib/db'

export async function listProviders(params: { search?: string; type?: string; page?: number; limit?: number }) {
  const { search, type, page = 1, limit = 50 } = params
  const skip = (page - 1) * limit
  const where: any = {}
  if (type)   where.type = type
  if (search) where.OR = [
    { name:      { contains: search, mode: 'insensitive' } },
    { whatsapp:  { contains: search, mode: 'insensitive' } },
  ]

  const [data, total] = await Promise.all([
    db.provider.findMany({
      where, skip, take: limit, orderBy: { name: 'asc' },
      include: {
        _count: { select: { assignments: true } },
      },
    }),
    db.provider.count({ where }),
  ])
  return { data, total, page, limit }
}

export async function getProviderById(id: string) {
  return db.provider.findUnique({
    where: { id },
    include: {
      assignments: {
        orderBy: { sentAt: 'desc' },
        take: 20,
        include: {
          service: {
            include: {
              client:      { select: { name: true, policyNumber: true } },
              serviceType: { select: { name: true } },
            },
          },
        },
      },
      _count: { select: { assignments: true, evidences: true } },
    },
  })
}

export async function createProvider(data: {
  name: string
  whatsapp: string
  type: string
  coverageZones?: string[]
}) {
  return db.provider.create({
    data: {
      name:          data.name,
      whatsapp:      data.whatsapp,
      type:          data.type,
      coverageZones: data.coverageZones ?? [],
    },
  })
}

export async function updateProvider(id: string, data: Partial<{
  name: string
  whatsapp: string
  type: string
  coverageZones: string[]
}>) {
  return db.provider.update({ where: { id }, data })
}

export async function getProviderStats() {
  const [total, byType] = await Promise.all([
    db.provider.count(),
    db.provider.groupBy({ by: ['type'], _count: true }),
  ])
  return { total, byType }
}
