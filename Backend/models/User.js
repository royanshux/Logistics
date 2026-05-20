// models/User.js

const mongoose = require('mongoose')

const userSchema = new mongoose.Schema(
  {
    phone: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      // always store with country code — 919876543210
    },

    name: {
      type: String,
      trim: true,
      default: null,
      // collected during onboarding, null until provided
    },

    userType: {
      type: String,
      enum: ['DRIVER', 'SUPPLIER', 'UNKNOWN'],
      default: 'UNKNOWN',
      // UNKNOWN = first message ever, type not decided yet
    },

    isVerified: {
      type: Boolean,
      default: false,
      // for drivers — flips to true after KYC clears
      // for suppliers — can be true after basic registration
    },

    isActive: {
      type: Boolean,
      default: true,
      // false = banned or deactivated by admin
    },

    onboardingComplete: {
      type: Boolean,
      default: false,
      // false = still going through registration flow
      // true = can access marketplace
    },

    lastSeenAt: {
      type: Date,
      default: Date.now,
      // updated every time this user sends any message
    },

    rating: {
      average: {
        type: Number,
        default: 0,
        min: 0,
        max: 5,
      },
      totalRatings: {
        type: Number,
        default: 0,
      },
      // both drivers and suppliers get rated
      // updated by Bot 5 after each delivery
    },
  },
  {
    timestamps: true,
    // auto adds createdAt and updatedAt fields
  }
)

// index on phone since every single webhook hit
// queries by phone number first — needs to be fast
userSchema.index({ phone: 1 })
userSchema.index({ userType: 1, isVerified: 1 })

module.exports = mongoose.model('User', userSchema)