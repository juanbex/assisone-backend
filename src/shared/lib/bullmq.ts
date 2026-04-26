import { Queue } from 'bullmq'
import { Redis } from 'ioredis'

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379'

export const bullmqConnection = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  tls: redisUrl.startsWith('rediss://') ? {} : undefined,
})

export const whatsappPushQueue    = new Queue('whatsapp-push',     { connection: bullmqConnection })
export const coordinationTimerQueue = new Queue('coordination-timer', { connection: bullmqConnection })
export const evidenceUploadQueue  = new Queue('evidence-upload',   { connection: bullmqConnection })
export const arrivalCheckQueue    = new Queue('arrival-check',     { connection: bullmqConnection })
