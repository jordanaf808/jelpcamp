// Pins the redesigned campsite page (design 1d): the header, the gallery, the
// sections, the comments and the aside, with the RIDB API mocked.
//
// axios-cache-interceptor caches each facility for the life of the process, so
// every test asks for its own facility id.
const test = require('node:test')
const assert = require('node:assert')
const mongoose = require('mongoose')
const request = require('supertest')
const nock = require('nock')
const setup = require('./setup')
const Campsite = require('../models/campsite')
const Comment = require('../models/comment')
const User = require('../models/user')
const facility = require('./fixtures/ridb-facility-233115-full.json')

const RIDB = 'https://ridb.recreation.gov'

let app

test.before(async () => {
	;({app} = await setup.start())
	nock.disableNetConnect()
	nock.enableNetConnect('127.0.0.1')
})

test.after(async () => {
	nock.cleanAll()
	nock.enableNetConnect()
	await setup.stop()
})

// Mocks one RIDB response for facility `id`, built from the captured record.
const mockFacility = (id, overrides = {}) =>
	nock(RIDB)
		.get(`/api/v1/facilities/${id}`)
		.query({full: 'true'})
		.reply(200, {...facility, FacilityID: String(id), ...overrides})

const page = async (id, overrides, agent = request(app)) => {
	mockFacility(id, overrides)
	const res = await agent.get(`/campsites/show/${id}`)
	assert.strictEqual(res.status, 200)
	return res.text
}

// A logged-in agent and its user document.
const logIn = async (username) => {
	const agent = request.agent(app)
	const res = await agent
		.post('/register')
		.type('form')
		.send({username, password: `${username}-pw`})
	assert.strictEqual(res.headers.location, '/campsites', 'registration failed')
	const user = await User.findOne({username})
	return {agent, user}
}

const unescape = (value) => value.replaceAll('&amp;', '&')

// The href of every <a> in the page, unescaped.
const hrefs = (html) =>
	[...html.matchAll(/<a\b[^>]*\bhref="([^"]*)"/g)].map(([, href]) =>
		unescape(href),
	)

// The opening tag of every element with this tag name.
const tags = (html, name) =>
	[...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'g'))].map(([tag]) => tag)

const attr = (tag, name) =>
	tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1] ?? null

// A campsite stored with these comments, so the page finds it and populates them.
const campsiteWithComments = async (id, comments) =>
	Campsite.create({
		name: facility.FacilityName,
		id,
		geometry: facility.GEOJSON,
		comments: comments.map((comment) => comment._id),
	})

test('the header links back to /campsites', async () => {
	const html = await page(301)
	assert.match(
		html,
		/<a\b[^>]*\bhref="\/campsites"[^>]*>\s*← BACK TO CAMPSITES\s*<\/a>/,
	)
})

test('the header shows the type, the state and the rec area', async () => {
	const html = await page(302)
	assert.match(html, />\s*Campground\s*</)
	assert.match(html, />\s*OR\s*</)
	assert.match(
		html,
		/Located in\s*<[^>]+>\s*Wallowa Whitman National Forest\s*</,
	)
})

test('with no parent rec area, the header leaves out "Located in"', async () => {
	const html = await page(303, {ParentRecAreaID: '', RECAREA: []})
	assert.ok(!html.includes('Located in'))
})

