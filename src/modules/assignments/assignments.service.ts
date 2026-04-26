import { db } from '../../shared/lib/db'
import { whatsappPushQueue, coordinationTimerQueue, arrivalCheckQueue } from '../../shared/lib/bullmq'
import { sendText } from '../notifications/whatsapp.service'

const TIMER_DELAY_MS = 10 * 60 * 1000

function normalize(str: string): string {
  return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-').trim()
}

export function buildPhoneVariants(raw: string): string[] {
  const digits = raw.replace(/\D/g, '')
  const variants = new Set<string>()
  variants.add(digits)
  variants.add(`+${digits}`)
  if (digits.startsWith('57')) {
    variants.add(digits.slice(2))
    variants.add(`+${digits.slice(2)}`)
  } else {
    variants.add(`57${digits}`)
    variants.add(`+57${digits}`)
  }
  return Array.from(variants)
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
  const assignment = await db.serviceAssignment.findUnique({
    where: { id: assignmentId },
    include: { service: { include: { serviceType: true, client: true } } },
  })
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

export async function saveProviderEta(from: string, minutes: number) {
  const assignment = await db.serviceAssignment.findFirst({
    where: { provider: { whatsapp: { in: buildPhoneVariants(from) } }, status: 'accepted' },
    include: {
      service: { include: { client: true, serviceType: true } },
      provider: true,
    },
  })
  if (!assignment) return null

  await db.serviceAssignment.update({
    where: { id: assignment.id },
    data: { etaMinutes: minutes },
  })

  await db.serviceEvent.create({
    data: {
      serviceId: assignment.serviceId,
      eventType: 'eta_set',
      payload: { etaMinutes: minutes, providerWhatsapp: from },
    },
  })

  // Notificar al cliente que el proveedor va en camino con ETA
  const client = assignment.service?.client
  const serviceType = assignment.service?.serviceType?.name ?? 'servicio'
  const providerName = assignment.provider?.name ?? 'El proveedor'

  if (client?.phone) {
    try {
      await sendText(
        client.phone,
        `✅ *Tu ${serviceType} está confirmado*\n\n` +
        `🚗 ${providerName} va en camino hacia ti.\n` +
        `⏱ *Tiempo estimado de llegada: ${minutes} minutos*\n\n` +
        `Te confirmaremos cuando llegue. ¡Gracias por tu paciencia!`
      )
    } catch (err: any) {
      console.error(`[eta] Error notificando cliente:`, err.message)
    }

    // Programar verificación de llegada cuando venza el ETA
    await arrivalCheckQueue.add(
      `arrival-${assignment.serviceId}`,
      {
        serviceId:   assignment.serviceId,
        clientPhone: client.phone,
        clientName:  client.name,
        serviceType,
        providerName,
        assignmentId: assignment.id,
      },
      {
        delay:  minutes * 60 * 1000,
        jobId: `arrival-${assignment.serviceId}`,
      }
    )
    console.log(`[eta] Verificación de llegada programada en ${minutes} min para servicio ${assignment.serviceId}`)
  }

  return assignment
}

// Confirmación de llegada del cliente
export async function handleClientArrivalConfirmation(clientPhone: string, confirmed: boolean) {
  // Buscar servicio activo del cliente (en assigned o in_progress)
  const service = await db.service.findFirst({
    where: {
      client: { phone: { in: buildPhoneVariants(clientPhone) } },
      status: { in: ['assigned', 'in_progress', 'coordinated'] },
    },
    include: { client: true, serviceType: true },
    orderBy: { createdAt: 'desc' },
  })

  if (!service) return null

  if (confirmed) {
    // Cliente confirma que el técnico llegó → En prestación
    await db.service.update({ where: { id: service.id }, data: { status: 'in_service' } })
    await db.serviceEvent.create({
      data: {
        serviceId: service.id,
        eventType: 'client_confirmed_arrival',
        payload: { clientPhone, confirmed: true },
      },
    })
  } else {
    // Cliente dice que NO llegó → registrar evento + alerta para agente back
    await db.serviceEvent.create({
      data: {
        serviceId: service.id,
        eventType: 'client_denied_arrival',
        payload: { clientPhone, confirmed: false, alert: 'El cliente reporta que el proveedor NO ha llegado' },
      },
    })
  }

  return service
}

export async function getServicesForTracking(tenantId: string) {
  const services = await db.service.findMany({
    where: {
      tenantId,
      status: { in: ['coordinated', 'assigned', 'in_progress', 'in_service'] },
    },
    orderBy: { createdAt: 'desc' },
    include: {
      client:      { select: { name: true, phone: true, policyNumber: true } },
      serviceType: { select: { name: true, category: { select: { name: true } } } },
      frontAgent:  { select: { name: true } },
      backAgent:   { select: { name: true } },
      assignments: {
        where: { status: 'accepted' },
        take: 1,
        include: { provider: { select: { name: true, whatsapp: true } } },
      },
    },
  })

  return services.map(s => ({
    ...s,
    acceptedAssignment: s.assignments[0] ?? null,
  }))
}
