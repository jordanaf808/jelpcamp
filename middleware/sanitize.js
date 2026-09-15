const {sanitize} = require('express-mongo-sanitize')

// Strips keys that start with `$` or contain `.` from user input, so a request
// cannot smuggle a MongoDB operator such as `{"$gt": ""}` into a query.
//
// This replaces `app.use(mongoSanitize())`. That middleware assigns each
// sanitized object back onto the request, including `req.query = ...`, and in
// Express 5 `req.query` is a getter with no setter: the assignment throws on
// every request. Only the package's pure `sanitize()` function is used here.
//
// `req.query` is redefined as a plain property rather than edited in place,
// because Express 5's getter re-parses the query string on every read, so an
// in-place edit would be lost on the next access. On Express 4 it is already a
// plain property, and this behaves like the old assignment.
//
// `params` is kept for parity with the old middleware, but at app level it is
// always empty: the router fills in route params later.
module.exports = function sanitizeRequest(req, res, next) {
	for (const key of ['body', 'params', 'headers']) {
		if (req[key]) req[key] = sanitize(req[key])
	}
	Object.defineProperty(req, 'query', {
		value: sanitize(req.query),
		writable: true,
		enumerable: true,
		configurable: true,
	})
	next()
}
