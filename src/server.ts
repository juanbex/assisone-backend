import { buildApp } from './app'

const start = async () => {
  const app = await buildApp()
  try {
    await app.listen({ port: parseInt(process.env.PORT || '3000'), host: process.env.HOST || '0.0.0.0' })
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

start()
