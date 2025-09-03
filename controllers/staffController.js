const Staff = require('../models/Staff');

// @desc    Process the add staff form
// @route   POST /staff/add
exports.addStaff = async (req, res) => {
    try {
        const staffData = { ...req.body, role: 'Ground Staff' };
        
        // Updated: Check if staffId or phoneNumber already exists
        const existingStaff = await Staff.findOne({ 
            $or: [{ phoneNumber: staffData.phoneNumber }, { staffId: staffData.staffId }] 
        });

        if (existingStaff) {
            return res.status(400).send('Error: A staff member with that Phone Number or Staff ID already exists.');
        }
        
        await Staff.create(staffData);
        res.redirect('/dashboard#staff-management');

    } catch (err) {
        console.error('Error adding staff member:', err);
        res.status(500).send('Server Error');
    }
};