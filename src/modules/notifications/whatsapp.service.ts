import twilio from 'twilio'

const accountSid = process.env.TWILIO_ACCOUNT_SID!
const authToken  = process.env.TWILIO_AUTH_TOKEN!
const from       = `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}` // e.g. whatsapp:+573181086632

const client = twilio(accountSid, authToken)

// ── Push de coordinación a proveedor ────────────────────────────────
export async function sendProviderPush(params: {
  to: string
  providerName: string
  serviceType: string
  location: string
  timestamp: string
  assignmentId: string
}) {
  const body = `🚨 *Nueva solicitud de servicio*\n\nHola ${params.providerName},\n\n🔧 *${params.serviceType}*\n📍 ${params.location}\n🕐 ${params.timestamp}\n\n¿Puedes atender este caso?\n\nResponde *ACEPTO* para aceptar o *NO PUEDO* para rechazar.\n\n_ID: ${params.assignmentId.slice(0, 8).toUpperCase()}_`

  return client.messages.create({
    from,
    to: `whatsapp:${params.to}`,
    body,
  })
}

// ── Confirmación de asignación ───────────────────────────────────────
export async function sendAssignmentConfirmation(to: string, serviceId: string) {
  return client.messages.create({
    from,
    to: `whatsapp:${to}`,
    body: `✅ Servicio *${serviceId.slice(0, 8).toUpperCase()}* confirmado.\n\nCuando vayas en camino responde: *EN CAMINO*`,
  })
}

// ── Texto libre ──────────────────────────────────────────────────────
export async function sendText(to: string, body: string) {
  return client.messages.create({
    from,
    to: `whatsapp:${to}`,
    body,
  })
}
