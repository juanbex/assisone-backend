import axios from 'axios'

const API_URL = process.env.WHATSAPP_API_URL ?? 'https://graph.facebook.com/v18.0'
const PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID
const TOKEN    = process.env.WHATSAPP_TOKEN

const client = axios.create({
  baseURL: `${API_URL}/${PHONE_ID}`,
  headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
})

// ── Push de coordinación a proveedor ────────────────────────────────
// Plantilla: push_de_coordinacion
// Params: {{1}} nombre proveedor, {{2}} tipo servicio, {{3}} ubicación, {{4}} hora
// Botones: Aceptar (accept_<assignmentId>) / Rechazar (reject_<assignmentId>)
export async function sendProviderPush(params: {
  to: string
  providerName: string
  serviceType: string
  location: string
  timestamp: string
  assignmentId: string
}) {
  return client.post('/messages', {
    messaging_product: 'whatsapp',
    to: params.to,
    type: 'template',
    template: {
      name: 'push_de_coordinacion',
      language: { code: 'es_CO' },
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: params.providerName },
            { type: 'text', text: params.serviceType },
            { type: 'text', text: params.location },
            { type: 'text', text: params.timestamp },
          ],
        },
        {
          type: 'button',
          sub_type: 'quick_reply',
          index: '0',
          parameters: [{ type: 'payload', payload: `accept_${params.assignmentId}` }],
        },
        {
          type: 'button',
          sub_type: 'quick_reply',
          index: '1',
          parameters: [{ type: 'payload', payload: `reject_${params.assignmentId}` }],
        },
      ],
    },
  })
}

// ── Confirmación de asignación ───────────────────────────────────────
// Plantilla: confirmacion_de_asignacion
// Params: {{1}} número de servicio
export async function sendAssignmentConfirmation(to: string, serviceId: string) {
  return client.post('/messages', {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: 'confirmacion_de_asignacion',
      language: { code: 'es_CO' },
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: serviceId.slice(0, 8).toUpperCase() },
          ],
        },
      ],
    },
  })
}

// ── Texto libre (solo dentro de ventana de 24h) ──────────────────────
export async function sendText(to: string, body: string) {
  return client.post('/messages', {
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body },
  })
}
