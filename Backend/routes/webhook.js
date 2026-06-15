// routes/webhook.js

import express from 'express'
import supabase from '../config/supabase.js'
import { sendWhatsAppMessage } from '../services/whatsappService.js'

const router = express.Router()

// GET /webhook — Meta verification
router.get('/', (req, res) => {
  const mode = req.query['hub.mode']
  const token = req.query['hub.verify_token']
  const challenge = req.query['hub.challenge']

  if (mode === 'subscribe' && token === process.env.WEBHOOK_VERIFY_TOKEN) {
    console.log('Webhook verified')
    return res.status(200).send(challenge)
  }

  res.sendStatus(403)
})

// POST /webhook — incoming messages from WhatsApp
router.post('/', async (req, res) => {
  try {
    const entry = req.body.entry?.[0]
    const change = entry?.changes?.[0]
    const message = change?.value?.messages?.[0]

    if (!message) return res.sendStatus(200)
    if (message.type !== 'text') return res.sendStatus(200)

    const phone = message.from
    const text = message.text?.body?.trim()

    if (!text) return res.sendStatus(200)

    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('phone', phone)
      .single()

    if (!user) {
      await supabase.from('users').insert({
        phone,
        user_type: 'UNKNOWN',
        conversation_state: 'NEW',
        conversation_data: {}
      })
      await sendWhatsAppMessage(phone,
        `Welcome to Indian Freight Platform! 🚛\n\nAre you a DRIVER or SUPPLIER?\n\nReply DRIVER or SUPPLIER to continue.`
      )
      return res.sendStatus(200)
    }

    await handleConversation(user, text, phone)

    res.sendStatus(200)
  } catch (err) {
    console.error('webhook error:', err.message)
    res.sendStatus(500)
  }
})

async function handleConversation(user, text, phone) {
  const state = user.conversation_state
  const data = user.conversation_data || {}

  if (state === 'NEW' || state === 'ONBOARDING_TYPE') {
    await handleOnboardingType(user, text, phone)

  } else if (state === 'ONBOARDING_NAME') {
    await handleOnboardingName(user, text, phone)

  } else if (state === 'DRIVER_MENU') {
    await handleDriverMenu(user, text, phone)

  } else if (state === 'SUPPLIER_MENU') {
    await handleSupplierMenu(user, text, phone)

  } else if (state === 'AWAITING_BID_RESPONSE') {
    await handleBidResponse(user, text, phone)

  } else if (
    state === 'DRIVER_POSTING_SOURCE' ||
    state === 'DRIVER_POSTING_DESTINATION' ||
    state === 'DRIVER_POSTING_TRUCK' ||
    state === 'DRIVER_POSTING_CAPACITY' ||
    state === 'DRIVER_POSTING_LMIN' ||
    state === 'DRIVER_POSTING_LMAX' ||
    state === 'DRIVER_POSTING_AVAILABLE_FROM'
  ) {
    await handleDriverPostingAvailability(user, text, phone, data)

  } else if (
    state === 'SUPPLIER_POSTING_SOURCE' ||
    state === 'SUPPLIER_POSTING_DESTINATION' ||
    state === 'SUPPLIER_POSTING_TRUCK' ||
    state === 'SUPPLIER_POSTING_WEIGHT' ||
    state === 'SUPPLIER_POSTING_CARGO' ||
    state === 'SUPPLIER_POSTING_SMIN' ||
    state === 'SUPPLIER_POSTING_SMAX' ||
    state === 'SUPPLIER_POSTING_PICKUP_BY' ||
    state === 'SUPPLIER_POSTING_PICKUP_ADDRESS' ||
    state === 'SUPPLIER_POSTING_DELIVERY_ADDRESS' ||
    state === 'SUPPLIER_POSTING_RECEIVER_PHONE'
  ) {
    await handleSupplierPostingLoad(user, text, phone, data)

  } else {
    await handleDriverMenu(user, text, phone)
  }
}

