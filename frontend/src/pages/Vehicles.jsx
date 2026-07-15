import { useEffect, useState } from "react";
import { FaEdit, FaPlus, FaSearch, FaTrash } from "react-icons/fa";
import api from "../api/axios";
import PermissionGuard from "../components/PermissionGuard";

const initialFormState = {
    name: "",
    type: "Car",
    capacity: 1,
    pricePerDay: 0,
    currency: "USD",
    imageUrl: "",
    description: "",
    featuresText: "",
    isFeatured: false,
    status: "Active",
};

const Vehicles = () => {
    const [vehicles, setVehicles] = useState([]);
    const [formData, setFormData] = useState(initialFormState);

    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState(null);

    const [searchInput, setSearchInput] = useState("");
    const [keyword, setKeyword] = useState("");
    const [vehicleType, setVehicleType] = useState("");
    const [status, setStatus] = useState("");
    const [isFeatured, setIsFeatured] = useState("");

    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalVehicles, setTotalVehicles] = useState(0);

    const [loading, setLoading] = useState(false);
    const [formLoading, setFormLoading] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    const vehicleOptions = ["Car", "SUV", "Van", "Mini Bus", "Bus", "Other"];

    const fetchVehicles = async () => {
        try {
            setLoading(true);
            setError("");

            const params = {
                page,
                limit: 5,
            };

            if (keyword) params.keyword = keyword;
            if (vehicleType) params.type = vehicleType;
            if (status) params.status = status;
            if (isFeatured !== "") params.isFeatured = isFeatured;

            const response = await api.get("/vehicles", { params });

            setVehicles(response.data.vehicles || []);
            setTotalPages(response.data.totalPages || 1);
            setTotalVehicles(response.data.totalVehicles || 0);
        } catch (err) {
            setError(err.response?.data?.message || "Failed to load vehicles");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchVehicles();
    }, [page, keyword, vehicleType, status, isFeatured]);

    const textToArray = (text) => {
        return text
            .split("\n")
            .map((item) => item.trim())
            .filter((item) => item.length > 0);
    };

    const arrayToText = (array) => {
        return Array.isArray(array) ? array.join("\n") : "";
    };

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;

        setFormData((prev) => ({
            ...prev,
            [name]: type === "checkbox" ? checked : value,
        }));
    };

    const resetForm = () => {
        setFormData(initialFormState);
        setEditingId(null);
        setShowForm(false);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        try {
            setFormLoading(true);
            setError("");
            setSuccess("");

            const payload = {
                name: formData.name,
                type: formData.type,
                capacity: Number(formData.capacity),
                pricePerDay: Number(formData.pricePerDay),
                currency: formData.currency,
                imageUrl: formData.imageUrl,
                description: formData.description,
                features: textToArray(formData.featuresText),
                isFeatured: formData.isFeatured,
                status: formData.status,
            };

            if (editingId) {
                await api.put(`/vehicles/${editingId}`, payload);
                setSuccess("Vehicle updated successfully");
            } else {
                await api.post("/vehicles", payload);
                setSuccess("Vehicle added successfully");
            }

            resetForm();
            fetchVehicles();
        } catch (err) {
            setError(err.response?.data?.message || "Failed to save vehicle");
        } finally {
            setFormLoading(false);
        }
    };

    const handleEdit = (vehicle) => {
        setEditingId(vehicle._id);

        setFormData({
            name: vehicle.name || "",
            type: vehicle.type || "Car",
            capacity: vehicle.capacity || 1,
            pricePerDay: vehicle.pricePerDay || 0,
            currency: vehicle.currency || "USD",
            imageUrl: vehicle.imageUrl || "",
            description: vehicle.description || "",
            featuresText: arrayToText(vehicle.features),
            isFeatured: vehicle.isFeatured || false,
            status: vehicle.status || "Active",
        });

        setShowForm(true);
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    const handleDelete = async (id) => {
        const confirmDelete = window.confirm(
            "Are you sure you want to delete this vehicle?"
        );

        if (!confirmDelete) return;

        try {
            setError("");
            setSuccess("");

            await api.delete(`/vehicles/${id}`);

            setSuccess("Vehicle deleted successfully");
            fetchVehicles();
        } catch (err) {
            setError(err.response?.data?.message || "Failed to delete vehicle");
        }
    };

    const handleSearch = (e) => {
        e.preventDefault();
        setPage(1);
        setKeyword(searchInput.trim());
    };

    const clearFilters = () => {
        setSearchInput("");
        setKeyword("");
        setVehicleType("");
        setStatus("");
        setIsFeatured("");
        setPage(1);
    };

    return (
        <div>
            <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-4 gap-3">
                <div>
                    <h2 className="fw-bold mb-1">Vehicles</h2>
                    <p className="text-muted mb-0">
                        Manage DMC vehicle pricing, capacity, features, and availability.
                    </p>
                </div>

                <PermissionGuard permission="vehicle.manage">
                    <button
                        className="btn btn-primary"
                        onClick={() => {
                            setShowForm((prev) => !prev);
                            setEditingId(null);
                            setFormData(initialFormState);
                        }}
                    >
                        <FaPlus className="me-2" />
                        Add Vehicle
                    </button>
                </PermissionGuard>
            </div>

            {error && <div className="alert alert-danger">{error}</div>}
            {success && <div className="alert alert-success">{success}</div>}

            {showForm && (
                <div className="card border-0 shadow-sm rounded-4 mb-4">
                    <div className="card-body">
                        <h5 className="fw-bold mb-3">
                            {editingId ? "Edit Vehicle" : "Add New Vehicle"}
                        </h5>

                        <form onSubmit={handleSubmit}>
                            <div className="row g-3">
                                <div className="col-12 col-md-6">
                                    <label className="form-label fw-semibold">Vehicle Name</label>
                                    <input
                                        type="text"
                                        name="name"
                                        className="form-control"
                                        value={formData.name}
                                        onChange={handleChange}
                                        placeholder="Comfortable A/C Car"
                                        required
                                    />
                                </div>

                                <div className="col-12 col-md-6">
                                    <label className="form-label fw-semibold">Vehicle Type</label>
                                    <select
                                        name="type"
                                        className="form-select"
                                        value={formData.type}
                                        onChange={handleChange}
                                        required
                                    >
                                        {vehicleOptions.map((item) => (
                                            <option key={item} value={item}>
                                                {item}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="col-12 col-md-4">
                                    <label className="form-label fw-semibold">Capacity</label>
                                    <input
                                        type="number"
                                        name="capacity"
                                        className="form-control"
                                        value={formData.capacity}
                                        onChange={handleChange}
                                        min="1"
                                        required
                                    />
                                </div>

                                <div className="col-12 col-md-4">
                                    <label className="form-label fw-semibold">Price Per Day</label>
                                    <input
                                        type="number"
                                        name="pricePerDay"
                                        className="form-control"
                                        value={formData.pricePerDay}
                                        onChange={handleChange}
                                        min="0"
                                        required
                                    />
                                </div>

                                <div className="col-12 col-md-4">
                                    <label className="form-label fw-semibold">Currency</label>
                                    <select
                                        name="currency"
                                        className="form-select"
                                        value={formData.currency}
                                        onChange={handleChange}
                                    >
                                        <option value="USD">USD</option>
                                        <option value="LKR">LKR</option>
                                        <option value="EUR">EUR</option>
                                        <option value="GBP">GBP</option>
                                    </select>
                                </div>

                                <div className="col-12">
                                    <label className="form-label fw-semibold">Description</label>
                                    <textarea
                                        name="description"
                                        className="form-control"
                                        rows="4"
                                        value={formData.description}
                                        onChange={handleChange}
                                        placeholder="Comfortable air-conditioned vehicle suitable for Sri Lanka round tours."
                                        required
                                    ></textarea>
                                </div>

                                <div className="col-12">
                                    <label className="form-label fw-semibold">Features</label>
                                    <textarea
                                        name="featuresText"
                                        className="form-control"
                                        rows="5"
                                        value={formData.featuresText}
                                        onChange={handleChange}
                                        placeholder={
                                            "A/C vehicle\nEnglish-speaking chauffeur guide\nAirport pickup\nWater bottles\nComfortable luggage space"
                                        }
                                    ></textarea>
                                    <small className="text-muted">Add one feature per line.</small>
                                </div>

                                <div className="col-12">
                                    <label className="form-label fw-semibold">Image URL</label>
                                    <input
                                        type="text"
                                        name="imageUrl"
                                        className="form-control"
                                        value={formData.imageUrl}
                                        onChange={handleChange}
                                        placeholder="https://example.com/vehicle.jpg"
                                    />
                                </div>

                                <div className="col-12 col-md-6">
                                    <label className="form-label fw-semibold">Status</label>
                                    <select
                                        name="status"
                                        className="form-select"
                                        value={formData.status}
                                        onChange={handleChange}
                                    >
                                        <option value="Active">Active</option>
                                        <option value="Inactive">Inactive</option>
                                    </select>
                                </div>

                                <div className="col-12 col-md-6 d-flex align-items-end">
                                    <div className="form-check mb-2">
                                        <input
                                            className="form-check-input"
                                            type="checkbox"
                                            name="isFeatured"
                                            checked={formData.isFeatured}
                                            onChange={handleChange}
                                            id="isFeaturedVehicle"
                                        />
                                        <label
                                            className="form-check-label"
                                            htmlFor="isFeaturedVehicle"
                                        >
                                            Featured vehicle
                                        </label>
                                    </div>
                                </div>
                            </div>

                            <div className="d-flex gap-2 mt-4">
                                <PermissionGuard permission="vehicle.manage">
                                    <button
                                        type="submit"
                                        className="btn btn-primary"
                                        disabled={formLoading}
                                    >
                                        {formLoading
                                            ? "Saving..."
                                            : editingId
                                                ? "Update Vehicle"
                                                : "Save Vehicle"}
                                    </button>
                                </PermissionGuard>

                                <button
                                    type="button"
                                    className="btn btn-outline-secondary"
                                    onClick={resetForm}
                                >
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <div className="card border-0 shadow-sm rounded-4">
                <div className="card-body">
                    <div className="row g-3 mb-4">
                        <div className="col-12 col-lg-5">
                            <form onSubmit={handleSearch}>
                                <div className="input-group">
                                    <input
                                        type="text"
                                        className="form-control"
                                        placeholder="Search vehicle name, type, description..."
                                        value={searchInput}
                                        onChange={(e) => setSearchInput(e.target.value)}
                                    />
                                    <button className="btn btn-primary" type="submit">
                                        <FaSearch />
                                    </button>
                                </div>
                            </form>
                        </div>

                        <div className="col-12 col-md-4 col-lg-2">
                            <select
                                className="form-select"
                                value={vehicleType}
                                onChange={(e) => {
                                    setPage(1);
                                    setVehicleType(e.target.value);
                                }}
                            >
                                <option value="">All Types</option>
                                {vehicleOptions.map((item) => (
                                    <option key={item} value={item}>
                                        {item}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="col-12 col-md-4 col-lg-2">
                            <select
                                className="form-select"
                                value={status}
                                onChange={(e) => {
                                    setPage(1);
                                    setStatus(e.target.value);
                                }}
                            >
                                <option value="">All Status</option>
                                <option value="Active">Active</option>
                                <option value="Inactive">Inactive</option>
                            </select>
                        </div>

                        <div className="col-12 col-md-4 col-lg-2">
                            <select
                                className="form-select"
                                value={isFeatured}
                                onChange={(e) => {
                                    setPage(1);
                                    setIsFeatured(e.target.value);
                                }}
                            >
                                <option value="">All</option>
                                <option value="true">Featured</option>
                                <option value="false">Not Featured</option>
                            </select>
                        </div>

                        <div className="col-12 col-lg-1">
                            <button
                                className="btn btn-outline-secondary w-100"
                                onClick={clearFilters}
                            >
                                Clear
                            </button>
                        </div>
                    </div>

                    <div className="d-flex justify-content-between align-items-center mb-3">
                        <h5 className="fw-bold mb-0">Vehicle List</h5>
                        <small className="text-muted">Total: {totalVehicles} vehicles</small>
                    </div>

                    {loading ? (
                        <p className="text-muted">Loading vehicles...</p>
                    ) : vehicles.length === 0 ? (
                        <p className="text-muted mb-0">No vehicles found.</p>
                    ) : (
                        <div className="table-responsive">
                            <table className="table align-middle">
                                <thead>
                                <tr>
                                    <th>Vehicle</th>
                                    <th>Type</th>
                                    <th>Capacity</th>
                                    <th>Price / Day</th>
                                    <th>Featured</th>
                                    <th>Status</th>
                                    <th className="text-end">Actions</th>
                                </tr>
                                </thead>

                                <tbody>
                                {vehicles.map((vehicle) => (
                                    <tr key={vehicle._id}>
                                        <td>
                                            <div>
                                                <h6 className="mb-1">{vehicle.name}</h6>
                                                <small className="text-muted">
                                                    {vehicle.description?.length > 80
                                                        ? `${vehicle.description.slice(0, 80)}...`
                                                        : vehicle.description}
                                                </small>
                                            </div>
                                        </td>

                                        <td>
                        <span className="badge text-bg-light">
                          {vehicle.type}
                        </span>
                                        </td>

                                        <td>{vehicle.capacity} pax</td>

                                        <td>
                                            {vehicle.currency} {vehicle.pricePerDay}
                                        </td>

                                        <td>
                                            {vehicle.isFeatured ? (
                                                <span className="badge text-bg-success">Yes</span>
                                            ) : (
                                                <span className="badge text-bg-secondary">No</span>
                                            )}
                                        </td>

                                        <td>
                                            {vehicle.status === "Active" ? (
                                                <span className="badge text-bg-success">Active</span>
                                            ) : (
                                                <span className="badge text-bg-warning">Inactive</span>
                                            )}
                                        </td>

                                        <td className="text-end">
                                            <PermissionGuard permission="vehicle.manage">
                                                <button
                                                    className="btn btn-sm btn-outline-primary me-2"
                                                    onClick={() => handleEdit(vehicle)}
                                                >
                                                    <FaEdit />
                                                </button>
                                            </PermissionGuard>

                                            <PermissionGuard permission="vehicle.manage">
                                                <button
                                                    className="btn btn-sm btn-outline-danger"
                                                    onClick={() => handleDelete(vehicle._id)}
                                                >
                                                    <FaTrash />
                                                </button>
                                            </PermissionGuard>
                                        </td>
                                    </tr>
                                ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    <div className="d-flex justify-content-between align-items-center mt-4">
                        <button
                            className="btn btn-outline-secondary btn-sm"
                            disabled={page <= 1}
                            onClick={() => setPage((prev) => prev - 1)}
                        >
                            Previous
                        </button>

                        <small className="text-muted">
                            Page {page} of {totalPages}
                        </small>

                        <button
                            className="btn btn-outline-secondary btn-sm"
                            disabled={page >= totalPages}
                            onClick={() => setPage((prev) => prev + 1)}
                        >
                            Next
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Vehicles;