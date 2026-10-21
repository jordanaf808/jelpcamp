// The Google Maps key for the campsite page. The key only works on hostnames
// its website restriction allows, and a Render PR preview copies production's
// MAPS_API_KEY, so a preview uses PREVIEW_MAPS_API_KEY instead. Render's
// IS_PULL_REQUEST is a string; see utils/mongoUri.js.
module.exports = () =>
	process.env.IS_PULL_REQUEST === 'true'
		? process.env.PREVIEW_MAPS_API_KEY
		: process.env.MAPS_API_KEY
