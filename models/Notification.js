const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
    personId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Person',
        required: true
    },
    personName: {
        type: String,
        required: true
    },
    snapshot: {
        type: String, // Base64 image string from the camera
        required: true
    },
    isRead: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Notification', NotificationSchema);