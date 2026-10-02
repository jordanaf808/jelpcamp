// req.flash(type, msg) queues a message in the session. req.flash(type) returns
// the queued messages and clears them. passport's failureFlash calls this by name.
//
// A read with nothing queued leaves the session untouched. Every page reads, so
// a read that wrote would give every visitor a stored session.
module.exports = (req, res, next) => {
	req.flash = (type, msg) => {
		const queued = req.session.flash?.[type] ?? []
		if (msg === undefined) {
			if (queued.length) delete req.session.flash[type]
			return queued
		}
		req.session.flash = {...req.session.flash, [type]: queued.concat(msg)}
	}
	next()
}
