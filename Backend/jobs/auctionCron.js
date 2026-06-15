// jobs/auctionCron.js

import cron from 'node-cron'
import supabase from '../config/supabase.js'
import { sendWhatsAppMessage } from '../services/whatsappService.js'

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

  const { data: openLoads, error } = await supabase
    .from('loads')
    .select('*')
    .eq('status', 'OPEN')

  if (error || !openLoads.length) return

  for (const load of openLoads) {

    const { data: newDrivers } = await supabase
      .from('driver_availability')
      .select('*')
      .eq('source', load.source)
      .eq('destination', load.destination)
      .eq('truck_type', load.truck_type)
      .gte('capacity', load.weight)
      .eq('status', 'ACTIVE')
      .lte('l_min', load.s_min)
      .gt('created_at', load.created_at)
      .is('pending_load_id', null)  // add this

    if (!newDrivers || newDrivers.length === 0) continue

    const toNotify = newDrivers
    if (toNotify.length === 0) continue

    for (const driver of toNotify) {
      await supabase
        .from('driver_availability')
        .update({ pending_load_id: load.id })
        .eq('id', driver.id)

      await supabase
        .from('users')
        .update({ conversation_state: 'AWAITING_BID_RESPONSE' })
        .eq('phone', driver.phone)  

      await sendWhatsAppMessage(driver.phone,
        `New load on your route!\n` +
        `Route: ${load.source} → ${load.destination}\n` +
        `Weight: ${load.weight} tonnes\n` +
        `Truck: ${load.truck_type}\n` +
        `Budget: ₹${load.s_min} - ₹${load.s_max}\n` +
        `Pickup by: ${load.pickup_by}\n\n` +
        `Reply YES to accept or NO to pass.`
      )
    }
  }
}

async function checkBiddingLoads() {

  const now = new Date()
  const twoMinsFromNow = new Date(now.getTime() + 2 * 60 * 1000).toISOString()

  const { data: biddingLoads, error } = await supabase
    .from('loads')
    .select('*')
    .eq('status', 'BIDDING')
    .gt('bidding_ends_at', twoMinsFromNow)

  if (error || !biddingLoads.length) return

  for (const load of biddingLoads) {

    const { data: newDrivers } = await supabase
      .from('driver_availability')
      .select('*')
      .eq('source', load.source)
      .eq('destination', load.destination)
      .eq('truck_type', load.truck_type)
      .gte('capacity', load.weight)
      .eq('status', 'ACTIVE')
      .lte('l_min', load.s_min)
      .gt('created_at', load.bidding_started_at)
      .is('pending_load_id', null)  // add this

    if (!newDrivers || newDrivers.length === 0) continue

    const { data: existingBids } = await supabase
      .from('bids')
      .select('driver_id')
      .eq('load_id', load.id)

    const alreadyRespondedIds = []
    if (existingBids) {
      for (const bid of existingBids) {
        alreadyRespondedIds.push(bid.driver_id)
      }
    }

    const toNotify = []
    for (const driver of newDrivers) {
      if (!alreadyRespondedIds.includes(driver.user_id)) {
        toNotify.push(driver)
      }
    }

    if (toNotify.length === 0) continue

    const timeLeft = Math.round((new Date(load.bidding_ends_at) - now) / 60000)

    for (const driver of toNotify) {
      await supabase
        .from('driver_availability')
        .update({ pending_load_id: load.id })
        .eq('id', driver.id)
        
      await supabase
        .from('users')
        .update({ conversation_state: 'AWAITING_BID_RESPONSE' })
        .eq('phone', driver.phone)

      await sendWhatsAppMessage(driver.phone,
        `New load on your route!\n` +
        `Route: ${load.source} → ${load.destination}\n` +
        `Weight: ${load.weight} tonnes\n` +
        `Truck: ${load.truck_type}\n` +
        `Budget: ₹${load.s_min} - ₹${load.s_max}\n` +
        `Pickup by: ${load.pickup_by}\n\n` +
        `Reply YES to accept or NO to pass. You have ${timeLeft} minutes left.`
      )
    }
  }
}


async function expireOldLoads() {
  const now = new Date().toISOString()

  await supabase
    .from('loads')
    .update({ status: 'EXPIRED' })
    .in('status', ['OPEN', 'BIDDING'])
    .lt('pickup_by', now)
}


