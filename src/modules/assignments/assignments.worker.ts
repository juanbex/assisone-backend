import { Worker } from 'bullmq'
import { bullmqConnection } from '../../shared/lib/bullmq'
import { db } from '../../shared/lib/db'
import { sendProviderPush, sendText } from '../notifications/whatsapp.service'

// ── Timer de coordinación ────────────────────────────────────────────
export const coordinationTimerWorker = new Worker(
  'coordination-timer',
  async (job) => {
    const { serviceId } = job.data
    const service = await db.service.findUnique({ where: { id: serviceId } })
    if (service?.status === 'in_coordination') {
      await db.service.update({ where: { id: serviceId }, data: { status: 'uncoordinated' } })
      await db.serviceAssignment.updateMany({ where: { serviceId, status: 'pending' }, data: { status: 'cancelled' } })
      await db.serviceEvent.create({
        data: {
          serviceId, eventType: 'timer_expired',
          payload: { message: 'Ningún proveedor respondió en 10 minutos → No coordinado' },
        },
      })
      console.log(`[timer] ${serviceId} → uncoordinated`)
    }
  },
  { connection: bullmqConnection }
)

// ── Push WhatsApp a proveedor ─────────────────────────────────────────
export const whatsappPushWorker = new Worker(
  'whatsapp-push',
  async (job) => {
    const { assignmentId, to, providerName, serviceType, location, timestamp } = job.data
    const assignment = await db.serviceAssignment.findUnique({ where: { id: assignmentId } })
    if (!assignment || assignment.status !== 'pending') return
    try {
      await sendProviderPush({ to, providerName, serviceType, location, timestamp, assignmentId })
      console.log(`[wa-push] Enviado a ${to} (${providerName})`)
    } catch (err: any) {
      console.error(`[wa-push] Error:`, err.response?.data ?? err.message)
      throw err
    }
  },
  { connection: bullmqConnection, concurrency: 10 }
)

// ── Verificación de llegada al 80% del tiempo prometido al cliente ────
export const arrivalCheckWorker = new Worker(
  'arrival-check',
  async (job) => {
    const { serviceId, clientPhone, clientName, serviceType, providerName, clientMinutes, providerMinutes } = job.data

    const service = await db.service.findUnique({ where: { id: serviceId } })
    if (!service || ['completed', 'cancelled', 'in_service'].includes(service.status)) {
      console.log(`[arrival] Servicio ${serviceId} ya en estado ${service?.status}, skip.`)
      return
    }

    try {
      await sendText(
        clientPhone,
        `🔔 *AssisPrex — Verificación de servicio*\n\n` +
        `Señor/a *${clientName}*, le informamos que el técnico de *${serviceType}* ` +
        `debería estar llegando en los próximos minutos.\n\n` +
        `¿*${providerName}* ya llegó a atenderle?\n\n` +
        `Responda:\n` +
        `✅ *SÍ* — si el técnico ya llegó\n` +
        `❌ *NO* — si aún no ha llegado`
      )
      console.log(`[arrival] Verificación enviada a ${clientPhone} para servicio ${serviceId} (ETA cliente: ${clientMinutes}min, proveedor: ${providerMinutes}min)`)
    } catch (err: any) {
      console.error(`[arrival] Error:`, err.message)
    }
  },
  { connection: bullmqConnection }
)

// ── Upload de evidencias ──────────────────────────────────────────────
export const evidenceUploadWorker = new Worker(
  'evidence-upload',
  async (job) => {
    const { mediaUrl, from, type } = job.data
    try {
      const accountSid = process.env.TWILIO_ACCOUNT_SID
      const authToken  = process.env.TWILIO_AUTH_TOKEN

      const response = await fetch(mediaUrl, {
        headers: { Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}` },
      })
      const binary = Buffer.from(await response.arrayBuffer())

      const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3')
      const s3 = new S3Client({ region: process.env.AWS_REGION })
      const key = `evidences/${Date.now()}.jpg`

      await s3.send(new PutObjectCommand({
        Bucket: process.env.S3_BUCKET, Key: key, Body: binary,
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
