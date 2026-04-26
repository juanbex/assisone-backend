import { FastifyInstance } from 'fastify'
import { db } from '../../shared/lib/db'
import { sendText, sendAssignmentConfirmation } from '../notifications/whatsapp.service'
import { evidenceUploadQueue } from '../../shared/lib/bullmq'
import { acceptAssignment, rejectAssignment } from '../assignments/assignments.service'
import twilio from 'twilio'

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

export default async function whatsappRoutes(app: FastifyInstance) {
  // Verificación del webhook de Twilio (GET no aplica, pero dejamos por si acaso)
  app.get('/whatsapp', async (_req, reply) => reply.send('ok'))

  // Mensajes entrantes desde Twilio (form-encoded)
  app.post('/whatsapp', async (req: any, reply) => {
    // Twilio envía form-encoded (no JSON)
    const body   = req.body as any
    const from   = (body?.From ?? '').replace('whatsapp:', '')
    const msgBody = (body?.Body ?? '').trim().toUpperCase()

    if (!from) return reply.send('ok')

    // ── Keywords de estado ───────────────────────────────────────────
    const nextStatus = STATUS_MAP[msgBody]
    if (nextStatus) {
      const assignment = await db.serviceAssignment.findFirst({
        where: { provider: { whatsapp: from }, status: 'accepted' },
      })
      if (assignment) {
        await db.service.update({ where: { id: assignment.serviceId }, data: { status: nextStatus } })
        await db.serviceEvent.create({
          data: {
            serviceId: assignment.serviceId,
            eventType: 'provider_status_update',
            payload: { status: nextStatus, keyword: msgBody, providerWhatsapp: from },
          },
        })
        await sendText(from, REPLIES[nextStatus] || 'Estado actualizado.')
      }
      return reply.send('ok')
    }

    // ── Aceptar / Rechazar ───────────────────────────────────────────
    if (msgBody === 'ACEPTO' || msgBody === 'ACEPTAR') {
      const assignment = await db.serviceAssignment.findFirst({
        where: { provider: { whatsapp: from }, status: 'pending' },
        orderBy: { sentAt: 'desc' },
      })
      if (assignment) {
        const result = await acceptAssignment(assignment.id, from)
        if (result) {
          await sendAssignmentConfirmation(from, assignment.serviceId)
        } else {
          await sendText(from, 'Este servicio ya fue tomado por otro proveedor.')
        }
      }
      return reply.send('ok')
    }

    if (msgBody === 'NO PUEDO' || msgBody === 'RECHAZAR' || msgBody === 'NO') {
      const assignment = await db.serviceAssignment.findFirst({
        where: { provider: { whatsapp: from }, status: 'pending' },
        orderBy: { sentAt: 'desc' },
      })
      if (assignment) {
        await rejectAssignment(assignment.id)
        await sendText(from, 'Entendido, gracias.')
      }
      return reply.send('ok')
    }

    // ── Evidencias (foto/documento) ──────────────────────────────────
    const numMedia = parseInt(body?.NumMedia ?? '0')
    if (numMedia > 0) {
      const mediaUrl  = body?.MediaUrl0
      const mediaType = body?.MediaContentType0 ?? 'image/jpeg'
      if (mediaUrl) {
        await evidenceUploadQueue.add('upload', { mediaUrl, from, type: mediaType.startsWith('image') ? 'image' : 'document' })
        await sendText(from, '📸 Evidencia recibida.')
      }
    }

    return reply.send('ok')
  })
}
