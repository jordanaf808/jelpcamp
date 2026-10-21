require('dotenv').config()
const mongoose = require('mongoose')
const mongoUri = require('./mongoUri')

module.exports = async () => {
	const db = mongoose.connection
	// An error after the first connection arrives here. Throwing from an event
	// listener would crash the process with nothing to catch it, so log instead.
	db.on('error', (err) => console.error('db: connection error;', err.message))
	db.once('open', () => console.log(`database connected: ${db.name}`))
	console.log(`MongoDB Connecting;`)
	await mongoose.connect(mongoUri(), {
		// useNewUrlParser: true,
		// useUnifiedTopology: true,
		// useFindAndModify: false,
		// useCreateIndex: true
	})
}
