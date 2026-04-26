import { db } from '../../shared/lib/db'
import { whatsappPushQueue, coordinationTimerQueue } from '../../shared/lib/bullmq'

const TIMER_DELAY_MS = 10 * 60 * 1000

function normalize(str: string): string {
  return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-').trim()
}

export async function startCoordination(serviceId: string) {
  const service = await db.service.findUnique({
    where: { id: serviceId },
    include: { serviceType: true, client: true },
  })
  if (!service) throw new Error('Servicio no encontrado')

  const locationStr = (service.location as any)?.address ?? ''
  const normalizedServiceType = normalize(service.serviceType.name)
  const allProviders = await db.provider.findMany()

  const eligible = allProviders.filter((p: any) => {
    const normalizedProviderType = normalize(p.type)
    const typeMatch =
      normalizedProviderType === normalizedServiceType ||
      normalizedProviderType.includes(normalizedServiceType.split('-')[0]) ||
      normalizedServiceType.includes(normalizedProviderType.split('-')[0])
    if (!typeMatch) return false
    const zones: string[] = p.coverageZones ?? []
    if (zones.length === 0) return true
    if (!locationStr) return true
    return zones.some(z =>
      normalize(locationStr).includes(normalize(z)) ||
      normalize(z).includes(normalize(locationStr.split(',')[0] ?? ''))
    )
  })

  if (eligible.length === 0) {
    await db.service.update({ where: { id: serviceId }, data: { status: 'uncoordinated' } })
    await db.serviceEvent.create({
      data: {
        serviceId,
        eventType: 'coordination_failed',
        payload: { reason: `Sin proveedores para tipo "${service.serviceType.name}" en "${locationStr || 'cualquier zona'}"` },
      },
    })
    return { eligible: 0, assignments: 0 }
  }

  const assignments = await Promise.all(
    eligible.map(async (provider: any) => {
      const assignment = await db.serviceAssignment.create({
        data: { serviceId, providerId: provider.id, status: 'pending' },
      })
      await whatsappPushQueue.add(`push-${assignment.id}`, {
        assignmentId: assignment.id,
        to:           provider.whatsapp,
        providerName: provider.name,
        serviceType:  service.serviceType.name,
        location:     locationStr || 'Sin dirección especificada',
        timestamp:    new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }),
      })
      return assignment
    })
  )

  await db.service.update({ where: { id: serviceId }, data: { status: 'in_coordination' } })
  await db.serviceEvent.create({
    data: {
      serviceId,
      eventType: 'coordination_started',
      payload: { providersContacted: eligible.length, assignmentIds: assignments.map(a => a.id) },
    },
  })
  await coordinationTimerQueue.add(`timer-${serviceId}`, { serviceId }, { delay: TIMER_DELAY_MS, jobId: `timer-${serviceId}` })

  return { eligible: eligible.length, assignments: assignments.length }
}

export async function acceptAssignment(assignmentId: string, from: string) {
  const assignment = await db.serviceAssignment.findUnique({ where: { id: assignmentId } })
  if (!assignment || assignment.status !== 'pending') return null

  await db.serviceAssignment.update({ where: { id: assignmentId }, data: { status: 'accepted', respondedAt: new Date() } })
  await db.serviceAssignment.updateMany({
    where: { serviceId: assignment.serviceId, status: 'pending', id: { not: assignmentId } },
    data: { status: 'cancelled' },
  })
  await db.service.update({ where: { id: assignment.serviceId }, data: { status: 'coordinated' } })

  const job = await coordinationTimerQueue.getJob(`timer-${assignment.serviceId}`)
  if (job) await job.remove()

  await db.serviceEvent.create({
    data: {
      serviceId: assignment.serviceId,
      eventType: 'provider_accepted',
      payload: { assignmentId, providerWhatsapp: from },
    },
  })

  return assignment
}

export async function rejectAssignment(assignmentId: string) {
  const assignment = await db.serviceAssignment.findUnique({ where: { id: assignmentId } })
  if (!assignment || assignment.status !== 'pending') return null
  await db.serviceAssignment.update({ where: { id: assignmentId }, data: { status: 'rejected', respondedAt: new Date() } })
  return assignment
}
