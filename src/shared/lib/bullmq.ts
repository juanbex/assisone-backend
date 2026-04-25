import { Queue } from 'bullmq'
import { redis } from './redis'

const c = redis
export const whatsappPushQueue      = new Queue('whatsapp-push',      { connection: c })
export const coordinationTimerQueue = new Queue('coordination-timer', { connection: c })
export const evidenceUploadQueue    = new Queue('evidence-upload',    { connection: c })
export const notificationsQueue     = new Queue('notifications',      { connection: c })
export { c as bullmqConnection }
