// --- Core Dependencies ---
const express = require('express');
const dotenv = require('dotenv');
const path = require('path');
const http = require('http');
const os = require('os'); // <-- NEW: To find the local IP address

// --- Middleware & Session ---
const session = require('express-session');
const MongoStore = require('connect-mongo');
const { Server } = require("socket.io");
const cors = require('cors');
// --- Project Imports ---
const connectDB = require('./config/db');

// --- Initial Setup ---
dotenv.config({ path: './.env' });
connectDB();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Allow all origins for simplicity in development
        methods: ["GET", "POST"]
    }
});

// --- Middleware Configuration ---

// 1. CORS Middleware: Allows requests from other origins (like your Python service)
app.use(cors());

// 2. Body Parser Middleware: To handle incoming request bodies
// NEW: Increased limit to handle Base64 image data from forms and Python
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));

// 3. EJS View Engine Setup
app.set('view engine', 'ejs');

// 4. Session Middleware: For dashboard user login
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGO_URI,
    collectionName: 'sessions',
  })
}));

// 5. Custom Middleware to make Socket.IO available to routes
app.use((req, res, next) => {
  req.io = io;
  next();
});

// 6. Custom Middleware to make session user available to templates
app.use(function (req, res, next) {
    res.locals.user = req.session.user;
    next();
});

// 7. Static Folder Setup: For CSS, client-side JS, and images
app.use(express.static(path.join(__dirname, 'public')));


// --- Socket.IO Connection Handler ---
io.on('connection', (socket) => {
  console.log('A client connected via Socket.IO');
  socket.on('disconnect', () => {
    console.log('A client disconnected from Socket.IO');
  });
});


// --- Route Definitions ---
app.use('/', require('./routes/persons'));
app.use('/auth', require('./routes/auth'));
app.use('/staff', require('./routes/staff'));
app.use('/staff-auth', require('./routes/staffAuth'));


// --- Server Startup ---
const PORT = process.env.PORT || 3000;

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running successfully on port ${PORT}`);
    
    // NEW: Dynamically find and log the local network IP address
    const interfaces = os.networkInterfaces();
    Object.keys(interfaces).forEach((ifname) => {
        interfaces[ifname].forEach((iface) => {
            if ('IPv4' !== iface.family || iface.internal !== false) {
                // Skip over internal (i.e. 127.0.0.1) and non-ipv4 addresses
                return;
            }
            console.log(`- Server accessible on your network at: http://${iface.address}:${PORT}`);
        });
    });
});