const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// @desc    Show login page
// @route   GET /auth/login
router.get('/login', authController.getLogin);

// @desc    Process login form
// @route   POST /auth/login
router.post('/login', authController.postLogin);

// @desc    Logout user
// @route   GET /auth/logout
router.get('/logout', authController.logout);

module.exports = router;