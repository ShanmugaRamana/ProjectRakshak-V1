const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const StaffSchema = new mongoose.Schema({
    fullName: {
        type: String,
        required: [true, 'Please provide a full name'],
        trim: true,
    },
    staffId: {
        type: String,
        required: [true, 'Please provide a unique staff ID'],
        unique: true,
        trim: true,
    },
    // The email field has been removed.
    password: {
        type: String,
        required: [true, 'Please provide a password'],
        minlength: 6,
        select: false, 
    },
    role: {
        type: String,
        enum: ['Security', 'Medical', 'Volunteer', 'Admin', 'Ground Staff'],
        default: 'Ground Staff',
    },
    phoneNumber: {
        type: String,
        required: [true, 'Please provide a phone number'],
        unique: true, // Making phone number unique as it's a primary contact
    },
    assignedZone: {
        type: String,
        default: 'General',
    },
    isActive: {
        type: Boolean,
        default: true,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

// Encrypt password using bcrypt before saving
StaffSchema.pre('save', async function (next) {
    if (!this.isModified('password')) {
        return next();
    }
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});

module.exports = mongoose.model('Staff', StaffSchema);