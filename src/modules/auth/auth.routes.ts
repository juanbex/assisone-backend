import { FastifyInstance } from 'fastify'
import { authenticate } from '../../shared/middleware/auth.middleware'
import { login, register, me } from './auth.controller'

export default async function authRoutes(app: FastifyInstance) {
  app.post('/login',    login)
  app.post('/register', register)
  app.get('/me', { preHandler: [authenticate] }, me)
}
