import { FastifyInstance } from 'fastify'
import { db } from '../../shared/lib/db'
import { sendText, sendAssignmentConfirmation } from '../notifications/whatsapp.service'
import { evidenceUploadQueue } from '../../shared/lib/bullmq'
import { acceptAssignment, rejectAssignment } from '../assignments/assignments.service'

const STATUS_MAP: Record<string, string> = {
  'EN CAMINO':  'assigned',
  'LLEGUE':     'in_progress',
  'FINALIZADO': 'completed',
}

const REPLIES: Record<string, string> = {
  assigned:    '👍 El cliente fue notificado. ¡Buen camino!',
  in_progress: '📸 Cuando termines sube las evidencias y responde FINALIZADO.',
  completed:   '✅ Servicio finalizado. ¡Gracias!',
}

function normalizePhone(raw: string): string[] {
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

const ACCEPT_KEYWORDS = ['aceptar', 'acepto', 'si', 'sí', 'ok', 'yes']
const REJECT_KEYWORDS = ['rechazar', 'no puedo', 'no', 'rechazado']

export default async function whatsappRoutes(app: FastifyInstance) {
  app.get('/whatsapp', async (_req, reply) => reply.send('ok'))

  app.post('/whatsapp', async (req: any, reply) => {
    const body     = req.body as any
    const rawFrom  = (body?.From ?? '').replace('whatsapp:', '').trim()
    const msgBody  = (body?.Body ?? '').trim()
    const msgLower = msgBody.toLowerCase()

    if (!rawFrom) return reply.send('ok')

    const phoneVariants = normalizePhone(rawFrom)

    const findPendingAssignment = () =>
      db.serviceAssignment.findFirst({
        where: { provider: { whatsapp: { in: phoneVariants } }, status: 'pending' },
        orderBy: { sentAt: 'desc' },
      })

    const findAcceptedAssignment = () =>
      db.serviceAssignment.findFirst({
        where: { provider: { whatsapp: { in: phoneVariants } }, status: 'accepted' },
      })

    // ── Aceptar ──────────────────────────────────────────────────────
    if (ACCEPT_KEYWORDS.includes(msgLower)) {
      const assignment = await findPendingAssignment()
      if (assignment) {
        const result = await acceptAssignment(assignment.id, rawFrom)
        if (result) {
          await sendAssignmentConfirmation(rawFrom, assignment.serviceId)
        } else {
          await sendText(rawFrom, 'Este servicio ya fue tomado por otro proveedor.')
        }
      } else {
        await sendText(rawFrom, 'No tienes solicitudes pendientes en este momento.')
      }
      return reply.send('ok')
    }

    // ── Rechazar ─────────────────────────────────────────────────────
    if (REJECT_KEYWORDS.includes(msgLower)) {
      const assignment = await findPendingAssignment()
      if (assignment) {
        await rejectAssignment(assignment.id)
        await sendText(rawFrom, 'Entendido, gracias.')
      }
      return reply.send('ok')
    }

    // ── Keywords de estado ───────────────────────────────────────────
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
      return reply.send('ok')
    }

    // ── Evidencias ───────────────────────────────────────────────────
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

    return reply.send('ok')
  })
}
