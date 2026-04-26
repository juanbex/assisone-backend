import twilio from 'twilio'

const accountSid = process.env.TWILIO_ACCOUNT_SID!
const authToken  = process.env.TWILIO_AUTH_TOKEN!
const from       = `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`

const client = twilio(accountSid, authToken)

const TEMPLATES = {
  push_coordinacion:       'HX2af69e7da366d41cd83c0a51621cd6e6',
  confirmacion_asignacion: 'HXb552897af38433ecc263b46c4a318f9',
}

function toWhatsApp(number: string): string {
  const digits = number.replace(/\D/g, '')
  return `whatsapp:+${digits.startsWith('57') ? digits : `57${digits}`}`
}

export async function sendProviderPush(params: {
  to: string; providerName: string; serviceType: string
  location: string; timestamp: string; assignmentId: string
}) {
  return client.messages.create({
    from,
    to: toWhatsApp(params.to),
    contentSid: TEMPLATES.push_coordinacion,
    contentVariables: JSON.stringify({
      '1': params.providerName,
      '2': params.serviceType,
      '3': params.location,
      '4': params.timestamp,
    }),
  })
}

export async function sendAssignmentConfirmation(to: string, serviceId: string) {
  return client.messages.create({
    from,
    to: toWhatsApp(to),
    contentSid: TEMPLATES.confirmacion_asignacion,
    contentVariables: JSON.stringify({
      '1': serviceId.slice(0, 8).toUpperCase(),
    }),
  })
}

export async function sendText(to: string, body: string) {
  return client.messages.create({
    from,
    to: toWhatsApp(to),
    body,
  })
}
