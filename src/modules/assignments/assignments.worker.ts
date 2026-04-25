import { Worker } from 'bullmq'
import { bullmqConnection } from '../../shared/lib/bullmq'
import { db } from '../../shared/lib/db'

export const coordinationTimerWorker = new Worker('coordination-timer', async (job) => {
  const { serviceId } = job.data
  const svc = await db.service.findUnique({ where: { id: serviceId } })
  if (svc?.status === 'in_coordination') {
    await db.service.update({ where: { id: serviceId }, data: { status: 'uncoordinated' } })
    console.log(`[timer] ${serviceId} -> uncoordinated`)
  }
}, { connection: bullmqConnection })

export const whatsappPushWorker = new Worker('whatsapp-push', async (job) => {
  const { providerId, serviceId } = job.data
  console.log(`[wa-push] provider=${providerId} service=${serviceId}`)
  // TODO: call sendProviderPush()
}, { connection: bullmqConnection, concurrency: 10 })
