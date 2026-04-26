import { FastifyInstance } from 'fastify'
import { db } from '../../shared/lib/db'
import { sendText } from '../notifications/whatsapp.service'
import { evidenceUploadQueue } from '../../shared/lib/bullmq'
import { acceptAssignment, rejectAssignment } from '../assignments/assignments.service'

const STATUS_MAP: Record<string, string> = {
  'EN CAMINO': 'assigned',
  'LLEGUE':    'in_progress',
  'FINALIZADO':'completed',
}

const REPLIES: Record<string, string> = {
  assigned:    'El cliente fue notificado. Buen camino!',
  in_progress: 'Sube las evidencias y responde FINALIZADO al terminar.',
  completed:   'Servicio finalizado. Gracias!',
}

export default async function whatsappRoutes(app: FastifyInstance) {
  // Verificación del webhook
  app.get('/whatsapp', async (req: any, reply) => {
    if (req.query['hub.verify_token'] === process.env.WHATSAPP_VERIFY_TOKEN)
      return reply.send(req.query['hub.challenge'])
    reply.status(403).send('Forbidden')
  })

  // Mensajes entrantes
  app.post('/whatsapp', async (req: any, reply) => {
    const msg = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]
    if (!msg) return reply.send('ok')
    const from: string = msg.from

    // Botones Aceptar / Rechazar
    if (msg.type === 'interactive') {
      const btnId: string = msg.interactive.button_reply.id
      const [action, assignmentId] = btnId.split('_')

      if (action === 'accept') {
        const assignment = await acceptAssignment(assignmentId, from)
        if (assignment) {
          await sendText(from, 'Servicio aceptado! Cuando vayas en camino responde: EN CAMINO')
        } else {
          await sendText(from, 'Este servicio ya fue tomado por otro proveedor.')
        }
      }

      if (action === 'reject') {
        await rejectAssignment(assignmentId)
        await sendText(from, 'Entendido, gracias.')
      }
    }

    // Keywords de estado
    if (msg.type === 'text') {
      const keyword = msg.text?.body?.trim().toUpperCase()
      const nextStatus = STATUS_MAP[keyword]

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
              payload: { status: nextStatus, keyword, providerWhatsapp: from },
            },
          })
          await sendText(from, REPLIES[nextStatus] || 'Estado actualizado.')
        }
      }
    }

    // Evidencias (foto/documento)
    if (msg.type === 'image' || msg.type === 'document') {
      const mediaId = msg[msg.type]?.id
      if (mediaId) {
        await evidenceUploadQueue.add('upload', { mediaId, from, type: msg.type })
        await sendText(from, 'Evidencia recibida')
      }
    }

    return reply.send('ok')
  })
}
