const express = require('express');
const dotenv = require('dotenv');
const path = require('path');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const connectDB = require('./config/db');

// Load config
dotenv.config({ path: './.env' });

// Connect to Database
connectDB();

const app = express();

// Body Parser Middleware
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// EJS View Engine
app.set('view engine', 'ejs');

// Session Middleware
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGO_URI,  // MongoDB connection URL (make sure it's in your .env file)
    collectionName: 'sessions',  // Optional: Change the session collection name
  })
}));

// Set global variable for session
app.use(function (req, res, next) {
    res.locals.user = req.session.user;
    next();
});

// Static Folder
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/', require('./routes/persons'));
app.use('/auth', require('./routes/auth'));


const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Visit http://localhost:${PORT}`);
});