test('"Open directions" links to Google Maps at the facility', async () => {
	const html = await page(304)
	const [lng, lat] = facility.GEOJSON.COORDINATES
	assert.ok(
		hrefs(html).includes(
			`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
		),
		'no directions link with the facility coordinates',
	)
	assert.match(html, /Open directions →/)
})

test('the overview, directions and fees each get a labelled section', async () => {
	const html = await page(305)
	for (const label of ['OVERVIEW', 'DIRECTIONS', 'FEES']) {
		assert.match(html, new RegExp(`>\\s*${label}\\s*<`), label)
	}
})

test('an empty directions or fees field gets no section', async () => {
	const html = await page(306, {
		FacilityDirections: '',
		FacilityUseFeeDescription: '  ',
	})
	assert.match(html, />\s*OVERVIEW\s*</)
	assert.doesNotMatch(html, />\s*DIRECTIONS\s*</)
	assert.doesNotMatch(html, />\s*FEES\s*</)
})

test('the page has no collapse, no carousel.js, and loads gallery.js', async () => {
	const html = await page(307)
	assert.doesNotMatch(html, /data-toggle="collapse"/)
	assert.doesNotMatch(html, /carousel\.js/)
	assert.match(html, /<script src="\/js\/gallery\.js" defer><\/script>/)
})

test('the gallery keeps every photo in the markup, and lazy-loads the hidden ones', async () => {
	const html = await page(308)
	const images = facility.MEDIA.filter((m) => m.MediaType === 'Image')
	// One large photo and two small ones show; the rest sit behind the tile.
	assert.match(html, new RegExp(`\\+${images.length - 3} more`))

	const slides = tags(html, 'img').filter((tag) =>
		/\bdata-gallery-slide\b/.test(tag),
	)
	assert.strictEqual(slides.length, images.length)
	assert.deepStrictEqual(
		slides.map((tag) => attr(tag, 'src')).sort(),
		images.map((m) => m.URL).sort(),
	)
	// The first slide is the primary photo, and the only one shown.
	const primary = images.find((m) => m.IsPrimary)
	assert.strictEqual(attr(slides[0], 'src'), primary.URL)
	for (const slide of slides.slice(1)) {
		assert.match(slide, /\sloading="lazy"/)
	}
})

test('a facility with no media gets no gallery', async () => {
	const html = await page(309, {MEDIA: []})
	assert.doesNotMatch(html, /data-gallery\b/)
	assert.doesNotMatch(html, /gallery\.js/)
})

test('a video is a link, never an image', async () => {
	const video = {
		...facility.MEDIA[2],
		MediaType: 'Video',
		IsPrimary: false,
		Title: 'Campground tour',
		URL: 'https://www.youtube.com/watch?v=campground-tour',
	}
	const html = await page(310, {MEDIA: [video, ...facility.MEDIA]})
	const sources = tags(html, 'img').map((tag) => attr(tag, 'src'))
	assert.ok(!sources.includes(video.URL), 'the video is in an <img>')
	assert.ok(hrefs(html).includes(video.URL), 'the video has no link')
})

// Escaping keeps markup out of an href, but not a javascript: URL, and a
// scheme-less //host link would follow the page's scheme to any host. The page
// links only http(s) URLs from RIDB.
test('only http(s) links and videos from RIDB become links', async () => {
	const bad = ['javascript:alert(1)', '//evil.example']
	const video = {...facility.MEDIA[2], MediaType: 'Video', IsPrimary: false}
	const html = await page(318, {
		LINK: [
			...bad.map((URL) => ({...facility.LINK[0], Title: `Bad ${URL}`, URL})),
			facility.LINK[0],
		],
		MEDIA: [
			...bad.map((URL) => ({...video, Title: `Bad ${URL}`, URL})),
			...facility.MEDIA,
		],
	})
	for (const url of bad) {
		assert.ok(
			!hrefs(html).some((href) => href.includes(url)),
			`${url} is in an href`,
		)
	}
	assert.ok(
		hrefs(html).includes(facility.LINK[0].URL),
		'the valid link is gone',
	)
})

test('"Comments (n)" jumps to the comments', async () => {
	const author = new User({username: 'counted'})
	const comments = await Comment.create([
		{text: 'First comment here.', author: {id: author._id, username: 'a'}},
		{text: 'Second comment here.', author: {id: author._id, username: 'b'}},
	])
	await campsiteWithComments(311, comments)
	const html = await page(311)
	assert.match(html, /<a\b[^>]*\bhref="#comments"[^>]*>\s*Comments \(2\)\s*</)
	assert.match(html, /\bid="comments"/)
})

test('a comment shows the date it was made, from createdAt', async () => {
	const author = new User({username: 'dated'})
	const [comment] = await Comment.create([
		{
			text: 'Dated comment text.',
			createdAt: new Date('2024-03-05T12:00:00Z'),
			author: {id: author._id, username: 'dated'},
		},
	])
	await campsiteWithComments(312, [comment])
	const html = await page(312)
	assert.match(
		html,
		/<time\b[^>]*\bdatetime="2024-03-05T12:00:00\.000Z"[^>]*>\s*Mar 5, 2024\s*<\/time>/,
	)
	assert.doesNotMatch(html, /10 days ago/)
})

// Comments made before 2023-06-22 have no createdAt. Mongoose fills a missing
// default in as it loads the document, so the page would date them today. Their
// ObjectId holds the time they were made.
test('a comment stored without createdAt is dated from its id', async () => {
	const _id = mongoose.Types.ObjectId.createFromTime(
		Date.parse('2021-07-04T18:30:00Z') / 1000,
	)
	await Comment.collection.insertOne({
		_id,
		text: 'An old comment.',
		author: {username: 'old-timer'},
	})
	await campsiteWithComments(313, [{_id}])
	const html = await page(313)
	assert.match(
		html,
		/<time\b[^>]*\bdatetime="2021-07-04T18:30:00\.000Z"[^>]*>\s*Jul 4, 2021\s*<\/time>/,
	)
})

// A comment can also hold createdAt: null, which mongoose loads as null and
// not as its default.
test(
	'a comment stored with createdAt null is dated from its id',
	{todo: 'madeAt falls back to the id unless createdAt is a valid date'},
	async () => {
		const _id = mongoose.Types.ObjectId.createFromTime(
			Date.parse('2022-02-14T09:00:00Z') / 1000,
		)
		await Comment.collection.insertOne({
			_id,
			text: 'A comment with a null date.',
			createdAt: null,
			author: {username: 'null-date'},
		})
		await campsiteWithComments(319, [{_id}])
		const html = await page(319)
		assert.match(
			html,
			/<time\b[^>]*\bdatetime="2022-02-14T09:00:00\.000Z"[^>]*>\s*Feb 14, 2022\s*<\/time>/,
		)
	},
)

test('logged out, the page links to the login instead of showing the comment form', async () => {
	const html = await page(314)
	assert.doesNotMatch(html, /name="comment\[text\]"/)
	assert.match(html, /<a\b[^>]*\bhref="\/login"[^>]*>\s*Log in to comment\s*</)
})

test('logged in, the page has the comment form', async () => {
	const {agent} = await logIn('commenter')
	const html = await page(315, {}, agent)

	const form = tags(html, 'form').find(
		(tag) => attr(tag, 'action') === '/campsites/315/comments',
	)
	assert.ok(form, 'no form posts to /campsites/315/comments')
	assert.strictEqual(attr(form, 'method'), 'POST')
	assert.match(attr(form, 'class'), /\bvalidated-form\b/)

	const [textarea] = tags(html, 'textarea')
	assert.ok(textarea, 'no textarea')
	assert.strictEqual(attr(textarea, 'name'), 'comment[text]')
	assert.match(textarea, /\srequired\b/)
	// The server's Joi rule: 10 to 300 characters.
	assert.strictEqual(attr(textarea, 'minlength'), '10')
	assert.strictEqual(attr(textarea, 'maxlength'), '300')
	const id = attr(textarea, 'id')
	assert.ok(id, 'the textarea needs an id for its label')
	assert.match(html, new RegExp(`<label\\b[^>]*\\bfor="${id}"`))

	assert.match(html, /<script src="\/js\/validateForms\.js"><\/script>/)
	assert.doesNotMatch(html, /Log in to comment/)
})

test('only the author sees EDIT and DELETE on a comment', async () => {
	const {agent, user} = await logIn('author')
	const [mine] = await Comment.create([
		{text: 'My own comment.', author: {id: user._id, username: 'author'}},
	])
	await campsiteWithComments(316, [mine])

	const edit = `/campsites/316/comments/${mine._id}/edit`
	const remove = `/campsites/316/comments/${mine._id}?_method=DELETE`
	const deleteForm = (html) =>
		tags(html, 'form').find((tag) => unescape(attr(tag, 'action')) === remove)

	const asAuthor = await page(316, {}, agent)
	assert.ok(hrefs(asAuthor).includes(edit), 'the author has no edit link')
	assert.ok(deleteForm(asAuthor), 'the author has no delete form')
	assert.strictEqual(attr(deleteForm(asAuthor), 'method'), 'POST')

	const loggedOut = await request(app).get('/campsites/show/316')
	assert.strictEqual(loggedOut.status, 200)
	assert.ok(!hrefs(loggedOut.text).includes(edit))
	assert.ok(!deleteForm(loggedOut.text))

	const {agent: bystander} = await logIn('bystander')
	const asOther = await bystander.get('/campsites/show/316')
	assert.strictEqual(asOther.status, 200)
	assert.ok(!hrefs(asOther.text).includes(edit), 'another user can edit')
	assert.ok(!deleteForm(asOther.text), 'another user can delete')
})

test('the favorite form shows until the campsite is a favorite', async () => {
	const {agent, user} = await logIn('favoriter')
	const action = `/user/${user._id}/317/`
	const favoriteForm = (html) =>
		tags(html, 'form').find((tag) => attr(tag, 'action') === action)

	const before = await page(317, {}, agent)
	assert.ok(favoriteForm(before), `no form posts to ${action}`)
	assert.strictEqual(attr(favoriteForm(before), 'method'), 'POST')

	await agent.post(action)
	const {favorites} = await User.findById(user._id)
	assert.strictEqual(favorites.length, 1, 'the favorite was not saved')

	const after = await agent.get('/campsites/show/317')
	assert.strictEqual(after.status, 200)
	assert.ok(!favoriteForm(after.text), 'the form shows for a favorite')

	const loggedOut = await request(app).get('/campsites/show/317')
	assert.ok(!loggedOut.text.includes('/user/'), 'logged out sees the form')
})
