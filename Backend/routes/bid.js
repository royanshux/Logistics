// routes/bid.js

const express = require('express')
const router = express.Router()
const Bid = require('../models/Bid')
const Load = require('../models/Load')
const DriverAvailability = require('../models/DriverAvailability')
const User = require('../models/User')
const { sendWhatsAppMessage } = require('../services/whatsappService')
const { settleAuction } = require('./load')

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

    const driver = await User.findOne({ phone })
    if (!driver) return res.status(404).json({ success: false, error: 'Driver not found' })

    const driverAvailability = await DriverAvailability.findOne({ userId: driver._id, status: 'ACTIVE' })
    if (!driverAvailability) return res.status(404).json({ success: false, error: 'No active availability found' })

    // read loadId from pendingLoadId — set when we last notified this driver
    const loadId = driverAvailability.pendingLoadId
    if (!loadId) return res.status(400).json({ success: false, error: 'No pending load found for this driver' })

    const load = await Load.findById(loadId)
    if (!load) return res.status(404).json({ success: false, error: 'Load not found' })
    if (load.status === 'MATCHED') return res.status(400).json({ success: false, error: 'Load already matched' })

    const existingBid = await Bid.findOne({ loadId, driverId: driver._id })
    if (existingBid) return res.status(400).json({ success: false, error: 'Driver already responded to this load' })

    await Bid.create({
      loadId,
      driverId: driver._id,
      driverAvailabilityId: driverAvailability._id,
    })

    const isFirstBid = load.status === 'OPEN'

    if (isFirstBid) {
      load.status = 'BIDDING'
      load.biddingStartedAt = new Date()
      await load.save()

      setTimeout(async () => {
        await settleAuction(load._id)
      }, 10 * 60 * 1000)

      await sendWhatsAppMessage(phone,
        `You're in! You are the first to accept this load.\n` +
        `Window is now open for 10 minutes for other drivers.`
      )
    } else {
      const timeLeft = Math.round((load.biddingEndsAt - new Date()) / 60000)
      await sendWhatsAppMessage(phone,
        `You're in! ${timeLeft} minutes remaining in the window.`
      )
    }

    res.status(201).json({ success: true })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

module.exports = router