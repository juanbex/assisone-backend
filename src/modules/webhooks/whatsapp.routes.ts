import { FastifyInstance } from 'fastify'
import { db } from '../../shared/lib/db'
import { sendText } from '../notifications/whatsapp.service'
import { evidenceUploadQueue } from '../../shared/lib/bullmq'

const STATUS_MAP: Record<string, string> = {
  'EN CAMINO': 'assigned', 'LLEGUE': 'in_progress', 'FINALIZADO': 'completed',
}
const REPLIES: Record<string, string> = {
  assigned:    'El cliente fue notificado. Buen camino!',
  in_progress: 'Sube las evidencias y responde FINALIZADO al terminar.',
  completed:   'Servicio finalizado. Gracias!',
}

export default async function whatsappRoutes(app: FastifyInstance) {
  app.get('/whatsapp', async (req: any, reply) => {
    if (req.query['hub.verify_token'] === process.env.WHATSAPP_VERIFY_TOKEN)
      return reply.send(req.query['hub.challenge'])
    reply.status(403).send('Forbidden')
  })

  app.post('/whatsapp', async (req: any, reply) => {
    const msg = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]
    if (!msg) return reply.send('ok')
    const from: string = msg.from

    if (msg.type === 'interactive') {
      const [action, assignmentId] = (msg.interactive.button_reply.id as string).split('_')
      if (action === 'accept') {
        const a = await db.serviceAssignment.findUnique({ where: { id: assignmentId } })
        if (a?.status === 'pending') {
          await db.serviceAssignment.update({ where: { id: assignmentId }, data: { status: 'accepted' } })
          await db.service.update({ where: { id: a.serviceId }, data: { status: 'coordinated' } })
          await sendText(from, 'Servicio aceptado! Cuando vayas en camino responde: EN CAMINO')
        }
      }
      if (action === 'reject')
        await db.serviceAssignment.update({ where: { id: assignmentId }, data: { status: 'rejected' } })
    }

    if (msg.type === 'text') {
      const next = STATUS_MAP[msg.text?.body?.trim().toUpperCase()]
      if (next) {
        const a = await db.serviceAssignment.findFirst({ where: { provider: { whatsapp: from }, status: 'accepted' } })
        if (a) {
          await db.service.update({ where: { id: a.serviceId }, data: { status: next } })
          await sendText(from, REPLIES[next] || 'Estado actualizado.')
        }
      }
    }

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
