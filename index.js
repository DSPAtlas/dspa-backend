import express from "express";
import morgan from "morgan";
import bodyParser from "body-parser";




const express = require('express');
const config = require('./config/config');
const router = express.Router();


// const cors = require('cors');

const app = express();

// MIDDLEWARE
// Preprocessing
app.use(bodyParser.urlencoded({ extended: true}));
// Logging
app.use(morgan("combined"))

// app.use(cors()); // Enable CORS for all routes

// Other middleware and configurations...

// Use API routes
//app.use('/api', apiRoutes);

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Express' });
});

router.get('/about', function(req, res, next) {
  res.render('index', { title: 'About' });
});


module.exports = router;

// Start the server
app.listen(config.server.port, () => {
  console.log(`Server is running on port ${config.server.port}`);
});