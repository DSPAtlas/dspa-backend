import express from 'express';
import morgan from 'morgan';
import bodyParser from 'body-parser';
import pg from 'pg';
//const morgan = require('morgan');
//const pg = require('pg');
//const bodyParser = require('body-parser');
//const express = require('express');

import * as config from './config/config.js'

//const config = require('./config/config');
const router = express.Router();

// get database
const db = pg.Client({
  user: config.database.user,
  host: config.database.host,
  database: config.database.database,
  password: config.database.password,
  port: config.database.port,
})

// connect to databse
db.connect();

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

// GET home page
app.get("/", async (req, res) => {
  totalCorrect = 0;
  await nextQuestion();
  console.log(currentQuestion);
  res.render("index.ejs", { question: currentQuestion });
});

// POST a new post
app.post("/submit", (req, res) => {
  let answer = req.body.answer.trim();
  let isCorrect = false;
  if (currentQuestion.capital.toLowerCase() === answer.toLowerCase()) {
    totalCorrect++;
    console.log(totalCorrect);
    isCorrect = true;
  }

  nextQuestion();
  res.render("index.ejs", {
    question: currentQuestion,
    wasCorrect: isCorrect,
    totalScore: totalCorrect,
  });
});

async function nextQuestion() {
  const randomCountry = quiz[Math.floor(Math.random() * quiz.length)];
  currentQuestion = randomCountry;
}

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
