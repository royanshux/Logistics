// routes/load.js

import express from 'express'
import supabase from '../config/supabase.js'
import { sendWhatsAppMessage } from '../services/whatsappService.js'

const router = express.Router()

// POST /load
router.post('/', async (req, res) => {
  try {
    const { phone, source, destination, truckType, weight, cargoDescription, Smin, Smax, pickupBy, pickupAddress, deliveryAddress, receiverPhone } = req.body

    const { data: supplier, error: supplierError } = await supabase
      .from('users')
      .select('id')
      .eq('phone', phone)
      .single()

    if (supplierError || !supplier) return res.status(404).json({ success: false, error: 'Supplier not found' })

    const { data: load, error: loadError } = await supabase
      .from('loads')
      .insert({
        supplier_id: supplier.id,
        supplier_phone: phone,
        source: source.toUpperCase(),
        destination: destination.toUpperCase(),
        truck_type: truckType,
        weight,
        cargo_description: cargoDescription,
        s_min: Smin,
        s_max: Smax,
        pickup_by: pickupBy,
        pickup_address: pickupAddress,
        delivery_address: deliveryAddress,
        receiver_phone: receiverPhone,
      })
      .select()
      .single()

    if (loadError) return res.status(500).json({ success: false, error: loadError.message })


    const { data: matchingDrivers, error: driversError } = await supabase
      .from('driver_availability')
      .select('*')
      .eq('source', load.source)
      .eq('destination', load.destination)
      .eq('truck_type', load.truck_type)
      .gte('capacity', load.weight)
      .eq('status', 'ACTIVE')
      .lte('l_min', load.s_min)

    if (driversError) return res.status(500).json({ success: false, error: driversError.message })

    if (matchingDrivers.length === 0) {
      return res.status(201).json({
        success: true,
        load,
        message: 'No drivers found right now. Will keep checking.',
      })
    }

    for (const driver of matchingDrivers) {
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

    res.status(201).json({
      success: true,
      load,
      driversNotified: matchingDrivers.length,
    })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.get('/my-loads/:phone', async (req, res) => {
  try {
    const { data: loads, error } = await supabase
      .from('loads')
      .select('*')
      .eq('supplier_phone', req.params.phone)
      .order('created_at', { ascending: false })

    if (error) return res.status(500).json({ success: false, error: error.message })

    if (!loads || loads.length === 0) {
      return res.json({ success: true, loads: [], message: 'No loads found' })
    }

    res.json({ success: true, loads })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})


router.get('/:id', async (req, res) => {
  try {
    const { data: load, error } = await supabase
      .from('loads')
      .select('*')
      .eq('id', req.params.id)
      .single()

    if (error || !load) return res.status(404).json({ success: false, error: 'Load not found' })
    res.json({ success: true, load })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})


async function settleAuction(loadId) {
  try {
    const { data: load, error: loadError } = await supabase
      .from('loads')
      .select('*')
      .eq('id', loadId)
      .single()

    if (loadError || !load) return
    if (load.status !== 'BIDDING') return

    const { data: bids, error: bidsError } = await supabase
      .from('bids')
      .select('*, driver_availability_id(*)')
      .eq('load_id', loadId)
      .eq('status', 'PENDING')

    if (bidsError || !bids.length) return

    const PRICING_MODE = 'HAPPY_SHIPPER'

    let winningBid = bids[0]
    for (const bid of bids) {
      if (bid.driver_availability_id.l_min < winningBid.driver_availability_id.l_min) {
        winningBid = bid
      }
    }

    const priceMap = {
      HAPPY_SHIPPER: load.s_min,
      HAPPY_TRUCKER: (load.s_min + load.s_max) / 2,
      HAPPY_BROKER: load.s_max,
    }
    const finalPrice = priceMap[PRICING_MODE]

    const { data: match, error: matchError } = await supabase
      .from('matches')
      .insert({
        load_id: load.id,
        driver_availability_id: winningBid.driver_availability_id.id,
        driver_id: winningBid.driver_id,
        supplier_id: load.supplier_id,
        final_price: finalPrice,
        pricing_mode: PRICING_MODE,
        order_id: load.source.substring(0, 3) + '-' + Math.floor(1000 + Math.random() * 9000),
      })
      .select()
      .single()

    if (matchError) return console.error('match create error:', matchError.message)

    await supabase
      .from('loads')
      .update({ status: 'MATCHED', match_id: match.id })
      .eq('id', load.id)

    await supabase
      .from('driver_availability')
      .update({
        status: 'LOCKED',
        current_match_id: match.id,
        pending_load_id: null,
      })
      .eq('id', winningBid.driver_availability_id.id)

    await supabase
      .from('bids')
      .update({ status: 'WON' })
      .eq('id', winningBid.id)

    await supabase
      .from('bids')
      .update({ status: 'LOST' })
      .eq('load_id', loadId)
      .eq('status', 'PENDING')
      .neq('id', winningBid.id)
        

    await sendWhatsAppMessage(winningBid.driver_availability_id.phone,
      `You got the load!\n` +
      `Route: ${load.source} → ${load.destination}\n` +
      `Final Price: ₹${finalPrice}\n` +
      `Match ID: ${match.id}\n` +
      `Please proceed to pickup.`
    )

    await sendWhatsAppMessage(load.supplier_phone,
      `Your load has been matched!\n` +
      `Route: ${load.source} → ${load.destination}\n` +
      `Final Price: ₹${finalPrice}\n` +
      `Match ID: ${match.id}`
    )

    const losingBids = bids.filter(b => b.id !== winningBid.id)
    for (const bid of losingBids) {
      await sendWhatsAppMessage(bid.driver_availability_id.phone,
        `Sorry, another driver was selected for this load.\n` +
        `Route: ${load.source} → ${load.destination}`
      )
    }

  } catch (err) {
    console.error('settleAuction error:', err.message)
  }
}

export default router
export { settleAuction }