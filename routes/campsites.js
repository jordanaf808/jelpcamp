// const { response } = require('express');
require('dotenv').config();
const express = require('express'),
  app = express(),
  axios = require('axios').default,
  bodyParser = require('body-parser'),
  methodOverride = require('method-override'),
  middleware = require('../middleware'),
  port = process.env.PORT || 3000,
  router = express.Router();

const Campground = require('../models/campground'),
  Campsite = require('../models/campsite'),
  Comment = require('../models/comment');

// axios has built in body parser.
// app.use(bodyParser.urlencoded({extended: true}));

axios.defaults.baseURL = 'https://ridb.recreation.gov/api/v1/';
axios.defaults.headers = {
  'Content-Type': 'application/json',
  apikey: process.env.API,
  // 'Access-Control-Allow-Origin' : '*',
  // 'Access-Control-Allow-Methods' : 'GET, PUT, POST, DELETE, OPTIONS',
};
// const url = '/recareas';

// ==========|  INDEX  |========== \\

// *** Try to save the response to Local Storage
// *** Try to use campsite data in mongoDB to populate the homepage map and maybe cards... maybe need description data not in mongoDB.

router.get('/', async (req, res) => {
  try {
    const params = { query: 'hiking', limit: 25, full: 'false', sort: 'Date' }; // state: "CA"
    const response = await axios.get('/facilities', { params });
    console.log('initial response status: ' + response.status);
    const data = response.data.RECDATA;
    // filter out any data withOUT GEOJSON
    const maps = data.filter(item => item.GEOJSON.COORDINATES);
    const recData = maps;
    const mapData = maps.map(item => ({
      properties: {
        title: item.FacilityName,
        type: item.FacilityTypeDescription,
      },
      geometry: item.GEOJSON,
      id: item.FacilityID,
    }));
    // console.log(recData);
    res.render('campsites/index', { recData, mapData });
  } catch (e) {
    console.log('oh no.', e);
  }
});

// ==========|   SEARCH  |========== \\

router.get('/search', async (req, res) => {
  try {
    console.log('QUERY: ' + req.query);
    console.log('PARAMS: ' + req.params);
    const search = req.query.search;
    const state = req.query.state;
    const activity = req.query.activities;
    const limit = req.query.limit;
    const searchParams = {
      query: search,
      activity,
      state,
      limit,
      sort: 'Date',
    };
    const response = await axios.get('/facilities', { params: searchParams });
    const data = response.data.RECDATA;
    const maps = data.filter(item => item.GEOJSON.COORDINATES);
    const recData = maps;
    const mapData = maps.map(item => ({
      properties: {
        title: item.FacilityName,
        type: item.FacilityTypeDescription,
      },
      geometry: item.GEOJSON,
      id: item.FacilityID,
    }));
    console.log(response.data.METADATA);
    // console.log(recData)
    res.render('campsites/results', { recData, mapData, searchParams });
  } catch (e) {
    console.log('oh no.', e);
  }
});

// ==========|  SHOW  |========== \\

router.get('/show/:id', async (req, res) => {
  // ':id' can be accessed through req.param. use destructuring.
  try {
    const showParams = { full: true };
    const { id } = req.params;
    console.log('show facility id#' + id);
    const url = `/facilities/${id}`;
    const mediaURL = `${url}/media`;
    const linkURL = `${url}/links`;
    const response = await axios.get(url, { showParams });
    const medias = await axios.get(mediaURL);
    const links = await axios.get(linkURL);
    const recData = response.data;
    const linksData = links.data.RECDATA;
    const mediaData = medias.data.RECDATA;
    const parentRecAreaID = recData.ParentRecAreaID;
    console.log('parent RecArea ID#' + parentRecAreaID);
    const parentRecAreaURL = `/recareas/${parentRecAreaID}`;
    const parentRecAreaResponse = await axios.get(parentRecAreaURL);
    const parentRecArea = parentRecAreaResponse.data;
    console.log('Parent RecArea Name' + parentRecArea);
    const data = { recData, mediaData, parentRecArea, linksData };
    const newCampsite = {
      name: recData.FacilityName,
      id: id,
      geometry: recData.GEOJSON,
    };
    // Campground.findbyid if no create, if yes populate
    // Can I put this in a TRY/CATCH ??? is this Promise-based already?
    Campsite.findOne({ id: id })
      .populate('comments')
      .exec((err, foundCampsite) => {
        if (err || !foundCampsite) {
          console.log('creating' + id);
          Campsite.create(newCampsite, (err, foundCampsite) => {
            if (err) {
              console.log(err);
            } else {
              console.log(foundCampsite.name);
              res.render('campsites/show', { data, foundCampsite });
            }
          });
        } else {
          console.log('found' + id);
          res.render('campsites/show', { data, foundCampsite });
        }
      });
  } catch (e) {
    console.log('oh no.', e);
  }
});

// ==========|  404  |========== \\

router.use((req, res) => {
  // place after routes. if user doesn't select
  // above routes this 404 route will run.
  // console.log("request 404!!!")
  res.send('Go Back Home Lassie!');
});

module.exports = router;
