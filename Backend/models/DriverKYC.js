// models/DriverKYC.js

const mongoose = require('mongoose')

const driverKYCSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },

    phone: {
      type: String,
      required: true,
    },

    overallStatus: {
      type: String,
      enum: ['PENDING', 'VERIFIED', 'SUSPENDED'],
      default: 'PENDING',
      // PENDING   = DigiLocker OAuth not completed yet
      // VERIFIED  = all documents fetched and valid
      // SUSPENDED = was verified but a document has expired
    },

    // ─── DRIVING LICENCE ──────────────────────────────

    drivingLicence: {
      number: { type: String, default: null },
      holderName: { type: String, default: null },
      expiryDate: { type: Date, default: null },
      verified: { type: Boolean, default: false },
    },

    // ─── RC BOOK ──────────────────────────────────────

    rcBook: {
      number: { type: String, default: null },
      vehicleNumber: { type: String, default: null },
      ownerName: { type: String, default: null },
      expiryDate: { type: Date, default: null },
      verified: { type: Boolean, default: false },
    },

    // ─── FITNESS CERTIFICATE ──────────────────────────

    fitnessCertificate: {
      number: { type: String, default: null },
      expiryDate: { type: Date, default: null },
      verified: { type: Boolean, default: false },
    },

    // ─── EXPIRY REMINDERS ─────────────────────────────

    remindersSent: {
      thirtyDay: { type: Boolean, default: false },
      sevenDay: { type: Boolean, default: false },
    },

    // ─── DIGILOCKER ───────────────────────────────────

    digilocker: {
      accessToken: { type: String, default: null },
      fetchedAt: { type: Date, default: null },
    },

  },
  {
    timestamps: true,
  }
)

driverKYCSchema.index({ userId: 1 })
driverKYCSchema.index({ phone: 1 })
driverKYCSchema.index({
  overallStatus: 1,
  'drivingLicence.expiryDate': 1,
  'fitnessCertificate.expiryDate': 1,
})

module.exports = mongoose.model('DriverKYC', driverKYCSchema)