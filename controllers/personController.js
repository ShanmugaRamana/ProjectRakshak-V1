const Person = require('../models/Person');

exports.getHomePage = (req, res) => {
    res.render('home', { title: 'Rakshak - Home' });
};

exports.getFindPersonForm = (req, res) => {
    res.render('find-person', { title: 'Report a Lost Person' });
};

exports.postFindPersonForm = async (req, res) => {
    try {
        if (!req.files || req.files.length < 3) {
             return res.status(400).render('find-person', { error: 'Please upload at least 3 images.', title: 'Report a Lost Person', ...req.body });
        }

        // Destructure new fields from req.body
        const {
            fullName, age, personContactNumber, lastSeenLocation, lastSeenTime,
            identificationDetails, guardianType, guardianDetails,
            reporterName, reporterRelation, reporterContactNumber 
        } = req.body;

        const parsedAge = parseInt(age);
        const isMinor = parsedAge < 18;

        if (!isMinor && !personContactNumber) {
            return res.status(400).render('find-person', { error: 'The lost person\'s contact number is required for adults.', title: 'Report a Lost Person', ...req.body });
        }

        // Use new fields in the data object
        const personData = {
            fullName,
            age: parsedAge,
            personContactNumber: isMinor ? undefined : personContactNumber,
            lastSeenLocation,
            lastSeenTime,
            identificationDetails,
            images: req.files.map(file => ({
                data: file.buffer,
                contentType: file.mimetype
            })),
            isMinor,
            guardianType: isMinor ? guardianType : undefined,
            guardianDetails: isMinor ? guardianDetails : undefined,
            reporterName, 
            reporterRelation,
            reporterContactNumber
        };

        await Person.create(personData);
        res.redirect('/');

    } catch (err) {
        console.error(err);
        if (err.name === 'ValidationError') {
             return res.status(400).render('find-person', { error: err.message, title: 'Report a Lost Person', ...req.body });
        }
        res.status(500).render('find-person', { error: 'Something went wrong. Please try again.', title: 'Report a Lost Person' });
    }
};

exports.getDashboard = async (req, res) => {
    try {
        const sortQuery = req.query.sort || 'newest';
        const searchQuery = req.query.search || '';
        
        let query = {};
        if(searchQuery) {
            query.$or = [
                { fullName: { $regex: searchQuery, $options: 'i' } },
                { lastSeenLocation: { $regex: searchQuery, $options: 'i' } }
            ];
        }

        let sortOption = {};
        if (sortQuery === 'newest') sortOption.createdAt = -1;
        if (sortQuery === 'oldest') sortOption.createdAt = 1;
        if (sortQuery === 'age_asc') sortOption.age = 1;
        if (sortQuery === 'age_desc') sortOption.age = -1;

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
            search: searchQuery
        });

    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

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
}