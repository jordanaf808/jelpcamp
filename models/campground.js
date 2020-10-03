
const mongoose = require("mongoose");
const numeral	= require("numeral");
//SCHEMA SETUP:
const campgroundSchema = new mongoose.Schema({
	name: String,
	image: String,
	price: Number,
	description: String,
	location: String,
	lat: Number,
	lng: Number,
	author: {
		id: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "User"
			},
		username: String
		},
	comments: [
		{
			type: mongoose.Schema.Types.ObjectId,
			ref: "Comment"
		}
	]
});

// function getPrice(String){
//     numeral(String).format('$ 0,0[.]00');
// }

// function setPrice(String){
// 	numeral(String).format('$ 0,0[.]00');
// }

module.exports = mongoose.model("Campground", campgroundSchema);