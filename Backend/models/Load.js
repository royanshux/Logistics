// models/Load.js

const mongoose = require('mongoose')

const loadSchema = new mongoose.Schema(
  {
    supplierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    supplierPhone: {
      type: String,
      required: true,
    },

    pickupAddress: {
      type: String,
      required: true,
      trim: true,
    },

    deliveryAddress: {
      type: String,
      required: true,
      trim: true,
    },

    receiverPhone: {
      type: String,
      required: true,
    },

    source: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },

    destination: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },

    truckType: {
      type: String,
      required: true,
      enum: ['OPEN_BODY', 'CONTAINER', 'FLATBED', 'TANKER', 'REFRIGERATED'],
    },

    weight: {
      type: Number,
      required: true,
      min: 1,
      // in tonnes
    },

    cargoDescription: {
      type: String,
      trim: true,
      default: null,
    },

    Smin: {
      type: Number,
      required: true,
    },

    Smax: {
      type: Number,
      required: true,
    },

    pickupBy: {
      type: Date,
      required: true,
    },

    status: {
      type: String,
      enum: ['OPEN', 'BIDDING', 'MATCHED', 'EXPIRED', 'CANCELLED'],
      default: 'OPEN',
      // OPEN      = posted, no bids yet
      // BIDDING   = first bid in, 10-min timer running
      // MATCHED   = auction done, driver confirmed
      // EXPIRED   = pickupBy passed, no match
      // CANCELLED = supplier pulled the load
    },

    biddingStartedAt: {
      type: Date,
      default: null,
    },

    biddingEndsAt: {
      type: Date,
      default: null,
      // biddingStartedAt + 10 mins, auto set in pre-save
    },

    matchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Match',
      default: null,
    },
  },
  {
    timestamps: true,
  }
)

loadSchema.pre('save', function (next) {
  if (this.Smax <= this.Smin) {
    return next(new Error('Smax must be greater than Smin'))
  }
  if (this.biddingStartedAt && !this.biddingEndsAt) {
    this.biddingEndsAt = new Date(
      this.biddingStartedAt.getTime() + 10 * 60 * 1000
    )
  }
  next()
})

module.exports = mongoose.model('Load', loadSchema)