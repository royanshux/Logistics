// services/whatsappService.js

import dotenv from 'dotenv'
dotenv.config()

export async function sendWhatsAppMessage(to, message) {
  try {
    const response = await fetch(
      `https://graph.facebook.com/v25.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: to,
          type: 'text',
          text: { body: message },
        }),
      }
    )

    const data = await response.json()
    console.log('WhatsApp response:', JSON.stringify(data))
    if (!response.ok) {
      console.error('WhatsApp error:', data)
    }
    return data
  } catch (err) {
    console.error('sendWhatsAppMessage error:', err.message)
  }
}