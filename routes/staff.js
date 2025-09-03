const express = require('express');
const router = express.Router();
const { ensureAuth } = require('../controllers/authController');
const staffController = require('../controllers/staffController');

// Route to handle the form submission for adding new staff
router.post('/add', ensureAuth, staffController.addStaff);

module.exports = router;