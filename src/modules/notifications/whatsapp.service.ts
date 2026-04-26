import twilio from 'twilio'

const accountSid = process.env.TWILIO_ACCOUNT_SID!
const authToken  = process.env.TWILIO_AUTH_TOKEN!
const from       = `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`

const client = twilio(accountSid, authToken)

// SIDs de plantillas aprobadas en Twilio
const TEMPLATES = {
  push_coordinacion:       'HX2af69e7da366d41cd83c0a51621cd6e6',
  confirmacion_asignacion: 'HXac63f9f493b0c7e1b0b3048ac2afa6cb',
}

// ── Push de coordinación a proveedor (Quick Reply) ───────────────────
export async function sendProviderPush(params: {
  to: string
  providerName: string
  serviceType: string
  location: string
  timestamp: string
  assignmentId: string
}) {
  return client.messages.create({
    from,
    to: `whatsapp:+${params.to.replace(/\D/g, '')}`,
    contentSid: TEMPLATES.push_coordinacion,
    contentVariables: JSON.stringify({
      '1': params.providerName,
      '2': params.serviceType,
      '3': params.location,
      '4': params.timestamp,
    }),
  })
}

// ── Confirmación de asignación ───────────────────────────────────────
export async function sendAssignmentConfirmation(to: string, serviceId: string) {
  return client.messages.create({
    from,
    to: `whatsapp:+${to.replace(/\D/g, '')}`,
    contentSid: TEMPLATES.confirmacion_asignacion,
    contentVariables: JSON.stringify({
      '1': serviceId.slice(0, 8).toUpperCase(),
    }),
  })
}

// ── Texto libre (dentro de ventana de 24h) ───────────────────────────
export async function sendText(to: string, body: string) {
  return client.messages.create({
    from,
    to: `whatsapp:+${to.replace(/\D/g, '')}`,
    body,
  })
}
