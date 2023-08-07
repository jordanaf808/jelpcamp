const mongoose = require("mongoose");
const passportLocalMongoose = require("passport-local-mongoose");

// const UserSchema = new mongoose.Schema({
// 	username: String,
// 	password: String,

const UserSchema = new mongoose.Schema({
	isAdmin: {type: Boolean, default: false},
	createdAt: { type: Date, default: Date.now },
	favorites: [
		{
			type: mongoose.Schema.Types.ObjectId,
			ref: "Campsite"
		}
	]
});

UserSchema.plugin(passportLocalMongoose);

module.exports = mongoose.model("User", UserSchema);