async function handleOnboardingType(user, text, phone) {
  const upperText = text.toUpperCase()

  if (upperText === 'DRIVER') {
    await supabase
      .from('users')
      .update({ 
        user_type: 'DRIVER',
        conversation_state: 'ONBOARDING_NAME' 
      })
      .eq('phone', phone)

    await sendWhatsAppMessage(phone, `Great! What is your name?`)

  } else if (upperText === 'SUPPLIER') {
    await supabase
      .from('users')
      .update({ 
        user_type: 'SUPPLIER',
        conversation_state: 'ONBOARDING_NAME' 
      })
      .eq('phone', phone)

    await sendWhatsAppMessage(phone, `Great! What is your name?`)

  } else {
    await sendWhatsAppMessage(phone, `Please reply DRIVER or SUPPLIER only.`)
  }
}

async function handleOnboardingName(user, text, phone) {
  await supabase
    .from('users')
    .update({ 
      name: text,
      conversation_state: user.user_type === 'DRIVER' ? 'DRIVER_MENU' : 'SUPPLIER_MENU'
    })
    .eq('phone', phone)

  if (user.user_type === 'DRIVER') {
    await sendWhatsAppMessage(phone,
      `Welcome ${text}! 🚛\n\nWhat would you like to do?\n\n1. Post Availability\n2. My Availabilities\n3. Delete Availability\n4. My Bids\n5. My Matches\n\nReply with a number.`
    )
  } else {
    await sendWhatsAppMessage(phone,
      `Welcome ${text}! 📦\n\nWhat would you like to do?\n\n1. Post Load\n2. My Loads\n3. Cancel Load\n4. My Matches\n\nReply with a number.`
    )
  }
}

async function handleDriverMenu(user, text, phone) {
  await sendWhatsAppMessage(phone,
    `What would you like to do? 🚛\n\n1. Post Availability\n2. My Availabilities\n3. Delete Availability\n4. My Bids\n5. My Matches\n\nReply with a number.`
  )
}

async function handleSupplierMenu(user, text, phone) {
  if (text === '1') {
    await supabase
      .from('users')
      .update({ conversation_state: 'SUPPLIER_POSTING_SOURCE' })
      .eq('phone', phone)

    await sendWhatsAppMessage(phone, `What is your pickup city?\n\nExample: Mumbai`)

  } else if (text === '2') {

      const response = await fetch(`http://localhost:3000/load/my-loads/${phone}`)
      const result = await response.json()

      if (!result.success || result.loads.length === 0) {
        await sendWhatsAppMessage(phone, `You have no loads yet.\n\n1. Post Load\n2. My Loads\n3. Cancel Load\n4. My Matches`)
        return
      }

      let message = `Your loads:\n\n`
      for (let i = 0; i < result.loads.length; i++) {
        const load = result.loads[i]
        message += `${i + 1}. ${load.source} → ${load.destination}\n`
        message += `   Truck: ${load.truck_type} | Weight: ${load.weight}T\n`
        message += `   Budget: ₹${load.s_min} - ₹${load.s_max}\n`
        message += `   Status: ${load.status}\n\n`
      }

      message += `1. Post Load\n2. My Loads\n3. Cancel Load\n4. My Matches`

      await sendWhatsAppMessage(phone, message)

  } else if (text === '3') {
    await sendWhatsAppMessage(phone, `Coming soon!`)

  } else if (text === '4') {
      const { data: supplier } = await supabase
        .from('users')
        .select('id')
        .eq('phone', phone)
        .single()

      const { data: matches, error } = await supabase
        .from('matches')
        .select('*, loads!matches_load_id_fkey(*)')
        .eq('supplier_id', supplier.id)
        .order('created_at', { ascending: false })

      console.log('supplier:', supplier)
      console.log('matches:', matches)
      console.log('error:', error)  

      if (error || !matches || matches.length === 0) {
        await sendWhatsAppMessage(phone, `You have no matches yet.\n\n1. Post Load\n2. My Loads\n3. Cancel Load\n4. My Matches`)
        return
      }

      let message = `Your matches:\n\n`
      for (let i = 0; i < matches.length; i++) {
        const match = matches[i]
        message += `${i + 1}. Order: ${match.order_id}\n`
        message += `   Route: ${match.loads.source} → ${match.loads.destination}\n`
        message += `   Final Price: ₹${match.final_price}\n`
        message += `   Status: ${match.status}\n\n`
      }

      message += `1. Post Load\n2. My Loads\n3. Cancel Load\n4. My Matches`
     

      await sendWhatsAppMessage(phone, message)

  } else {
    await sendWhatsAppMessage(phone,
      `Please reply with a number 1-4.\n\n1. Post Load\n2. My Loads\n3. Cancel Load\n4. My Matches`
    )
  }
}

