const express = require('express');
const router = express.Router();
const multer = require('multer');
const { ensureAuth } = require('../controllers/authController'); // Middleware to protect routes
const personController = require('../controllers/personController');

// Multer setup for image uploads (stores in memory as Buffer)
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB limit per image
    fileFilter: function (req, file, cb) {
        const filetypes = /jpeg|jpg|png/;
        const mimetype = filetypes.test(file.mimetype);
        if (mimetype) {
            return cb(null, true);
        }
        cb(new Error('Error: File upload only supports the following filetypes - ' + filetypes));
    }
}).array('images', 7); // 'images' is the field name, max 7 files

// @desc    Show Home page
// @route   GET /
router.get('/', personController.getHomePage);

// @desc    Show Find Person form
// @route   GET /find-person
router.get('/find-person', personController.getFindPersonForm);

// @desc    Process Find Person form
// @route   POST /find-person
router.post('/find-person', upload, personController.postFindPersonForm);

// @desc    Show Dashboard
// @route   GET /dashboard
router.get('/dashboard', ensureAuth, personController.getDashboard);

// @desc    Get a single person's details for the dashboard
// @route   GET /api/person/:id
router.get('/api/person/:id', ensureAuth, personController.getPersonDetails);


module.exports = router;