// models/Bid.js

const mongoose = require('mongoose')

const bidSchema = new mongoose.Schema(
  {
    loadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Load',
      required: true,
    },

    driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    driverAvailabilityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DriverAvailability',
      required: true,
    },

    status: {
      type: String,
      enum: ['PENDING', 'WON', 'LOST'],
      default: 'PENDING',
      // PENDING = window still running
      // WON     = pricing engine selected this driver
      // LOST    = another driver was selected
    },
  },
  {
    timestamps: true,
  }
)

module.exports = mongoose.model('Bid', bidSchema)