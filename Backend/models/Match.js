// models/Match.js

const mongoose = require('mongoose')

const matchSchema = new mongoose.Schema(
  { 

    orderId: {
      type: String,
      unique: true,
      // auto generated at match time e.g. HYD-9821
    },

    loadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Load',
      required: true,
    },
    

    driverAvailabilityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DriverAvailability',
      required: true,
    },

    driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    supplierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    finalPrice: {
      type: Number,
      required: true,
    },

    pricingMode: {
      type: String,
      enum: ['HAPPY_SHIPPER', 'HAPPY_TRUCKER', 'HAPPY_BROKER'],
      required: true,
    },

    

    status: {
      type: String,
      enum: ['CONFIRMED', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED'],
      default: 'CONFIRMED',
      // CONFIRMED  = match settled, waiting for pickup
      // IN_TRANSIT = loading OTP entered, trip started
      // DELIVERED  = unloading OTP entered, trip done
      // CANCELLED  = trip cancelled after match
    },
  },
  {
    timestamps: true,
  }
)

module.exports = mongoose.model('Match', matchSchema)