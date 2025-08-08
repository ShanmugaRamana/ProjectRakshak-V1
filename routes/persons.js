const express = require('express');
const router = express.Router();
const multer = require('multer');
const { ensureAuth } = require('../controllers/authController');
const personController = require('../controllers/personController');
const Person = require('../models/Person');
const Notification = require('../models/Notification'); // Import the new model
const axios = require('axios');

// Multer setup remains the same
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: function (req, file, cb) {
        const filetypes = /jpeg|jpg|png/;
        if (filetypes.test(file.mimetype)) { return cb(null, true); }
        cb(new Error('Error: File upload only supports ' + filetypes));
    }
}).array('images', 7);

// --- Existing Routes ---
router.get('/', personController.getHomePage);
router.get('/find-person', personController.getFindPersonForm);
router.post('/find-person', upload, personController.postFindPersonForm);
router.get('/dashboard', ensureAuth, personController.getDashboard);
router.get('/api/person/:id', ensureAuth, personController.getPersonDetails);

// --- New Route for the notifications page ---
router.get('/notifications', ensureAuth, personController.getNotificationsPage);

// --- Modified API Routes ---
router.post('/api/report_match', async (req, res) => {
    const { mongo_id, name, snapshot } = req.body;
    if (!mongo_id || !name || !snapshot) {
        return res.status(400).json({ message: 'Missing data in match report.' });
    }
    try {
        const newNotification = await Notification.create({
            personId: mongo_id,
            personName: name,
            snapshot: snapshot
        });
        console.log(`Notification for ${name} saved to database.`);
        req.io.emit('new_match_found', { 
            notificationId: newNotification._id,
            mongo_id, 
            name, 
            snapshot 
        });
        res.status(200).json({ message: 'Match received, saved, and broadcasted.' });
    } catch (err) {
        console.error("Error saving notification:", err);
        res.status(500).json({ message: 'Failed to save notification.' });
    }
});

router.post('/api/person/:id/action', ensureAuth, async (req, res) => {
    const { action } = req.body;
    const { id } = req.params;
    try {
        if (action === 'accept') {
            const person = await Person.findByIdAndUpdate(id, { status: 'Found' }, { new: true });
            if (!person) return res.status(404).json({ message: 'Person not found' });
            await axios.post(`${process.env.PYTHON_SERVICE_URL}/update_search_status`, { mongo_id: id, action: 'accept' });
            return res.status(200).json({ message: `Status for ${person.fullName} updated to Found.` });
        } 
        else if (action === 'research') {
            await axios.post(`${process.env.PYTHON_SERVICE_URL}/update_search_status`, { mongo_id: id, action: 'research' });
            return res.status(200).json({ message: 'Re-search initiated.' });
        }
        else {
            return res.status(400).json({ message: 'Invalid action.' });
        }
    } catch (err) {
        console.error("Error handling action:", err);
        res.status(500).json({ message: 'Server Error' });
    }
});

module.exports = router;