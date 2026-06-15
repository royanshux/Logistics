// index.js

import express from 'express'
import dotenv from 'dotenv'
import loadRouter from './routes/load.js'
import bidRouter from './routes/bid.js'
import './jobs/auctionCron.js'
import webhookRouter from './routes/webhook.js'

dotenv.config()

const app = express()
app.use(express.json())

app.use('/load', loadRouter)
app.use('/bid', bidRouter)
app.use('/webhook', webhookRouter)

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})