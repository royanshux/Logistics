// jobs/auctionCron.js

const cron = require('node-cron')
const Load = require('../models/Load')
const Bid = require('../models/Bid')
const DriverAvailability = require('../models/DriverAvailability')
const { sendWhatsAppMessage } = require('../services/whatsappService')

cron.schedule('* * * * *', async () => {
  try {
    await checkOpenLoads()
    await checkBiddingLoads()
    await expireOldLoads()
  } catch (err) {
    console.error('auctionCron error:', err.message)
  }
})

async function checkOpenLoads() {
  const openLoads = await Load.find({ status: 'OPEN' })

  for (const load of openLoads) {

    const newDrivers = await DriverAvailability.find({
      source: load.source,
      destination: load.destination,
      truckType: load.truckType,
      capacity: { $gte: load.weight },
      status: 'ACTIVE',
      Lmin: { $lte: load.Smin },
      createdAt: { $gt: load.createdAt },
    })

    if (newDrivers.length === 0) continue

    const existingBids = await Bid.find({ loadId: load._id })
    const alreadyRespondedIds = []
    for (const bid of existingBids) {
      alreadyRespondedIds.push(bid.driverId.toString())
    }

    const toNotify = []
    for (const driver of newDrivers) {
      if (!alreadyRespondedIds.includes(driver.userId.toString())) {
        toNotify.push(driver)
      }
    }

    if (toNotify.length === 0) continue

    for (const driver of toNotify) {
      // overwrite pendingLoadId — latest notification wins
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
  }
}

async function checkBiddingLoads() {
  const now = new Date()

  const biddingLoads = await Load.find({
    status: 'BIDDING',
    biddingEndsAt: { $gt: new Date(now.getTime() + 2 * 60 * 1000) },
  })

  for (const load of biddingLoads) {

    const newDrivers = await DriverAvailability.find({
      source: load.source,
      destination: load.destination,
      truckType: load.truckType,
      capacity: { $gte: load.weight },
      status: 'ACTIVE',
      Lmin: { $lte: load.Smin },
      createdAt: { $gt: load.biddingStartedAt },
    })

    if (newDrivers.length === 0) continue

    const existingBids = await Bid.find({ loadId: load._id })
    const alreadyRespondedIds = []
    for (const bid of existingBids) {
      alreadyRespondedIds.push(bid.driverId.toString())
    }

    const toNotify = []
    for (const driver of newDrivers) {
      if (!alreadyRespondedIds.includes(driver.userId.toString())) {
        toNotify.push(driver)
      }
    }

    if (toNotify.length === 0) continue

    const timeLeft = Math.round((load.biddingEndsAt - now) / 60000)

    for (const driver of toNotify) {
      // overwrite pendingLoadId — latest notification wins
      await DriverAvailability.findByIdAndUpdate(driver._id, { pendingLoadId: load._id })

      await sendWhatsAppMessage(driver.phone,
        `New load on your route!\n` +
        `Route: ${load.source} → ${load.destination}\n` +
        `Weight: ${load.weight} tonnes\n` +
        `Truck: ${load.truckType}\n` +
        `Budget: ₹${load.Smin} - ₹${load.Smax}\n` +
        `Pickup by: ${load.pickupBy}\n\n` +
        `Reply YES to accept or NO to pass. You have ${timeLeft} minutes left.`
      )
    }
  }
}

module.exports = {}

async function expireOldLoads() {
  const now = new Date()
  await Load.updateMany(
    {
      status: { $in: ['OPEN', 'BIDDING'] },
      pickupBy: { $lt: now },
    },
    { status: 'EXPIRED' }
  )
}