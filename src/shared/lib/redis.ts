import IORedis from 'ioredis'
export const redis = new IORedis(process.env.REDIS_URL!, { maxRetriesPerRequest: null })
redis.on('connect', () => console.log('[redis] connected'))
redis.on('error', (e) => console.error('[redis]', e))
