const express = require('express');
const dotenv = require('dotenv');
const path = require('path');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const connectDB = require('./config/db');
const http = require('http'); // Add this
const { Server } = require("socket.io"); // Add this

// Load config
// Ensure that the .env file is loaded before accessing process.env variables
dotenv.config({ path: './.env' });

// Connect to Database
connectDB();

const app = express();
const server = http.createServer(app); // Create HTTP server from Express app
const io = new Server(server); // Attach Socket.IO to the server

// Body Parser Middleware
app.use(express.urlencoded({ extended: false })); // Parse URL-encoded bodies
app.use(express.json());

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

// Make `io` accessible to all routes via the request object
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

// Routes
app.use('/', require('./routes/persons'));
app.use('/auth', require('./routes/auth'));

const PORT = process.env.PORT || 3000;

// Use `server.listen` instead of `app.listen` to accommodate Socket.IO
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Visit http://localhost:${PORT}`);
});