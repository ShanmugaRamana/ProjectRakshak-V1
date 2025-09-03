const mongoose = require('mongoose');

const PersonSchema = new mongoose.Schema({
    // --- Section 1: Lost Person Details ---
    fullName: {
        type: String,
        required: true,
        trim: true,
    },
    age: {
        type: Number,
        required: true,
    },
    personContactNumber: {
        type: String,
        trim: true,
        required: function() { return this.age >= 18; }
    },
    lastSeenLocation: {
        type: String,
        required: true,
    },
    lastSeenTime: {
        type: Date,
        required: true,
    },
    identificationDetails: {
        type: String,
        required: true,
    },
    images: [{
        data: Buffer,
        contentType: String
    }],

    // --- Guardian Details (Conditional) ---
    isMinor: {
        type: Boolean,
        required: true,
    },
    guardianType: {
        type: String,
        required: function() { return this.isMinor; }
    },
    guardianDetails: {
        type: String,
        required: function() { return this.isMinor; }
    },

    // --- Section 2: Reporter's Details (UPDATED) ---
    reporterName: { // New field for reporter's name
        type: String,
        required: true,
        trim: true,
    },
    reporterRelation: { // New field for reporter's relation
        type: String,
        required: true,
    },
    reporterContactNumber: {
        type: String,
        required: true,
    },

    // --- System Fields ---
    status: {
        type: String,
        default: 'Lost',
        enum: ['Lost', 'Found'],
    },
    foundSnapshot: {
        type: String, // Will store the Base64 image string
    },
    foundOnCamera: {
        type: String,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
    
});

module.exports = mongoose.model('Person', PersonSchema);