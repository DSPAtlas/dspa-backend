
const express = require('express');
const config = require('./config/config');
const router = express.Router();
// const cors = require('cors');

const app = express();

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