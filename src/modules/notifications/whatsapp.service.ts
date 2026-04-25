import axios from 'axios'
const API = process.env.WHATSAPP_API_URL
const TOKEN = process.env.WHATSAPP_TOKEN
const PHONE = process.env.WHATSAPP_PHONE_NUMBER_ID
const h = () => ({ Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' })

export async function sendProviderPush(o: {
  to: string; serviceType: string; location: string
  description: string; timestamp: string; assignmentId: string
}) {
  return axios.post(`${API}/${PHONE}/messages`, {
    messaging_product: 'whatsapp', to: o.to, type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: `*AssisOne*\nTipo: ${o.serviceType}\nUbicacion: ${o.location}\nHora: ${o.timestamp}\nDescripcion: ${o.description}\n\nPuedes tomar este servicio?` },
      action: { buttons: [
        { type: 'reply', reply: { id: `accept_${o.assignmentId}`, title: 'Aceptar' } },
        { type: 'reply', reply: { id: `reject_${o.assignmentId}`, title: 'Rechazar' } },
      ]},
    },
  }, { headers: h() })
}

export async function sendText(to: string, text: string) {
  return axios.post(`${API}/${PHONE}/messages`,
    { messaging_product: 'whatsapp', to, type: 'text', text: { body: text } },
    { headers: h() })
}
