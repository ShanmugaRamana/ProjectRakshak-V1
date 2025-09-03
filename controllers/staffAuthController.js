const Staff = require('../models/Staff');
const bcrypt = require('bcryptjs');

// @desc    Login for staff members with detailed terminal logging
// @route   POST /staff-auth/login
exports.loginStaff = async (req, res) => {
    const { phoneNumber, password } = req.body;
    const timestamp = new Date().toLocaleString();

    // Log the initial attempt
    console.log(`[${timestamp}] [LOGIN_ATTEMPT] Received login request for phone number: ${phoneNumber}`);

    try {
        if (!phoneNumber || !password) {
            // This is a client-side validation error, but we log it just in case.
            console.warn(`[${timestamp}] [AUTH_FAIL] Login failed: Missing phone number or password in request.`);
            return res.status(400).json({ success: false, message: 'Please provide a Phone Number and password' });
        }

        const staff = await Staff.findOne({ phoneNumber }).select('+password');

        // Case 1: Staff member not found in the database
        if (!staff) {
            console.warn(`[${timestamp}] [AUTH_FAIL] Reason: Phone number '${phoneNumber}' not found in database.`);
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        // Case 2: Staff found, but password does not match
        const isMatch = await bcrypt.compare(password, staff.password);
        if (!isMatch) {
            console.warn(`[${timestamp}] [AUTH_FAIL] Reason: Incorrect password for staff member '${staff.fullName}' (ID: ${staff.staffId}).`);
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        // Case 3: Login successful
        console.log(`[${timestamp}] [AUTH_SUCCESS] Staff member '${staff.fullName}' (ID: ${staff.staffId}) logged in successfully.`);

        // Send success response to the app
        res.status(200).json({
            success: true,
            message: 'Login successful'
        });

    } catch (err) {
        // Case 4: A server-side error occurred
        console.error(`[${timestamp}] [SERVER_ERROR] An unexpected error occurred during login for phone number '${phoneNumber}':`, err);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};