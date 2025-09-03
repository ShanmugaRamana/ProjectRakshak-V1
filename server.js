const express = require('express');
const dotenv = require('dotenv');
const path = require('path');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const connectDB = require('./config/db');
const http = require('http');
const { Server } = require("socket.io");

// Load config
dotenv.config({ path: './.env' });

// Connect to Database
connectDB();

const app = express();
const server = http.createServer(app);
const io = new Server(server);


// --- THIS IS THE CRITICAL SECTION ---
// Body Parser Middleware to handle JSON and URL-encoded data.
// These lines MUST come BEFORE your routes are defined.
app.use(express.json());
app.use(express.urlencoded({ extended: false }));


// EJS View Engine
app.set('view engine', 'ejs');

// Session Middleware
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGO_URI,
    collectionName: 'sessions',
  })
}));

// Socket.IO Connection Handler
io.on('connection', (socket) => {
  console.log('Dashboard user connected via Socket.IO');
  socket.on('disconnect', () => {
    console.log('Dashboard user disconnected');
  });
});

// Make `io` accessible to all routes
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Set global variable for session
app.use(function (req, res, next) {
    res.locals.user = req.session.user;
    next();
});

// Static Folder
app.use(express.static(path.join(__dirname, 'public')));

// Routes (defined AFTER the body-parser middleware)
app.use('/', require('./routes/persons'));
app.use('/auth', require('./routes/auth'));
app.use('/staff', require('./routes/staff')); // <-- ADD THIS LINE
app.use('/staff-auth', require('./routes/staffAuth')); // <-- ADD THIS LINE



const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Visit http://localhost:${PORT}`);
});