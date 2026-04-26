import { buildApp } from './app'

// Iniciar BullMQ workers
import './modules/assignments/assignments.worker'

const start = async () => {
  const app = await buildApp()
  try {
    await app.listen({ port: parseInt(process.env.PORT || '3000'), host: process.env.HOST || '0.0.0.0' })
    console.log(`[assisone] API corriendo en puerto ${process.env.PORT || 3000}`)
    console.log(`[assisone] Workers BullMQ inicializados`)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

start()