async function handleSupplierPostingLoad(user, text, phone, data) {
  const state = user.conversation_state

  if (state === 'SUPPLIER_POSTING_SOURCE') {
    await supabase
      .from('users')
      .update({
        conversation_state: 'SUPPLIER_POSTING_DESTINATION',
        conversation_data: { ...data, source: text.toUpperCase() }
      })
      .eq('phone', phone)

    await sendWhatsAppMessage(phone, `What is your destination city?\n\nExample: Delhi`)

  } else if (state === 'SUPPLIER_POSTING_DESTINATION') {
    await supabase
      .from('users')
      .update({
        conversation_state: 'SUPPLIER_POSTING_TRUCK',
        conversation_data: { ...data, destination: text.toUpperCase() }
      })
      .eq('phone', phone)

    await sendWhatsAppMessage(phone,
      `What truck type do you need?\n\n1. OPEN_BODY\n2. CONTAINER\n3. FLATBED\n4. TANKER\n5. REFRIGERATED\n\nReply with a number.`
    )

  } else if (state === 'SUPPLIER_POSTING_TRUCK') {
    const truckMap = {
      '1': 'OPEN_BODY',
      '2': 'CONTAINER',
      '3': 'FLATBED',
      '4': 'TANKER',
      '5': 'REFRIGERATED'
    }
    const truckType = truckMap[text]

    if (!truckType) {
      await sendWhatsAppMessage(phone, `Please reply with a number 1-5 only.`)
      return
    }

    await supabase
      .from('users')
      .update({
        conversation_state: 'SUPPLIER_POSTING_WEIGHT',
        conversation_data: { ...data, truckType }
      })
      .eq('phone', phone)

    await sendWhatsAppMessage(phone, `What is the weight of cargo in tonnes?\n\nExample: 8`)

  } else if (state === 'SUPPLIER_POSTING_WEIGHT') {
    const weight = parseFloat(text)

    if (isNaN(weight)) {
      await sendWhatsAppMessage(phone, `Please enter a valid number.\n\nExample: 8`)
      return
    }

    await supabase
      .from('users')
      .update({
        conversation_state: 'SUPPLIER_POSTING_CARGO',
        conversation_data: { ...data, weight }
      })
      .eq('phone', phone)

    await sendWhatsAppMessage(phone, `What is the cargo description?\n\nExample: Electronics`)

  } else if (state === 'SUPPLIER_POSTING_CARGO') {
    await supabase
      .from('users')
      .update({
        conversation_state: 'SUPPLIER_POSTING_SMIN',
        conversation_data: { ...data, cargoDescription: text }
      })
      .eq('phone', phone)

    await sendWhatsAppMessage(phone, `What is your minimum budget in ₹?\n\nExample: 18000`)

  } else if (state === 'SUPPLIER_POSTING_SMIN') {
    const Smin = parseFloat(text)

    if (isNaN(Smin)) {
      await sendWhatsAppMessage(phone, `Please enter a valid number.\n\nExample: 18000`)
      return
    }

    await supabase
      .from('users')
      .update({
        conversation_state: 'SUPPLIER_POSTING_SMAX',
        conversation_data: { ...data, Smin }
      })
      .eq('phone', phone)

    await sendWhatsAppMessage(phone, `What is your maximum budget in ₹?\n\nExample: 24000`)

  } else if (state === 'SUPPLIER_POSTING_SMAX') {
    const Smax = parseFloat(text)

    if (isNaN(Smax)) {
      await sendWhatsAppMessage(phone, `Please enter a valid number.\n\nExample: 24000`)
      return
    }

    await supabase
      .from('users')
      .update({
        conversation_state: 'SUPPLIER_POSTING_PICKUP_BY',
        conversation_data: { ...data, Smax }
      })
      .eq('phone', phone)

    await sendWhatsAppMessage(phone, `What is the pickup deadline?\n\nFormat: DD-MM-YYYY\nExample: 10-06-2026`)

  } else if (state === 'SUPPLIER_POSTING_PICKUP_BY') {
    const parts = text.split('-')
    if (parts.length !== 3) {
      await sendWhatsAppMessage(phone, `Invalid date format. Please use DD-MM-YYYY\n\nExample: 10-06-2026`)
      return
    }

    const pickupBy = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`).toISOString()

    await supabase
      .from('users')
      .update({
        conversation_state: 'SUPPLIER_POSTING_PICKUP_ADDRESS',
        conversation_data: { ...data, pickupBy }
      })
      .eq('phone', phone)

    await sendWhatsAppMessage(phone, `What is the full pickup address?\n\nExample: Dharavi, Mumbai, Maharashtra`)

  } else if (state === 'SUPPLIER_POSTING_PICKUP_ADDRESS') {
    await supabase
      .from('users')
      .update({
        conversation_state: 'SUPPLIER_POSTING_DELIVERY_ADDRESS',
        conversation_data: { ...data, pickupAddress: text }
      })
      .eq('phone', phone)

    await sendWhatsAppMessage(phone, `What is the full delivery address?\n\nExample: Connaught Place, New Delhi`)

  } else if (state === 'SUPPLIER_POSTING_DELIVERY_ADDRESS') {
    await supabase
      .from('users')
      .update({
        conversation_state: 'SUPPLIER_POSTING_RECEIVER_PHONE',
        conversation_data: { ...data, deliveryAddress: text }
      })
      .eq('phone', phone)

    await sendWhatsAppMessage(phone, `What is the receiver's phone number?\n\nExample: 919876543212`)

  } else if (state === 'SUPPLIER_POSTING_RECEIVER_PHONE') {
    const finalData = { ...data, receiverPhone: text }

    const response = await fetch('http://localhost:3000/load', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone,
        source: finalData.source,
        destination: finalData.destination,
        truckType: finalData.truckType,
        weight: finalData.weight,
        cargoDescription: finalData.cargoDescription,
        Smin: finalData.Smin,
        Smax: finalData.Smax,
        pickupBy: finalData.pickupBy,
        pickupAddress: finalData.pickupAddress,
        deliveryAddress: finalData.deliveryAddress,
        receiverPhone: finalData.receiverPhone,
      })
    })

    const result = await response.json()

    await supabase
      .from('users')
      .update({
        conversation_state: 'SUPPLIER_MENU',
        conversation_data: {}
      })
      .eq('phone', phone)

    if (result.success) {
      await sendWhatsAppMessage(phone,
        `✅ Load posted successfully!\n\nRoute: ${finalData.source} → ${finalData.destination}\nTruck: ${finalData.truckType}\nWeight: ${finalData.weight} tonnes\nBudget: ₹${finalData.Smin} - ₹${finalData.Smax}\n\nDrivers are being notified. You will be updated when a match is found.\n\nWhat would you like to do next?\n\n1. Post Load\n2. My Loads\n3. Cancel Load\n4. My Matches`
      )
    } else {
      await sendWhatsAppMessage(phone, `Something went wrong. Please try again.\n\n1. Post Load\n2. My Loads\n3. Cancel Load\n4. My Matches`)
    }
  }
}

async function handleBidResponse(user, text, phone) {
  const upperText = text.toUpperCase()

  if (upperText === 'YES') {
    await fetch('http://localhost:3000/bid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, message: 'YES' })
    })

  } else if (upperText === 'NO') {
    await supabase
      .from('driver_availability')
      .update({ pending_load_id: null })
      .eq('phone', phone)

    await supabase
      .from('users')
      .update({ conversation_state: 'DRIVER_MENU' })
      .eq('phone', phone)

    await sendWhatsAppMessage(phone,
      `Got it! You passed on this load.\n\n1. Post Availability\n2. My Availabilities\n3. Delete Availability\n4. My Bids\n5. My Matches`
    )

  } else {
    await sendWhatsAppMessage(phone, `Please reply YES or NO only.`)
  }
}

export default router