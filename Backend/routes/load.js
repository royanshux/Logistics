// routes/load.js

const express = require('express')
const router = express.Router()
const Load = require('../models/Load')
const User = require('../models/User')
const DriverAvailability = require('../models/DriverAvailability')
const Bid = require('../models/Bid')
const Match = require('../models/Match')
const { sendWhatsAppMessage } = require('../services/whatsappService')

// POST /load
router.post('/', async (req, res) => {
  try {
    const { phone, source, destination, truckType, weight, cargoDescription, Smin, Smax, pickupBy, pickupAddress, deliveryAddress, receiverPhone } = req.body

    const supplier = await User.findOne({ phone })
    if (!supplier) return res.status(404).json({ success: false, error: 'Supplier not found' })

    const load = await Load.create({
      supplierId: supplier._id,
      supplierPhone: phone,
      source,
      destination,
      truckType,
      weight,
      cargoDescription,
      Smin,
      Smax,
      pickupBy,
      pickupAddress,      // ← add
      deliveryAddress,    // ← add
      receiverPhone,      // ← add
    })

    const matchingDrivers = await DriverAvailability.find({
      source: load.source,
      destination: load.destination,
      truckType: load.truckType,
      capacity: { $gte: load.weight },
      status: 'ACTIVE',
      Lmin: { $lte: load.Smin },
    })

    if (matchingDrivers.length === 0) {
      return res.status(201).json({
        success: true,
        load,
        message: 'No drivers found right now. Will keep checking.',
      })
    }

    for (const driver of matchingDrivers) {
      // overwrite pendingLoadId with this load — latest notification wins
      await DriverAvailability.findByIdAndUpdate(driver._id, { pendingLoadId: load._id })

      await sendWhatsAppMessage(driver.phone,
        `New load on your route!\n` +
        `Route: ${load.source} → ${load.destination}\n` +
        `Weight: ${load.weight} tonnes\n` +
        `Truck: ${load.truckType}\n` +
        `Budget: ₹${load.Smin} - ₹${load.Smax}\n` +
        `Pickup by: ${load.pickupBy}\n\n` +
        `Reply YES to accept or NO to pass.`
      )
    }

    res.status(201).json({
      success: true,
      load,
      driversNotified: matchingDrivers.length,
    })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

async function settleAuction(loadId) {
  try {
    const load = await Load.findById(loadId)
    if (load.status !== 'BIDDING') return

    const bids = await Bid.find({ loadId, status: 'PENDING' }).populate('driverAvailabilityId')

    const PRICING_MODE = 'HAPPY_SHIPPER'

    let winningBid = bids[0]
    for (const bid of bids) {
      if (bid.driverAvailabilityId.Lmin < winningBid.driverAvailabilityId.Lmin) {
        winningBid = bid
      }
    }

    const priceMap = {
      HAPPY_SHIPPER: load.Smin,
      HAPPY_TRUCKER: (load.Smin + load.Smax) / 2,
      HAPPY_BROKER: load.Smax,
    }
    const finalPrice = priceMap[PRICING_MODE]

    const match = await Match.create({
      loadId: load._id,
      driverAvailabilityId: winningBid.driverAvailabilityId._id,
      driverId: winningBid.driverId,
      supplierId: load.supplierId,
      finalPrice,
      pricingMode: PRICING_MODE,
      orderId: load.source.substring(0, 3) + '-' + Math.floor(1000 + Math.random() * 9000),
    })

    load.status = 'MATCHED'
    load.matchId = match._id
    await load.save()

    await DriverAvailability.findByIdAndUpdate(winningBid.driverAvailabilityId._id, {
      status: 'LOCKED',
      currentMatchId: match._id,
      pendingLoadId: null,
    })

    await Bid.findByIdAndUpdate(winningBid._id, { status: 'WON' })
    await Bid.updateMany(
      { loadId, status: 'PENDING', _id: { $ne: winningBid._id } },
      { status: 'LOST' }
    )

    await sendWhatsAppMessage(winningBid.driverAvailabilityId.phone,
      `You got the load!\n` +
      `Route: ${load.source} → ${load.destination}\n` +
      `Final Price: ₹${finalPrice}\n` +
      `Match ID: ${match._id}\n` +
      `Please proceed to pickup.`
    )

    await sendWhatsAppMessage(load.supplierPhone,
      `Your load has been matched!\n` +
      `Route: ${load.source} → ${load.destination}\n` +
      `Final Price: ₹${finalPrice}\n` +
      `Match ID: ${match._id}`
    )

    const losingBids = bids.filter(b => b._id.toString() !== winningBid._id.toString())
    for (const bid of losingBids) {
      await sendWhatsAppMessage(bid.driverAvailabilityId.phone,
        `Sorry, another driver was selected for this load.\n` +
        `Route: ${load.source} → ${load.destination}`
      )
    }

  } catch (err) {
    console.error('settleAuction error:', err.message)
  }
}

router.get('/:id', async (req, res) => {
  try {
    const load = await Load.findById(req.params.id)
    if (!load) return res.status(404).json({ success: false, error: 'Load not found' })
    res.json({ success: true, load })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

module.exports = router
module.exports.settleAuction = settleAuction