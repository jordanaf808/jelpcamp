
// const { response } = require('express');
require('dotenv').config();
const express    	 		= require("express"),
	  	app        	 		= express(),
	  	axios      	 		= require("axios").default,
	  	bodyParser 	 		= require("body-parser"),
      methodOverride 	= require("method-override"),
      middleware      = require("../middleware"),
      port       	 		= process.env.PORT || 3000,
      router          = express.Router();
      
const Campground      = require("../models/campground"),
      Campsite        = require("../models/campsite"),
      Comment         = require("../models/comment");

// axios has built in body parser.
// app.use(bodyParser.urlencoded({extended: true}));

axios.defaults.baseURL = 'https://ridb.recreation.gov/api/v1/';
axios.defaults.headers = {
  'Content-Type': 'application/json',
  'apikey': process.env.API,
}
// const url = "https://ridb.recreation.gov/api/v1/activities/"
// const url = '/recareas';

// ==========|  INDEX  |========== \\

router.get('/', async (req, res) => {
  try {
    const params = {query: "camping", limit: 50, sort: "Date"} // state: "CA", full: false,
    const response = await axios.get('/facilities', {params});
    console.log(response.status);
    const recData = response.data.RECDATA;
    const maps = recData.filter(item => (item.GEOJSON.COORDINATES));
    const mapData = maps.map(item => (
      {properties: {title: item.FacilityName}, geometry: item.GEOJSON, id: item.FacilityID}
    ));
    console.log(mapData);
    res.render("campsites/index", {recData, mapData});
  } catch (e) {
    console.log("oh no.", e)
  }
});

// ==========|   SEARCH  |========== \\

router.get('/search', async (req, res) => {
  try {
    console.log('QUERY: '+req.query);
    console.log('PARAMS: '+req.params);
    const search = req.query.search
    const state = req.query.state
    const activity = req.query.activities
    const limit = req.query.limit
    const searchParams = {query: search, activity, state, limit, sort: "Date", query: search}
    const response = await axios.get('/facilities', {params: searchParams});
    const recData = response.data.RECDATA;
    const maps = recData.filter(item => (item.GEOJSON.COORDINATES));
    const mapData = maps.map(item => (
      {properties: {title: item.FacilityName}, geometry: item.GEOJSON, id: item.FacilityID}));
    console.log(response.data.METADATA);
    // console.log(recData)
    res.render("campsites/index", {recData, mapData});
  } catch (e) {
    console.log("oh no.", e)
  }
});

// ==========|  SHOW  |========== \\

router.get("/show/:id", async (req, res) => {
    // ':id' can be accessed through req.param. use destructuring.
    try {
    const showParams = { full: true, }
    const { id } = req.params;
    console.log(id);
    const url = `/facilities/${id}`;
    const mediaURL = `/facilities/${id}/media`;
    const response = await axios.get(url, {showParams});
    const medias = await axios.get(mediaURL);
    const recData = response.data;
    mediaData = medias.data.RECDATA;
    data = {recData, mediaData}
    const newCampsite = {name: recData.FacilityName, id: id, geometry: recData.GEOJSON};
    // Campground.findbyid if no create, if yes populate
    Campsite.findOne({'id': id})
      .populate("comments")
      .exec((err, foundCampsite) => {
        if(err || !foundCampsite){
          console.log('creating' + id);
          Campsite.create(newCampsite, (err, foundCampsite) => {
            if(err){
            console.log(err);
            } else {
              console.log(foundCampsite.name);
              res.render("campsites/show", {data, foundCampsite});
            }
          }); 
        } else {
          console.log('found'+id);
          res.render("campsites/show", {data, foundCampsite});    
        }
      }); 
    } catch (e) {
      console.log("oh no.", e)
    }
});

// ==========|  404  |========== \\

router.use((req, res) => {
  // place after routes. if user doesn't select 
  // above routes this 404 route will run. 
  // console.log("request 404!!!")
  res.send("Go Back Home Lassie!")
})

module.exports = router
