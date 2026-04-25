import { db } from '../../shared/lib/db'

export async function listProviders(params: { type?: string; search?: string; zone?: string }) {
  const { type, search, zone } = params
  const where: any = {}
  if (type) where.type = type
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { whatsapp: { contains: search } },
    ]
  }

  const providers = await db.provider.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { assignments: true } },
    },
  })

  if (zone) {
    return providers.filter((p: any) => {
      const zones: string[] = p.coverageZones ?? []
      return zones.some(z => z.toLowerCase().includes(zone.toLowerCase()))
    })
  }

  return providers
}

export async function getProviderById(id: string) {
  return db.provider.findUnique({
    where: { id },
    include: {
      _count: { select: { assignments: true } },
      assignments: {
        orderBy: { sentAt: 'desc' },
        take: 20,
        include: {
          service: {
            select: {
              id: true, status: true, createdAt: true,
              serviceType: { select: { name: true } },
              client: { select: { name: true } },
            },
          },
        },
      },
    },
  })
}

export async function createProvider(data: {
  name: string; whatsapp: string; type: string; coverageZones: string[]
}) {
  return db.provider.create({ data: { ...data, coverageZones: data.coverageZones } })
}

export async function updateProvider(id: string, data: {
  name?: string; whatsapp?: string; type?: string; coverageZones?: string[]
}) {
  return db.provider.update({ where: { id }, data })
}

export async function getProviderStats() {
  const [total, byType] = await Promise.all([
    db.provider.count(),
    db.provider.groupBy({ by: ['type'], _count: { _all: true } }),
  ])
  return { total, byType }
}
