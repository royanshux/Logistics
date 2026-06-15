// routes/bid.js

import express from 'express'
import supabase from '../config/supabase.js'
import { sendWhatsAppMessage } from '../services/whatsappService.js'
import { settleAuction } from './load.js'

const router = express.Router()

// POST /bid
// called by whatsapp webhook when driver replies YES or NO
router.post('/', async (req, res) => {
  try {
    const { phone, message } = req.body

    if (message.trim().toUpperCase() === 'NO') {
      return res.status(200).json({ success: true, message: 'Driver passed.' })
    }

    if (message.trim().toUpperCase() !== 'YES') {
      return res.status(400).json({ success: false, error: 'Invalid response. Reply YES or NO.' })
    }

    const { data: driver, error: driverError } = await supabase
      .from('users')
      .select('id')
      .eq('phone', phone)
      .single()

    if (driverError || !driver) return res.status(404).json({ success: false, error: 'Driver not found' })

    const { data: driverAvailability, error: availabilityError } = await supabase
      .from('driver_availability')
      .select('*')
      .eq('user_id', driver.id)
      .eq('status', 'ACTIVE')
      .single()

    if (availabilityError || !driverAvailability) return res.status(404).json({ success: false, error: 'No active availability found' })

    const loadId = driverAvailability.pending_load_id
    if (!loadId) return res.status(400).json({ success: false, error: 'No pending load found for this driver' })

    const { data: load, error: loadError } = await supabase
      .from('loads')
      .select('*')
      .eq('id', loadId)
      .single()

    if (loadError || !load) return res.status(404).json({ success: false, error: 'Load not found' })
    if (load.status === 'MATCHED') return res.status(400).json({ success: false, error: 'Load already matched' })

    const { data: existingBid } = await supabase
      .from('bids')
      .select('id')
      .eq('load_id', loadId)
      .eq('driver_id', driver.id)
      .single()

    if (existingBid) return res.status(400).json({ success: false, error: 'Driver already responded to this load' })

    const { error: bidError } = await supabase
      .from('bids')
      .insert({
        load_id: loadId,
        driver_id: driver.id,
        driver_availability_id: driverAvailability.id,
      })

    if (bidError) return res.status(500).json({ success: false, error: bidError.message })

    const isFirstBid = load.status === 'OPEN'

    if (isFirstBid) {
      const biddingStartedAt = new Date()
      const biddingEndsAt = new Date(biddingStartedAt.getTime() + 10 * 60 * 1000)

      await supabase
        .from('loads')
        .update({
          status: 'BIDDING',
          bidding_started_at: biddingStartedAt,
          bidding_ends_at: biddingEndsAt,
        })
        .eq('id', load.id)

      setTimeout(async () => {
        await settleAuction(load.id)
      }, 10 * 60 * 1000)

      await sendWhatsAppMessage(phone,
        `You're in! You are the first to accept this load.\n` +
        `Window is now open for 10 minutes for other drivers.`
      )
    } else {
      const timeLeft = Math.round((new Date(load.bidding_ends_at) - new Date()) / 60000)
      await sendWhatsAppMessage(phone,
        `You're in! ${timeLeft} minutes remaining in the window.`
      )
    }

    res.status(201).json({ success: true })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

export default router