require('dotenv').config();
const express = require('express');
const axios = require('axios').default;
const router = express.Router();
const ExpressError = require('../utils/ExpressError');

const Campsite = require('../models/campsite');
const User = require('../models/user');

axios.defaults.baseURL = 'https://ridb.recreation.gov/api/v1/';
axios.defaults.headers = {
  'Content-Type': 'application/json',
  apikey: process.env.API,
  // 'Access-Control-Allow-Origin' : '*',
  // 'Access-Control-Allow-Methods' : 'GET, PUT, POST, DELETE, OPTIONS',
};

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
    const filterGEO = data.filter(item => item.GEOJSON.COORDINATES);
    const recData = filterGEO;
    const mapData = filterGEO.map(item => ({
      properties: {
        title: item.FacilityName,
        type: item.FacilityTypeDescription,
      },
      geometry: item.GEOJSON,
      id: item.FacilityID,
    }));
    console.log(recData.length);
    res.render('campsites/index', { recData, mapData, mapBox: true });
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
    // filter out items without GEOJSON
    const recData = data.filter(item => item.GEOJSON.COORDINATES);
    const mapData = recData.map(item => ({
      properties: {
        title: item.FacilityName,
        type: item.FacilityTypeDescription,
      },
      geometry: item.GEOJSON,
      id: item.FacilityID,
    }));
    console.log(response.data.METADATA);
    // console.log(recData)
    res.render('campsites/results', { recData, mapData, searchParams, mapBox: true });
  } catch (e) {
    console.log('oh no.', e);
  }
});

// ==========|  SHOW  |========== \\

router.get('/show/:id', async (req, res) => {
  try {
    const showParams = { full: true };
    const { id } = req.params;
    console.log('show facility id#' + id);
    const url = `/facilities/${id}`;
    const response = await axios.get(url, { showParams });
    const medias = await axios.get(`${url}/media`);
    const links = await axios.get(`${url}/links`);
    const recData = response.data;
    const linksData = links.data.RECDATA;
    const mediaData = medias.data.RECDATA;
    const parentRecAreaID = recData.ParentRecAreaID;
    console.log('parent RecArea ID#' + parentRecAreaID);
    const parentRecAreaResponse = await axios.get(`/recareas/${parentRecAreaID}`);
    const parentRecArea = parentRecAreaResponse.data;
    console.log('Parent RecArea Name' + parentRecArea);
    const data = { recData, mediaData, parentRecArea, linksData };
    const newCampsite = {
      name: recData.FacilityName,
      id: id,
      geometry: recData.GEOJSON,
    };
    // Campground.findbyid if no create, if yes populate
    const foundCampsite = await Campsite.findOne({ id: id }).populate('comments').exec();
    if (!foundCampsite) {
      console.log('creating' + id);
      const madeCampsite = await Campsite.create(newCampsite);
      if (!madeCampsite) {
        console.log('err: ', madeCampsite);
      } else {
        console.log(madeCampsite);
        res.render('campsites/show', { data, foundCampsite: madeCampsite, favorite: false });
      }
    } else {
      if(req.isAuthenticated()){
        const user = req.user;
        console.log(`Show Route: logged in: ${user._id}:`);
        const foundUser = await User.findById(user._id).populate('favorites').exec();
        console.log('foundCampsite._id: ', foundCampsite._id);
        let favorites = false;
        for(fav of foundUser.favorites){
          if(fav._id.toString() === foundCampsite._id.toString()){
            console.log("match: ", fav._id);
            favorites = true;
          }
        }
        if(favorites){
          console.log('ALREADY added to favorites by: ', foundUser.username);
          return res.render('campsites/show', { data, foundCampsite, favorite: true });
        }
      }
      // console.log("not favorite");
      console.log('found campsite: ' + id);
      res.render('campsites/show', { data, foundCampsite, favorite: false  });
    }
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
