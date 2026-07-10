const Destination = require("../models/Destination");


const createDestination = async (req, res) => {
    try {
        const {
            name,
            province,
            category,
            shortDescription,
            description,
            imageUrl,
            bestFor,
            isPopular,
            status,
        } = req.body;

        if (!name || !province || !shortDescription || !description) {
            return res.status(400).json({
                message:
                    "Please provide name, province, short description, and description",
            });
        }

        const destinationExists = await Destination.findOne({ name });

        if (destinationExists) {
            return res.status(400).json({
                message: "Destination already exists",
            });
        }

        const destination = await Destination.create({
            name,
            province,
            category,
            shortDescription,
            description,
            imageUrl,
            bestFor,
            isPopular,
            status,
        });

        res.status(201).json(destination);
    } catch (error) {
        res.status(500).json({
            message: "Server error",
            error: error.message,
        });
    }
};


const getDestinations = async (req, res) => {
    try {
        const {
            keyword,
            category,
            status,
            isPopular,
            page = 1,
            limit = 10,
        } = req.query;

        const query = {};


        if (keyword) {
            query.$or = [
                { name: { $regex: keyword, $options: "i" } },
                { province: { $regex: keyword, $options: "i" } },
            ];
        }


        if (category) {
            query.category = category;
        }


        if (status) {
            query.status = status;
        }


        if (isPopular !== undefined) {
            query.isPopular = isPopular === "true";
        }

        const pageNumber = Number(page);
        const pageSize = Number(limit);

        const totalDestinations = await Destination.countDocuments(query);

        const destinations = await Destination.find(query)
            .sort({ createdAt: -1 })
            .skip((pageNumber - 1) * pageSize)
            .limit(pageSize);

        res.status(200).json({
            destinations,
            currentPage: pageNumber,
            totalPages: Math.ceil(totalDestinations / pageSize),
            totalDestinations,
        });
    } catch (error) {
        res.status(500).json({
            message: "Server error",
            error: error.message,
        });
    }
};


const getDestinationById = async (req, res) => {
    try {
        const destination = await Destination.findById(req.params.id);

        if (!destination) {
            return res.status(404).json({
                message: "Destination not found",
            });
        }

        res.status(200).json(destination);
    } catch (error) {
        res.status(500).json({
            message: "Server error",
            error: error.message,
        });
    }
};


const updateDestination = async (req, res) => {
    try {
        const destination = await Destination.findById(req.params.id);

        if (!destination) {
            return res.status(404).json({
                message: "Destination not found",
            });
        }

        const updatedDestination = await Destination.findByIdAndUpdate(
            req.params.id,
            req.body,
            {
                new: true,
                runValidators: true,
            }
        );

        res.status(200).json(updatedDestination);
    } catch (error) {
        res.status(500).json({
            message: "Server error",
            error: error.message,
        });
    }
};


const deleteDestination = async (req, res) => {
    try {
        const destination = await Destination.findById(req.params.id);

        if (!destination) {
            return res.status(404).json({
                message: "Destination not found",
            });
        }

        await Destination.findByIdAndDelete(req.params.id);

        res.status(200).json({
            message: "Destination deleted successfully",
        });
    } catch (error) {
        res.status(500).json({
            message: "Server error",
            error: error.message,
        });
    }
};

module.exports = {
    createDestination,
    getDestinations,
    getDestinationById,
    updateDestination,
    deleteDestination,
};