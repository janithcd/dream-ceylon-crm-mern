const Vehicle = require("../models/Vehicle");


const createVehicle = async (req, res) => {
    try {
        const {
            name,
            type,
            capacity,
            pricePerDay,
            currency,
            imageUrl,
            description,
            features,
            isFeatured,
            status,
        } = req.body;

        if (!name || !type || !capacity || pricePerDay === undefined || !description) {
            return res.status(400).json({
                message:
                    "Please provide name, type, capacity, price per day, and description",
            });
        }

        const vehicleExists = await Vehicle.findOne({ name });

        if (vehicleExists) {
            return res.status(400).json({
                message: "Vehicle already exists with this name",
            });
        }

        const vehicle = await Vehicle.create({
            name,
            type,
            capacity,
            pricePerDay,
            currency,
            imageUrl,
            description,
            features,
            isFeatured,
            status,
        });

        res.status(201).json(vehicle);
    } catch (error) {
        res.status(500).json({
            message: "Server error",
            error: error.message,
        });
    }
};


const getVehicles = async (req, res) => {
    try {
        const {
            keyword,
            type,
            status,
            isFeatured,
            page = 1,
            limit = 10,
        } = req.query;

        const query = {};

        if (keyword) {
            query.$or = [
                { name: { $regex: keyword, $options: "i" } },
                { type: { $regex: keyword, $options: "i" } },
                { description: { $regex: keyword, $options: "i" } },
            ];
        }

        if (type) {
            query.type = type;
        }

        if (status) {
            query.status = status;
        }

        if (isFeatured !== undefined) {
            query.isFeatured = isFeatured === "true";
        }

        const pageNumber = Number(page);
        const pageSize = Number(limit);

        const totalVehicles = await Vehicle.countDocuments(query);

        const vehicles = await Vehicle.find(query)
            .sort({ createdAt: -1 })
            .skip((pageNumber - 1) * pageSize)
            .limit(pageSize);

        res.status(200).json({
            vehicles,
            currentPage: pageNumber,
            totalPages: Math.ceil(totalVehicles / pageSize),
            totalVehicles,
        });
    } catch (error) {
        res.status(500).json({
            message: "Server error",
            error: error.message,
        });
    }
};


const getVehicleById = async (req, res) => {
    try {
        const vehicle = await Vehicle.findById(req.params.id);

        if (!vehicle) {
            return res.status(404).json({
                message: "Vehicle not found",
            });
        }

        res.status(200).json(vehicle);
    } catch (error) {
        res.status(500).json({
            message: "Server error",
            error: error.message,
        });
    }
};


const updateVehicle = async (req, res) => {
    try {
        const vehicle = await Vehicle.findById(req.params.id);

        if (!vehicle) {
            return res.status(404).json({
                message: "Vehicle not found",
            });
        }

        const updatedVehicle = await Vehicle.findByIdAndUpdate(
            req.params.id,
            req.body,
            {
                new: true,
                runValidators: true,
            }
        );

        res.status(200).json(updatedVehicle);
    } catch (error) {
        res.status(500).json({
            message: "Server error",
            error: error.message,
        });
    }
};


const deleteVehicle = async (req, res) => {
    try {
        const vehicle = await Vehicle.findById(req.params.id);

        if (!vehicle) {
            return res.status(404).json({
                message: "Vehicle not found",
            });
        }

        await Vehicle.findByIdAndDelete(req.params.id);

        res.status(200).json({
            message: "Vehicle deleted successfully",
        });
    } catch (error) {
        res.status(500).json({
            message: "Server error",
            error: error.message,
        });
    }
};

module.exports = {
    createVehicle,
    getVehicles,
    getVehicleById,
    updateVehicle,
    deleteVehicle,
};