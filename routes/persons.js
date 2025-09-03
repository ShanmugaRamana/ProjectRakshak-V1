const express = require('express');
const router = express.Router();
const multer = require('multer');
const { ensureAuth } = require('../controllers/authController');
const personController = require('../controllers/personController');
const Person = require('../models/Person');
const Notification = require('../models/Notification'); 
const axios = require('axios');

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

router.get('/', personController.getHomePage);
router.get('/find-person', personController.getFindPersonForm);
router.post('/find-person', upload, personController.postFindPersonForm);
router.get('/dashboard', ensureAuth, personController.getDashboard);
router.get('/api/person/:id', ensureAuth, personController.getPersonDetails);

router.get('/notifications', ensureAuth, personController.getNotificationsPage);

// In routes/persons.js
router.get('/api/app/person/:id', async (req, res) => { // <-- ensureAuth has been removed from this line
    try {
        const person = await Person.findById(req.params.id).lean();
        if (!person) {
            return res.status(404).json({ message: 'Person not found' });
        }
        res.status(200).json(person);
    } catch (err) {
        console.error("Error fetching person details for app:", err);
        res.status(500).json({ message: "Server Error" });
    }
});
// @desc    Receive match report, save notification, and forward to clients
// @route   POST /api/report_match
router.post('/api/report_match', async (req, res) => {
    // NEW: Log the incoming request body to see exactly what Python is sending
    console.log("Received match report with body:", req.body);

    const { mongo_id, name, snapshot, camera_name } = req.body;
    
    // NEW: More specific validation to pinpoint the problem
    if (!mongo_id) {
        return res.status(400).json({ message: 'Bad Request: Missing required field [mongo_id]' });
    }
    if (!name) {
        return res.status(400).json({ message: 'Bad Request: Missing required field [name]' });
    }
    if (!snapshot) {
        return res.status(400).json({ message: 'Bad Request: Missing required field [snapshot]' });
    }

    try {
        const newNotification = await Notification.create({
            personId: mongo_id,
            personName: name,
            snapshot: snapshot,
            cameraName: camera_name || 'N/A' // Use a fallback if camera_name is missing
        });
        console.log(`Notification for ${name} saved to database.`);

        

        res.status(200).json({ message: 'Match received, saved, and broadcasted.' });
    } catch (err) {
        console.error("Error saving notification:", err);
        res.status(500).json({ message: 'Failed to save notification.' });
    }
});
router.get('/api/persons/found', async (req, res) => { // <-- ensureAuth is correctly removed here
    try {
        const foundPersons = await Person.find({ status: 'Found' })
            .sort({ createdAt: -1 })
            .lean();
        res.status(200).json(foundPersons);
    } catch (err) {
        console.error("Error fetching found persons:", err);
        res.status(500).json({ message: "Server Error" });
    }
});
router.post('/api/person/:id/action', ensureAuth, async (req, res) => {
    const { action, notificationId } = req.body;
    const { id } = req.params;

    try {
        if (action === 'accept') {
            // 1. Find the notification to get the snapshot and camera data
            const notification = await Notification.findById(notificationId);
            if (!notification) {
                return res.status(404).json({ message: 'Associated notification not found.' });
            }

            // 2. THIS IS THE FIX: Update the person's status AND add the found details
            const person = await Person.findByIdAndUpdate(id, {
                status: 'Found',
                foundSnapshot: notification.snapshot,
                foundOnCamera: notification.cameraName
            }, { new: true });
            console.log(`[DB_UPDATE] Saved found-details for '${person.fullName}'. Snapshot from '${person.foundOnCamera}' stored in Person DB.`);

            if (!person) return res.status(404).json({ message: 'Person not found' });
            
            // 3. Tell Python service to stop searching
            await axios.post(`${process.env.PYTHON_SERVICE_URL}/update_search_status`, { mongo_id: id, action: 'accept' });
            
            // 4. Broadcast the event to the mobile app
            req.io.emit('person_found', {
                _id: notification.personId,
                name: notification.personName,
                snapshot: notification.snapshot,
                cameraName: notification.cameraName,
            });

            // 5. Delete the temporary notification
            await Notification.findByIdAndDelete(notificationId);
            
            return res.status(200).json({ message: `Status for ${person.fullName} updated to Found.` });
        } 
        else if (action === 'research') {
            // The re-search logic is simpler and doesn't need to save data
            await axios.post(`${process.env.PYTHON_SERVICE_URL}/update_search_status`, { mongo_id: id, action: 'research' });
            if (notificationId) {
                await Notification.findByIdAndDelete(notificationId);
            }
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