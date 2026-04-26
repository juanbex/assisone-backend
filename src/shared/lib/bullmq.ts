import { Queue } from 'bullmq'
import { Redis } from 'ioredis'

// Railway inyecta REDIS_URL automáticamente
// Formato: redis://default:password@host:port
const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379'

export const bullmqConnection = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  tls: redisUrl.startsWith('rediss://') ? {} : undefined,
})

export const whatsappPushQueue = new Queue('whatsapp-push', { connection: bullmqConnection })
export const coordinationTimerQueue = new Queue('coordination-timer', { connection: bullmqConnection })
export const evidenceUploadQueue = new Queue('evidence-upload', { connection: bullmqConnection })
