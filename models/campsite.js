
const mongoose = require("mongoose");
//SCHEMA SETUP:
const campsiteSchema = new mongoose.Schema({
	name: String,
	id: Number,
	geometry: {
		TYPE: {
			type: String,
			enum: ['Point'],
			required: true
		},
		COORDINATES: {
			type: [Number],
			required: true
		}
	},
	comments: [
		{
			type: mongoose.Schema.Types.ObjectId,
			ref: "Comment"
		}
	]
});

module.exports = mongoose.model("Campsite", campsiteSchema);