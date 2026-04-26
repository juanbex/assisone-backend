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
      { client: { name: { contains: search, mode: 'insensitive' } } },
      { client: { policyNumber: { contains: search, mode: 'insensitive' } } },
    ]
  }
  const [data, total] = await Promise.all([
    db.service.findMany({
      where, skip, take: limit, orderBy: { createdAt: 'desc' },
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
      assignments: { include: { provider: { select: { name: true, whatsapp: true, type: true } } }, orderBy: { sentAt: 'desc' } },
      events:      { orderBy: { createdAt: 'asc' } },
      evidences:   { orderBy: { createdAt: 'desc' } },
      appointments:{ orderBy: { scheduledAt: 'asc' } },
    },
  })
}

export async function countByStatus(tenantId: string) {
  const statuses = ['received','in_coordination','uncoordinated','coordinated','assigned','in_progress','completed','cancelled']
  const counts = await Promise.all(statuses.map(s => db.service.count({ where: { tenantId, status: s } })))
  return Object.fromEntries(statuses.map((s, i) => [s, counts[i]]))
}

export async function createService(data: {
  tenantId: string
  clientName: string
  clientPhone: string
  clientPolicyNumber?: string
  serviceTypeId: string
  location: { address: string; lat?: number; lng?: number }
  notes?: string
  frontAgentId?: string
}) {
  // Find or create client
  let client = await db.client.findFirst({
    where: { tenantId: data.tenantId, phone: data.clientPhone },
  })
  if (!client) {
    client = await db.client.create({
      data: {
        tenantId:     data.tenantId,
        name:         data.clientName,
        phone:        data.clientPhone,
        policyNumber: data.clientPolicyNumber,
      },
    })
  }

  const service = await db.service.create({
    data: {
      tenantId:      data.tenantId,
      clientId:      client.id,
      serviceTypeId: data.serviceTypeId,
      location:      data.location,
      notes:         data.notes,
      frontAgentId:  data.frontAgentId,
      status:        'received',
    },
    include: {
      client:      true,
      serviceType: { include: { category: true } },
    },
  })

  // Register creation event
  await db.serviceEvent.create({
    data: {
      serviceId: service.id,
      eventType: 'created',
      payload:   { message: 'Servicio creado' },
    },
  })

  return service
}

export async function updateServiceStatus(id: string, tenantId: string, status: string, notes?: string) {
  const service = await db.service.update({
    where: { id },
    data: {
      status,
      ...(status === 'completed' ? { completedAt: new Date() } : {}),
    },
  })

  await db.serviceEvent.create({
    data: {
      serviceId: id,
      eventType: 'status_changed',
      payload:   { status, notes: notes ?? '' },
    },
  })

  return service
}

export async function listServiceTypes(tenantId: string) {
  return db.serviceType.findMany({
    where: { OR: [{ tenantId }, { tenantId: null }] },
    include: { category: true },
    orderBy: [{ category: { name: 'asc' } }, { name: 'asc' }],
  })
}
