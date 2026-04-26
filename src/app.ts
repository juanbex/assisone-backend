import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import multipart from '@fastify/multipart'
import formBody from '@fastify/formbody'

export async function buildApp() {
  const app = Fastify({ logger: true })

  await app.register(cors, { origin: true })
  await app.register(jwt, { secret: process.env.JWT_SECRET! })
  await app.register(multipart)
  await app.register(formBody) // ← para parsear Twilio (application/x-www-form-urlencoded)

  app.get('/health', async () => ({ status: 'ok', service: 'assisone-api', version: '0.1.0' }))

  await app.register(import('./modules/auth/auth.routes'),           { prefix: '/api/auth' })
  await app.register(import('./modules/services/services.routes'),   { prefix: '/api/services' })
  await app.register(import('./modules/providers/providers.routes'), { prefix: '/api/providers' })
  await app.register(import('./modules/admin/admin.routes'),         { prefix: '/api/admin' })
  await app.register(import('./modules/webhooks/whatsapp.routes'),   { prefix: '/webhooks' })

  return app
}
