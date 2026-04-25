import { db } from '../../shared/lib/db'
import { whatsappPushQueue, coordinationTimerQueue } from '../../shared/lib/bullmq'
import { sendProviderPush } from '../notifications/whatsapp.service'

const TIMER_DELAY_MS = 10 * 60 * 1000 // 10 minutos

export async function startCoordination(serviceId: string) {
  const service = await db.service.findUnique({
    where: { id: serviceId },
    include: {
      serviceType: true,
      client:      true,
    },
  })

  if (!service) throw new Error('Servicio no encontrado')

  const location = service.location as any
  const locationStr = location?.address ?? 'Ubicación no especificada'

  // Buscar proveedores elegibles por tipo y zona de cobertura
  const allProviders = await db.provider.findMany()

  const eligible = allProviders.filter((p: any) => {
    const zones: string[] = p.coverageZones ?? []
    const typeMatch = p.type === service.serviceType.name.toLowerCase().replace(/ /g, '-')
      || p.type === service.serviceType.name.toLowerCase()
      || p.type.includes(service.serviceType.name.toLowerCase().split(' ')[0])

    if (!typeMatch) return false
    if (zones.length === 0) return true // proveedor sin zonas = disponible en toda la ciudad

    // Filtrar por zona si el servicio tiene dirección
    if (!locationStr || locationStr === 'Ubicación no especificada') return true
    return zones.some(z =>
      locationStr.toLowerCase().includes(z.toLowerCase()) ||
      z.toLowerCase().includes(locationStr.split(',')[0]?.toLowerCase() ?? '')
    )
  })

  if (eligible.length === 0) {
    // Sin proveedores elegibles → pasar directo a no coordinado
    await db.service.update({
      where: { id: serviceId },
      data: { status: 'uncoordinated' },
    })
    await db.serviceEvent.create({
      data: {
        serviceId,
        eventType: 'coordination_failed',
        payload: { reason: 'No hay proveedores disponibles para este tipo y zona' },
      },
    })
    return { eligible: 0, assignments: 0 }
  }

  // Crear registros de asignación + encolar push WhatsApp por cada proveedor
  const assignments = await Promise.all(
    eligible.map(async (provider: any) => {
      const assignment = await db.serviceAssignment.create({
        data: {
          serviceId,
          providerId: provider.id,
          status:     'pending',
        },
      })

      // Encolar push WhatsApp (no bloqueante)
      await whatsappPushQueue.add(`push-${assignment.id}`, {
        assignmentId: assignment.id,
        providerId:   provider.id,
        serviceId,
        to:           provider.whatsapp,
        serviceType:  service.serviceType.name,
        location:     locationStr,
        description:  (service.notes ?? service.client.name) || 'Sin detalles',
        timestamp:    new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }),
      })

      return assignment
    })
  )

  // Actualizar status + registrar evento
  await db.service.update({
    where: { id: serviceId },
    data: { status: 'in_coordination' },
  })

  await db.serviceEvent.create({
    data: {
      serviceId,
      eventType: 'coordination_started',
      payload: {
        providersContacted: eligible.length,
        assignmentIds: assignments.map(a => a.id),
      },
    },
  })

  // Encolar timer de 10 minutos
  await coordinationTimerQueue.add(
    `timer-${serviceId}`,
    { serviceId },
    { delay: TIMER_DELAY_MS, jobId: `timer-${serviceId}` }
  )

  return { eligible: eligible.length, assignments: assignments.length }
}

export async function acceptAssignment(assignmentId: string, from: string) {
  const assignment = await db.serviceAssignment.findUnique({ where: { id: assignmentId } })
  if (!assignment || assignment.status !== 'pending') return null

  // Aceptar este proveedor
  await db.serviceAssignment.update({
    where: { id: assignmentId },
    data: { status: 'accepted', respondedAt: new Date() },
  })

  // Cancelar los demás assignments del mismo servicio
  await db.serviceAssignment.updateMany({
    where: { serviceId: assignment.serviceId, status: 'pending', id: { not: assignmentId } },
    data: { status: 'cancelled' },
  })

  // Mover el servicio a coordinado
  await db.service.update({
    where: { id: assignment.serviceId },
    data: { status: 'coordinated' },
  })

  // Cancelar el timer BullMQ
  const job = await coordinationTimerQueue.getJob(`timer-${assignment.serviceId}`)
  if (job) await job.remove()

  // Registrar evento
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

  await db.serviceAssignment.update({
    where: { id: assignmentId },
    data: { status: 'rejected', respondedAt: new Date() },
  })

  return assignment
}
