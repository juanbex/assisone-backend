import { FastifyInstance } from 'fastify'
import { db } from '../../shared/lib/db'
import { sendText } from '../notifications/whatsapp.service'
import { evidenceUploadQueue } from '../../shared/lib/bullmq'
import { acceptAssignment, rejectAssignment, saveProviderEta, handleClientArrivalConfirmation, buildPhoneVariants } from '../assignments/assignments.service'
import { parseEtaText } from '../../shared/utils/eta-parser'

// Keywords que solo registran eventos en el timeline (sin cambiar estado)
const PROVIDER_EVENTS: Record<string, string> = {
  'EN CAMINO': 'provider_en_camino',
  'LLEGUE':    'provider_llegue',
  'LLEGU':     'provider_llegue',
}

const ACCEPT_KEYWORDS = ['aceptar', 'acepto', 'si', 'sí', 'ok', 'yes', 'dale', 'listo', 'confirmo', 'confirmado']
const REJECT_KEYWORDS = ['rechazar', 'rechazado', 'no puedo', 'no puedo atender', 'ocupado']

// FINALIZADO sí cambia estado a completed
const FINALIZADO_KEYWORDS = ['finalizado', 'finalice', 'finalize', 'termine', 'listo termine']

const TWIML_EMPTY = '<Response></Response>'

export default async function whatsappRoutes(app: FastifyInstance) {
  app.get('/whatsapp', async (_req, reply) => reply.send('ok'))

  app.post('/whatsapp', async (req: any, reply) => {
    reply.header('Content-Type', 'text/xml')

    const body     = req.body as any
    const rawFrom  = (body?.From ?? '').replace('whatsapp:', '').trim()
    const msgBody  = (body?.Body ?? '').trim()
    const msgLower = msgBody.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

    if (!rawFrom) return reply.send(TWIML_EMPTY)

    console.log(`[webhook] De: ${rawFrom} | Mensaje: "${msgBody}"`)

    const phoneVariants = buildPhoneVariants(rawFrom)

    // ── Determinar si es cliente o proveedor ─────────────────────────
    const isProvider = await db.provider.findFirst({
      where: { whatsapp: { in: phoneVariants } },
    })

    // ── FLUJO CLIENTE ────────────────────────────────────────────────
    if (!isProvider) {
      const yesKw = ['si', 'si llego', 'ya llego', 'llego', 'yes', 'confirmo', 'claro', 'afirmativo']
      const noKw  = ['no', 'no llego', 'no ha llegado', 'todavia no', 'aun no', 'negativo']

      if (yesKw.includes(msgLower)) {
        const service = await handleClientArrivalConfirmation(rawFrom, true)
        if (service) {
          await sendText(rawFrom,
            `✅ ¡Perfecto! Nos alegra que el técnico haya llegado.\n` +
            `Tu servicio está en curso. Te notificaremos al finalizar. ¡Que todo salga bien!`
          )
        }
        return reply.send(TWIML_EMPTY)
      }

      if (noKw.includes(msgLower)) {
        const service = await handleClientArrivalConfirmation(rawFrom, false)
        if (service) {
          await sendText(rawFrom,
            `⚠️ Lamentamos el inconveniente. Un agente de AssisPrex se comunicará contigo en los próximos minutos. Gracias por tu paciencia.`
          )
        }
        return reply.send(TWIML_EMPTY)
      }

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

    // ── ETA: parsear texto libre ──────────────────────────────────────
    const etaMinutes = parseEtaText(msgBody)
    if (etaMinutes !== null) {
      const assignment = await findAcceptedAssignment()
      if (assignment) {
        console.log(`[eta] Guardando ETA: ${etaMinutes} min para assignment ${assignment.id}`)
        const result = await saveProviderEta(rawFrom, etaMinutes)
        if (result) {
          await sendText(rawFrom, `⏱ Perfecto, registramos *${etaMinutes} minutos* de tiempo estimado. ¡El cliente fue informado!`)
        }
        return reply.send(TWIML_EMPTY)
      }
    }

    // ── FINALIZADO → cambiar estado a completed ───────────────────────
    if (FINALIZADO_KEYWORDS.some(k => msgLower.includes(k))) {
      const assignment = await findAcceptedAssignment()
      if (assignment) {
        await db.service.update({ where: { id: assignment.serviceId }, data: { status: 'completed', completedAt: new Date() } })
        await db.serviceEvent.create({
          data: {
            serviceId: assignment.serviceId,
            eventType: 'provider_finalizado',
            payload: { keyword: msgBody, providerWhatsapp: rawFrom },
          },
        })
        await sendText(rawFrom, '✅ Servicio finalizado. ¡Gracias por tu excelente servicio!')
      }
      return reply.send(TWIML_EMPTY)
    }

    // ── EN CAMINO / LLEGUE → solo registrar evento (no cambia estado) ─
    const eventType = Object.entries(PROVIDER_EVENTS).find(([k]) => msgBody.toUpperCase().includes(k))?.[1]
    if (eventType) {
      const assignment = await findAcceptedAssignment()
      if (assignment) {
        await db.serviceEvent.create({
          data: {
            serviceId: assignment.serviceId,
            eventType,
            payload: { keyword: msgBody, providerWhatsapp: rawFrom },
          },
        })
        if (eventType === 'provider_en_camino') {
          await sendText(rawFrom, '👍 Registrado. El cliente fue notificado que vas en camino.')
        } else {
          await sendText(rawFrom, '📍 Registrado que llegaste. Cuando termines responde: *FINALIZADO*')
        }
      }
      return reply.send(TWIML_EMPTY)
    }

    // ── Aceptar ───────────────────────────────────────────────────────
    if (ACCEPT_KEYWORDS.includes(msgLower)) {
      const pending = await findPendingAssignment()
      if (pending) {
        const result = await acceptAssignment(pending.id, rawFrom) as any
        if (result) {
          const service = result.service
          const location = (service?.location as any)?.address ?? ''
          const mapUrl = location ? `\n\n🗺 Ver ubicación: https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}` : ''
          await sendText(rawFrom,
            `✅ *Servicio aceptado* #${result.serviceId.slice(0, 8).toUpperCase()}\n\n` +
            `👤 Cliente: ${service?.client?.name ?? '—'}\n` +
            `🔧 Tipo: ${service?.serviceType?.name ?? '—'}\n` +
            `📍 Ubicación: ${location || '—'}${mapUrl}\n\n` +
            `⏱ *¿En cuántos minutos llegas?*\n` +
            `Puedes responder: *15*, *media hora*, *1 hora*, *1 hora 30*, etc.`
          )
        } else {
          await sendText(rawFrom, '⚠️ Este servicio ya fue tomado por otro proveedor.')
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

    // ── Rechazar ──────────────────────────────────────────────────────
    if (REJECT_KEYWORDS.some(k => msgLower.includes(k))) {
      const assignment = await findPendingAssignment()
      if (assignment) {
        await rejectAssignment(assignment.id)
        await sendText(rawFrom, 'Entendido, gracias. Te contactaremos para el próximo caso.')
      }
      return reply.send(TWIML_EMPTY)
    }

    // ── Evidencias ────────────────────────────────────────────────────
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
