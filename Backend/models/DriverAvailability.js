// models/DriverAvailability.js

const mongoose = require('mongoose')

const driverAvailabilitySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    phone: {
      type: String,
      required: true,
      // denormalized again — matching engine queries
      // this collection directly by phone constantly
    },

    // ─── ROUTE ────────────────────────────────────────

    source: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      // storing uppercase so MUMBAI and Mumbai
      // don't cause mismatch in matching engine
    },

    destination: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },

    // ─── TRUCK DETAILS ────────────────────────────────

    truckType: {
      type: String,
      required: true,
      enum: [
        'OPEN_BODY',
        'CONTAINER',
        'FLATBED',
        'TANKER',
        'REFRIGERATED',
      ],
    },

    capacity: {
      type: Number,
      required: true,
      min: 1,
      // in tonnes
    },

    // ─── PRICING ──────────────────────────────────────

    Lmin: {
      type: Number,
      required: true,
      // absolute floor — driver won't go below this
    },

    Lmax: {
      type: Number,
      required: true,
      // driver's ideal ceiling
      // validate Lmax must be greater than Lmin
    },

    // ─── AVAILABILITY WINDOW ──────────────────────────

    availableFrom: {
      type: Date,
      required: true,
      // when is the truck ready for pickup
    },

    expiresAt: {
      type: Date,
      required: true,
      // auto set to availableFrom + 24 hours
      // after this the listing is pulled from marketplace
    },

    // ─── STATUS ───────────────────────────────────────

    status: {
      type: String,
      enum: ['ACTIVE', 'LOCKED', 'EXPIRED', 'WITHDRAWN'],
      default: 'ACTIVE',
      // ACTIVE    = visible in marketplace, accepting bids
      // LOCKED    = driver won a bid, on a trip right now
      // EXPIRED   = 24 hours passed, auto pulled from marketplace
      // WITHDRAWN = driver manually cancelled this listing
    },

    // ─── LINKED MATCH ─────────────────────────────────

    currentMatchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Match',
      default: null,
      // filled when status becomes LOCKED
      // tells you exactly which trip locked this driver
      // cleared back to null when trip completes in Bot 5
    },

  },
  {
    timestamps: true,
  }
)

// ─── VALIDATION ───────────────────────────────────────────

driverAvailabilitySchema.pre('save', function (next) {
  if (this.Lmax <= this.Lmin) {
    return next(new Error('Lmax must be greater than Lmin'))
  }
  if (!this.expiresAt) {
    // auto set expiry to 24 hours from availableFrom
    this.expiresAt = new Date(
      this.availableFrom.getTime() + 24 * 60 * 60 * 1000
    )
  }
  next()
})

// ─── INDEXES ──────────────────────────────────────────────

driverAvailabilitySchema.index({ userId: 1 })
driverAvailabilitySchema.index({ phone: 1 })

// this is the most critical index in the entire system
// the matching engine runs this query every time
// a supplier posts a load:
// find all drivers where source matches AND destination matches
// AND status is ACTIVE AND capacity >= required weight
driverAvailabilitySchema.index({
  source: 1,
  destination: 1,
  status: 1,
  capacity: 1,
})

// for the 24hr expiry cron job
// runs every hour, finds all ACTIVE listings
// whose expiresAt has passed and marks them EXPIRED
driverAvailabilitySchema.index({
  status: 1,
  expiresAt: 1,
})

module.exports = mongoose.model('DriverAvailability', driverAvailabilitySchema)