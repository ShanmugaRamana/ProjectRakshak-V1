const mongoose = require('mongoose');
const User = require('../models/User');
const bcrypt = require('bcryptjs');

// Create admin user on first run if it doesn't exist
const createAdminUser = async () => {
    try {
        const adminExists = await User.findOne({ username: process.env.ADMIN_USERNAME });
        if (!adminExists) {
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(process.env.ADMIN_PASSWORD, salt);
            await User.create({
                username: process.env.ADMIN_USERNAME,
                password: hashedPassword,
            });
            console.log('Admin user created.');
        }
    } catch (err) {
        console.error('Error creating admin user:', err);
    }
};
createAdminUser();


exports.getLogin = (req, res) => {
    res.render('login', { title: 'Login' });
};

exports.postLogin = async (req, res) => {
    const { username, password } = req.body;
    try {
        const user = await User.findOne({ username: username });
        if (!user) {
            return res.status(400).render('login', { error: 'Invalid credentials', title: 'Login' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).render('login', { error: 'Invalid credentials', title: 'Login' });
        }

        req.session.user = { id: user._id, username: user.username };
        res.redirect('/dashboard');

    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

exports.logout = (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.redirect('/dashboard');
        }
        res.clearCookie('connect.sid');
        res.redirect('/');
    });
};

// Middleware to ensure a user is authenticated
exports.ensureAuth = (req, res, next) => {
    if (req.session.user) {
        return next();
    } else {
        res.redirect('/auth/login');
    }
};