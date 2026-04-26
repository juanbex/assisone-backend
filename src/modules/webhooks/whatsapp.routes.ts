import { FastifyInstance } from 'fastify'
import { db } from '../../shared/lib/db'
import { sendText } from '../notifications/whatsapp.service'
import { evidenceUploadQueue } from '../../shared/lib/bullmq'
import { acceptAssignment, rejectAssignment, saveProviderEta, handleClientArrivalConfirmation, buildPhoneVariants } from '../assignments/assignments.service'

const STATUS_MAP: Record<string, string> = {
  'EN CAMINO':  'assigned',
  'LLEGUE':     'in_progress',
  'FINALIZADO': 'completed',
}

const REPLIES: Record<string, string> = {
  assigned:    '👍 El cliente fue notificado. ¡Buen camino!',
  in_progress: '📸 Perfecto. Cuando termines sube las evidencias y responde FINALIZADO.',
  completed:   '✅ Servicio finalizado. ¡Gracias!',
}

const ACCEPT_KEYWORDS = ['aceptar', 'acepto', 'si', 'sí', 'ok', 'yes']
const REJECT_KEYWORDS = ['rechazar', 'no puedo', 'no', 'rechazado']

const TWIML_EMPTY = '<Response></Response>'

export default async function whatsappRoutes(app: FastifyInstance) {
  app.get('/whatsapp', async (_req, reply) => reply.send('ok'))

  app.post('/whatsapp', async (req: any, reply) => {
    reply.header('Content-Type', 'text/xml')

    const body     = req.body as any
    const rawFrom  = (body?.From ?? '').replace('whatsapp:', '').trim()
    const msgBody  = (body?.Body ?? '').trim()
    const msgLower = msgBody.toLowerCase()

    if (!rawFrom) return reply.send(TWIML_EMPTY)

    const phoneVariants = buildPhoneVariants(rawFrom)

    // ── Determinar si es cliente o proveedor ─────────────────────────
    const isProvider = await db.provider.findFirst({
      where: { whatsapp: { in: phoneVariants } },
    })

    // ── FLUJO CLIENTE ────────────────────────────────────────────────
    if (!isProvider) {
      const yesKeywords = ['si', 'sí', 'yes', 'si llegó', 'ya llegó', 'llegó', 'llego']
      const noKeywords  = ['no', 'no llegó', 'no ha llegado', 'todavia no', 'todavía no', 'aun no', 'aún no']

      if (yesKeywords.includes(msgLower)) {
        const service = await handleClientArrivalConfirmation(rawFrom, true)
        if (service) {
          await sendText(rawFrom,
            `✅ ¡Perfecto! Nos alegra que el técnico haya llegado.\n\n` +
            `Tu servicio de *${(service as any).serviceType?.name}* está en curso.\n` +
            `Te notificaremos al finalizar. ¡Que todo salga bien!`
          )
        }
        return reply.send(TWIML_EMPTY)
      }

      if (noKeywords.includes(msgLower)) {
        const service = await handleClientArrivalConfirmation(rawFrom, false)
        if (service) {
          await sendText(rawFrom,
            `⚠️ Lamentamos el inconveniente. Estamos verificando la situación con el proveedor.\n\n` +
            `Un agente de AssisPrex se comunicará contigo en los próximos minutos.\n` +
            `Gracias por tu paciencia.`
          )
          // El agente back verá la alerta en el dashboard de seguimiento
          console.log(`[webhook] ALERTA: Cliente ${rawFrom} reporta que proveedor NO llegó en servicio ${service.id}`)
        }
        return reply.send(TWIML_EMPTY)
      }

      // Cliente envía otro mensaje — no hacer nada
      return reply.send(TWIML_EMPTY)
    }

    // ── FLUJO PROVEEDOR ──────────────────────────────────────────────
    const findPendingAssignment = () =>
      db.serviceAssignment.findFirst({
        where: { provider: { whatsapp: { in: phoneVariants } }, status: 'pending' },
        orderBy: { sentAt: 'desc' },
      })

    const findCancelledAssignment = () =>
      db.serviceAssignment.findFirst({
        where: { provider: { whatsapp: { in: phoneVariants } }, status: 'cancelled' },
        orderBy: { sentAt: 'desc' },
      })

    const findAcceptedAssignment = () =>
      db.serviceAssignment.findFirst({
        where: { provider: { whatsapp: { in: phoneVariants } }, status: 'accepted' },
      })

    // ETA: responde con número de minutos
    const etaMatch = msgBody.match(/^(\d{1,3})\s*(min|minutos?)?$/i)
    if (etaMatch) {
      const minutes = parseInt(etaMatch[1])
      if (minutes > 0 && minutes <= 300) {
        const assignment = await findAcceptedAssignment()
        if (assignment) {
          await saveProviderEta(rawFrom, minutes)
          await sendText(rawFrom, `⏱ Perfecto, registramos ${minutes} minutos de tiempo estimado. ¡El cliente fue informado!`)
          return reply.send(TWIML_EMPTY)
        }
      }
    }

    // Aceptar
    if (ACCEPT_KEYWORDS.includes(msgLower)) {
      const pending = await findPendingAssignment()
      if (pending) {
        const result = await acceptAssignment(pending.id, rawFrom) as any
        if (result) {
          const service = result.service
          const location = (service?.location as any)?.address ?? 'Ver detalles en el sistema'
          const mapUrl = location !== 'Ver detalles en el sistema'
            ? `\n\n🗺 Ver ubicación: https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`
            : ''
          await sendText(rawFrom,
            `✅ *Servicio aceptado* #${result.serviceId.slice(0, 8).toUpperCase()}\n\n` +
            `👤 Cliente: ${service?.client?.name ?? '—'}\n` +
            `🔧 Tipo: ${service?.serviceType?.name ?? '—'}\n` +
            `📍 Ubicación: ${location}${mapUrl}\n\n` +
            `⏱ *¿En cuántos minutos llegas?*\nResponde solo con el número (ej: *15*)`
          )
        } else {
          await sendText(rawFrom, '⚠️ Este servicio ya fue tomado por otro proveedor en este momento.')
        }
      } else {
        const cancelled = await findCancelledAssignment()
        if (cancelled) {
          await sendText(rawFrom, '⚠️ Este servicio ya fue coordinado con otro proveedor. Gracias por tu disposición.')
        } else {
          await sendText(rawFrom, 'No tienes solicitudes pendientes en este momento.')
        }
      }
      return reply.send(TWIML_EMPTY)
    }

    // Rechazar
    if (REJECT_KEYWORDS.includes(msgLower)) {
      const assignment = await findPendingAssignment()
      if (assignment) {
        await rejectAssignment(assignment.id)
        await sendText(rawFrom, 'Entendido, gracias. Te contactaremos para el próximo caso.')
      }
      return reply.send(TWIML_EMPTY)
    }

    // Keywords de estado
    const nextStatus = STATUS_MAP[msgBody.toUpperCase()]
    if (nextStatus) {
      const assignment = await findAcceptedAssignment()
      if (assignment) {
        await db.service.update({ where: { id: assignment.serviceId }, data: { status: nextStatus } })
        await db.serviceEvent.create({
          data: {
            serviceId: assignment.serviceId,
            eventType: 'provider_status_update',
            payload: { status: nextStatus, keyword: msgBody, providerWhatsapp: rawFrom },
          },
        })
        await sendText(rawFrom, REPLIES[nextStatus] || 'Estado actualizado.')
      }
      return reply.send(TWIML_EMPTY)
    }

    // Evidencias
    const numMedia = parseInt(body?.NumMedia ?? '0')
    if (numMedia > 0) {
      const mediaUrl  = body?.MediaUrl0
      const mediaType = body?.MediaContentType0 ?? 'image/jpeg'
      if (mediaUrl) {
        await evidenceUploadQueue.add('upload', {
          mediaUrl, from: rawFrom,
          type: mediaType.startsWith('image') ? 'image' : 'document',
        })
        await sendText(rawFrom, '📸 Evidencia recibida.')
      }
    }

    return reply.send(TWIML_EMPTY)
  })
}
