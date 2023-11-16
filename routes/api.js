const express = require('express');
const router = express.Router();

// Define API routes
router.get('/api/data', (req, res) => {
  // Retrieve data from the database or another source
  const data = { message: 'Hello from the backend!' };
  res.json(data);
});

module.exports = router;


const express = require('express');
const bodyParser = require('body-parser');
const app = express();
const port = 3000;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Define a route to handle the search request
app.post('/api/search', (req, res) => {
  const searchTerm = req.body.searchTerm;
  // Use the search term to query the database
  // Send the search results as a response
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});