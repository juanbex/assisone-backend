import { Worker } from 'bullmq'
import { bullmqConnection } from '../../shared/lib/bullmq'
import { db } from '../../shared/lib/db'
import { sendProviderPush, sendAssignmentConfirmation, sendText } from '../notifications/whatsapp.service'

// ── Timer de coordinación (10 min) ──────────────────────────────────
export const coordinationTimerWorker = new Worker(
  'coordination-timer',
  async (job) => {
    const { serviceId } = job.data
    const service = await db.service.findUnique({ where: { id: serviceId } })
    if (service?.status === 'in_coordination') {
      await db.service.update({ where: { id: serviceId }, data: { status: 'uncoordinated' } })
      await db.serviceAssignment.updateMany({
        where: { serviceId, status: 'pending' },
        data: { status: 'cancelled' },
      })
      await db.serviceEvent.create({
        data: {
          serviceId,
          eventType: 'timer_expired',
          payload: { message: 'Ningún proveedor respondió en 10 minutos → No coordinado' },
        },
      })
      console.log(`[timer] ${serviceId} → uncoordinated`)
    }
  },
  { connection: bullmqConnection }
)

// ── Push de WhatsApp a proveedor ─────────────────────────────────────
export const whatsappPushWorker = new Worker(
  'whatsapp-push',
  async (job) => {
    const { assignmentId, to, providerName, serviceType, location, timestamp } = job.data

    const assignment = await db.serviceAssignment.findUnique({ where: { id: assignmentId } })
    if (!assignment || assignment.status !== 'pending') {
      console.log(`[wa-push] Assignment ${assignmentId} ya no está pendiente, skip.`)
      return
    }

    try {
      await sendProviderPush({ to, providerName, serviceType, location, timestamp, assignmentId })
      console.log(`[wa-push] Enviado a ${to} (${providerName}) para assignment ${assignmentId}`)
    } catch (err: any) {
      console.error(`[wa-push] Error enviando a ${to}:`, err.response?.data ?? err.message)
      throw err
    }
  },
  { connection: bullmqConnection, concurrency: 10 }
)

// ── Upload de evidencias ─────────────────────────────────────────────
export const evidenceUploadWorker = new Worker(
  'evidence-upload',
  async (job) => {
    const { mediaId, from, type } = job.data
    try {
      const token = process.env.WHATSAPP_TOKEN
      const { data: mediaData } = await import('axios').then(ax =>
        ax.default.get(`${process.env.WHATSAPP_API_URL}/${mediaId}`, { headers: { Authorization: `Bearer ${token}` } })
      )
      const { data: binary } = await import('axios').then(ax =>
        ax.default.get(mediaData.url, { responseType: 'arraybuffer', headers: { Authorization: `Bearer ${token}` } })
      )
      const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3')
      const s3 = new S3Client({ region: process.env.AWS_REGION })
      const key = `evidences/${Date.now()}-${mediaId}.jpg`
      await s3.send(new PutObjectCommand({
        Bucket: process.env.S3_BUCKET, Key: key, Body: Buffer.from(binary),
        ContentType: type === 'image' ? 'image/jpeg' : 'application/octet-stream',
      }))
      const s3Url = `https://${process.env.S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`

      const assignment = await db.serviceAssignment.findFirst({
        where: { provider: { whatsapp: from }, status: 'accepted' },
      })
      if (assignment) {
        await db.serviceEvidence.create({
          data: { serviceId: assignment.serviceId, providerId: assignment.providerId, s3Url, type: type === 'image' ? 'photo' : 'document' },
        })
      }
      console.log(`[evidence] Subida: ${s3Url}`)
    } catch (err: any) {
      console.error(`[evidence] Error:`, err.message)
      throw err
    }
  },
  { connection: bullmqConnection }
)
