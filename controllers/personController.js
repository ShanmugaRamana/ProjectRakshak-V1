const Person = require('../models/Person');
const axios = require('axios');
const FormData = require('form-data');
const Notification = require('../models/Notification');

// @desc    Show Home page
// @route   GET /
exports.getHomePage = (req, res) => {
    res.render('home', { title: 'Rakshak - Home' });
};

// @desc    Show Find Person form
// @route   GET /find-person
exports.getFindPersonForm = (req, res) => {
    res.render('find-person', { 
        title: 'Report a Lost Person',
        fullName: '', age: '', personContactNumber: '', guardianType: '', guardianDetails: '',
        lastSeenLocation: '', lastSeenTime: '', identificationDetails: '',
        reporterName: '', reporterRelation: '', reporterContactNumber: ''
    });
};

// @desc    Process Find Person form, validate image set, save to DB, and trigger refresh
// @route   POST /find-person
exports.postFindPersonForm = async (req, res) => {
    try {
        const files = req.files;

        // 1. Basic image count validation
        if (!files || files.length < 3 || files.length > 7) {
             return res.status(400).render('find-person', { 
                title: 'Report a Lost Person',
                error: 'Please upload between 3 and 7 images.', 
                ...req.body 
            });
        }

        // 2. Send ALL images to the new Python endpoint for verification
        const formData = new FormData();
        files.forEach(file => {
            // Use 'images' as the field name, matching the Python script
            formData.append('images', file.buffer, file.originalname);
        });

        try {
            const apiResponse = await axios.post(`${process.env.PYTHON_SERVICE_URL}/verify_faceset`, formData, {
                headers: formData.getHeaders(),
            });

            // If the Python service says verification failed, show the detailed error
            if (!apiResponse.data.success) {
                return res.status(400).render('find-person', {
                    title: 'Report a Lost Person',
                    error: apiResponse.data.message, 
                    ...req.body
                });
            }
        } catch (error) {
            console.error("Error calling Python verification service:", error.message);
            return res.status(500).render('find-person', {
                title: 'Report a Lost Person',
                error: 'The face verification service is unavailable. Please try again later.', 
                ...req.body
            });
        }
        
        // 3. If verification is successful, proceed to save data
        console.log("All images validated successfully: Each has one face, and all faces match.");
        
        const { fullName, age, personContactNumber, lastSeenLocation, lastSeenTime,
            identificationDetails, guardianType, guardianDetails,
            reporterName, reporterRelation, reporterContactNumber 
        } = req.body;

        const parsedAge = parseInt(age);
        const isMinor = parsedAge < 18;

        if (!isMinor && !personContactNumber) {
            return res.status(400).render('find-person', { error: 'Lost person\'s contact number is required for adults.', ...req.body });
        }

        const personData = {
            fullName, age: parsedAge, personContactNumber: isMinor ? undefined : personContactNumber,
            lastSeenLocation, lastSeenTime, identificationDetails,
            images: req.files.map(file => ({ data: file.buffer, contentType: file.mimetype })),
            isMinor, guardianType: isMinor ? guardianType : undefined, guardianDetails: isMinor ? guardianDetails : undefined,
            reporterName, reporterRelation, reporterContactNumber, status: 'Lost'
        };

        await Person.create(personData);
        console.log(`New person '${fullName}' saved to database.`);

        // 4. Trigger the Python service to refresh its face index
        try {
            await axios.post(`${process.env.PYTHON_SERVICE_URL}/refresh_index`);
            console.log('Successfully requested Python service to refresh its face index.');
        } catch (err) {
            console.error('Could not trigger face index refresh on Python service:', err.message);
        }

        // 5. Redirect on success
        res.redirect('/');

    } catch (err) {
        console.error(err);
        if (err.name === 'ValidationError') {
             return res.status(400).render('find-person', { error: err.message, ...req.body });
        }
        res.status(500).render('find-person', { error: 'Something went wrong. Please try again.' });
    }
};

// @desc    Show Dashboard with filters for status, search, and sort
// @route   GET /dashboard
exports.getDashboard = async (req, res) => {
    try {
        const sortQuery = req.query.sort || 'newest';
        const searchQuery = req.query.search || '';
        const statusFilter = req.query.statusFilter || 'Lost';

        let query = {};
        if (statusFilter === 'Lost' || statusFilter === 'Found') {
            query.status = statusFilter;
        }

        if(searchQuery) {
            query.$or = [
                { fullName: { $regex: searchQuery, $options: 'i' } },
                { lastSeenLocation: { $regex: searchQuery, $options: 'i' } }
            ];
        }

        let sortOption = {};
        if (sortQuery === 'newest') sortOption.createdAt = -1;
        if (sortQuery === 'oldest') sortOption.createdAt = 1;

        const persons = await Person.find(query).sort(sortOption).lean();

        persons.forEach(person => {
            if (person.images && person.images.length > 0) {
                const firstImage = person.images[0];
                person.displayImage = `data:${firstImage.contentType};base64,${firstImage.data.toString('base64')}`;
            }
        });

        res.render('dashboard', {
            title: 'Dashboard',
            persons: persons,
            sort: sortQuery,
            search: searchQuery,
            statusFilter: statusFilter
        });

    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

// @desc    Get details for a single person
// @route   GET /api/person/:id
exports.getPersonDetails = async (req, res) => {
     try {
        const person = await Person.findById(req.params.id).lean();
        if (!person) {
            return res.status(404).json({ message: 'Person not found' });
        }
        person.imageList = person.images.map(img => `data:${img.contentType};base64,${img.data.toString('base64')}`);
        person.lastSeenTimeFormatted = new Date(person.lastSeenTime).toLocaleString();
        person.createdAtFormatted = new Date(person.createdAt).toLocaleString();
        delete person.images;
        res.json(person);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Show the dedicated notifications page
// @route   GET /notifications
exports.getNotificationsPage = async (req, res) => {
    try {
        const notifications = await Notification.find({})
            .populate({
                path: 'personId',
                select: 'images'
            })
            .sort({ createdAt: -1 })
            .lean();

        const formattedNotifications = notifications.map(noti => {
            let displayImage = '/images/mp_police_logo.png'; // Fallback image
            if (noti.personId && noti.personId.images && noti.personId.images.length > 0) {
                const firstImage = noti.personId.images[0];
                displayImage = `data:${firstImage.contentType};base64,${firstImage.data.toString('base64')}`;
            }
            return {
                ...noti,
                displayImage
            };
        });

        res.render('notifications', {
            title: 'Notifications',
            notifications: formattedNotifications
        });
    } catch (err) {
        console.error('Error fetching notifications:', err);
        res.status(500).send('Server Error');
    }
};