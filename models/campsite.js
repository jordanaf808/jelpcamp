const mongoose = require('mongoose')
//SCHEMA SETUP:
const campsiteSchema = new mongoose.Schema({
	name: String,
	id: Number,
	// From RIDB, for the favorites page. Campsites saved before these existed
	// get them on their next visit (routes/campsites.js).
	state: String,
	recAreaName: String,
	createdAt: {type: Date, default: Date.now},
	geometry: {
		TYPE: {
			type: String,
			enum: ['Point'],
			required: true,
		},
		COORDINATES: {
			type: [Number],
			required: true,
		},
	},
	comments: [
		{
			type: mongoose.Schema.Types.ObjectId,
			ref: 'Comment',
		},
	],
})

module.exports = mongoose.model('Campsite', campsiteSchema)
