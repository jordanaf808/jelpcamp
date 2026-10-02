require('dotenv').config()
const express = require('express')
const Axios = require('axios').default
const router = express.Router()
const ExpressError = require('../utils/ExpressError')

const Campsite = require('../models/campsite')
const User = require('../models/user')

const mutateData = require('../utils/mutateData')
const sanitizeDescription = require('../utils/sanitizeDescription')

// import Axios Cache Interceptor
const {setupCache} = require('axios-cache-interceptor')
// same object, but with updated typings.
const axios = setupCache(Axios)
// for debugging cache
// const { setupCache } = require('axios-cache-interceptor/dev');
// const axios = setupCache(Axios, {
//   debug: console.log
// });

axios.defaults.baseURL = 'https://ridb.recreation.gov/api/v1/'
axios.defaults.headers = {
	'Content-Type': 'application/json',
	apikey: process.env.RIDB_API_KEY,
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',
}

// ==========|  INDEX  |========== \\

// *** Try to save the response to Local Storage
// *** Try to use campsite data in mongoDB to populate the homepage map and maybe cards... maybe need description data not in mongoDB.

router.get('/', async (req, res) => {
	try {
		const params = {query: 'hiking', limit: 25, full: 'false', sort: 'Date'} // state: "CA"
		const response = await axios.get('/facilities', {
			params,
			cache: {ttl: 1800000},
		})
		const data = response.data.RECDATA
		// filter out any data withOUT GEOJSON and separate data for map feature
		const {recData, mapData} = mutateData(data)
		res.render('campsites/index', {recData, mapData, mapBox: true})
	} catch (e) {
		console.log('oh no.', e)
	}
})

// ==========|   SEARCH  |========== \\

router.get('/search', async (req, res) => {
	try {
		const search = req.query.search
		const state = req.query.state
		const activity = req.query.activities
		const limit = req.query.limit
		const searchParams = {
			query: search,
			activity,
			state,
			limit,
			sort: 'Date',
		}
		const response = await axios.get('/facilities', {params: searchParams})
		console.log('search response status: ', response.status)
		const data = response.data.RECDATA
		const {recData, mapData} = mutateData(data)
		console.log('response METADATA: ', response.data.METADATA)
		res.render('campsites/results', {
			recData,
			mapData,
			searchParams,
			mapBox: true,
		})
	} catch (e) {
		console.log('oh no.', e)
	}
})

// ==========|  SHOW  |========== \\

router.get('/show/:id', async (req, res) => {
	try {
		const {id} = req.params
		// full: true adds the facility's links and its parent rec area to the
		// record. The photos are in it either way. This is the only RIDB request
		// the page needs.
		const response = await axios.get(`/facilities/${id}`, {
			params: {full: true},
			cache: {ttl: 1800000},
		})
		// The show route fetches a single facility and never passes through
		// mutateData, so it sanitizes at its own fetch boundary.
		const recData = {
			...response.data,
			FacilityDescription: sanitizeDescription(
				response.data.FacilityDescription,
			),
		}
		const data = {
			recData,
			mediaData: recData.MEDIA,
			linksData: recData.LINK,
			// RECAREA holds a short summary of the parent rec area: its id, name
			// and link. A facility can also stand alone, with no parent.
			parentRecArea: recData.RECAREA[0] ?? {},
		}
		const newCampsite = {
			name: recData.FacilityName,
			id: id,
			geometry: recData.GEOJSON,
		}
		// Campground.findbyid if no create, if yes populate
		const foundCampsite = await Campsite.findOne({id: id})
			.populate('comments')
			.exec()
		if (!foundCampsite) {
			const madeCampsite = await Campsite.create(newCampsite)
			if (!madeCampsite) {
				console.log('err: ', madeCampsite)
			} else {
				console.log(madeCampsite)
				res.render('campsites/show', {
					data,
					foundCampsite: madeCampsite,
					favorite: false,
					mapsKey: process.env.MAPS_API_KEY,
					mapsMapId: process.env.MAPS_MAP_ID,
				})
			}
		} else {
			if (req.isAuthenticated()) {
				const user = req.user
				const foundUser = await User.findById(user._id)
					.populate('favorites')
					.exec()
				let favorites = false
				for (fav of foundUser.favorites) {
					if (fav._id.toString() === foundCampsite._id.toString()) {
						favorites = true
					}
				}
				if (favorites) {
					return res.render('campsites/show', {
						data,
						foundCampsite,
						favorite: true,
						mapsKey: process.env.MAPS_API_KEY,
						mapsMapId: process.env.MAPS_MAP_ID,
					})
				}
			}
			res.render('campsites/show', {
				data,
				foundCampsite,
				favorite: false,
				mapsKey: process.env.MAPS_API_KEY,
				mapsMapId: process.env.MAPS_MAP_ID,
			})
		}
	} catch (e) {
		console.log('oh no.', e)
	}
})

// ==========|  404  |========== \\

router.use((req, res) => {
	// place after routes. if user doesn't select
	// above routes this 404 route will run.
	// console.log("request 404!!!")
	res.send('Go Back Home Lassie!')
})

module.exports = router
