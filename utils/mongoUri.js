// The database this process uses. A Render PR preview copies every env var of
// the service it previews, production's MONGO_URI included, so a preview reads
// PREVIEW_MONGO_URI instead, and refuses to start without it rather than fall
// back to production. Render sets IS_PULL_REQUEST to the STRING 'true' on a
// preview and 'false' everywhere else, and 'false' is truthy, so it is compared.
module.exports = () => {
	if (process.env.IS_PULL_REQUEST !== 'true') return process.env.MONGO_URI
	if (!process.env.PREVIEW_MONGO_URI) {
		throw new Error(
			'PREVIEW_MONGO_URI is not set. A preview never falls back to MONGO_URI.',
		)
	}
	return process.env.PREVIEW_MONGO_URI
}
