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

// @desc    Process Find Person form with full verification and embedding generation
// @route   POST /find-person
// @desc    Process Find Person form with full verification and embedding generation
// @route   POST /find-person
exports.postFindPersonForm = async (req, res) => {
    try {
        const files = req.files;

        if (!files || files.length < 3 || files.length > 7) {
             return res.status(400).render('find-person', { 
                title: 'Report a Lost Person',
                error: 'Please upload between 3 and 7 images.', 
                ...req.body 
            });
        }

        const formData = new FormData();
        files.forEach(file => {
            formData.append('images', file.buffer, file.originalname);
        });

        let embeddings = [];
        try {
            // This is now the ONLY API call. It verifies and gets embeddings at once.
            const apiResponse = await axios.post(`${process.env.PYTHON_SERVICE_URL}/verify_faceset`, formData, {
                headers: formData.getHeaders(),
            });

            if (apiResponse.data.success) {
                // If successful, we get the embeddings directly from the response.
                embeddings = apiResponse.data.embeddings;
            } else {
                // If it fails for any validation reason, show the specific error message from Python.
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
        
        // The second, redundant call to /generate_embeddings has been removed.
        
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
            embeddings: embeddings, // <-- Use the embeddings we just received
            isMinor, guardianType: isMinor ? guardianType : undefined, guardianDetails: isMinor ? guardianDetails : undefined,
            reporterName, reporterRelation, reporterContactNumber, status: 'Lost'
        };

        await Person.create(personData);
        console.log(`New person '${fullName}' saved to database with pre-calculated embeddings.`);

        res.redirect('/');

    } catch (err) {
        console.error("Error in postFindPersonForm:", err);
        if (err.name === 'ValidationError') {
             return res.status(400).render('find-person', { error: err.message, ...req.body });
        }
        res.status(500).render('find-person', { error: 'Something went wrong. Please try again.' });
    }
};

// @desc    Show Dashboard (Optimized for performance)
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

        // --- PERFORMANCE OPTIMIZATION ---
        // Project only the necessary fields for the list view.
        // Most importantly, only get the FIRST image for the thumbnail.
        const projection = {
            fullName: 1,
            age: 1,
            status: 1,
            images: { $slice: 1 } 
        };

        const persons = await Person.find(query, projection).sort(sortOption).lean();

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

// @desc    Get details for a single person (fetches all data)
// @route   GET /api/person/:id
exports.getPersonDetails = async (req, res) => {
     try {
        // For the detail view, we fetch all data (including all images)
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
            .populate({ path: 'personId', select: 'images' })
            .sort({ createdAt: -1 })
            .lean();

        const formattedNotifications = notifications.map(noti => {
            let displayImage = '/images/mp_police_logo.png';
            if (noti.personId && noti.personId.images && noti.personId.images.length > 0) {
                const firstImage = noti.personId.images[0];
                displayImage = `data:${firstImage.contentType};base64,${firstImage.data.toString('base64')}`;
            }
            return { ...noti, displayImage };
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