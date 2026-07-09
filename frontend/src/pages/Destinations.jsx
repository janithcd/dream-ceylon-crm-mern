import { useEffect, useState } from "react";
import { FaEdit, FaPlus, FaSearch, FaTrash } from "react-icons/fa";
import api from "../api/axios";

const initialFormState = {
    name: "",
    province: "",
    category: "Other",
    shortDescription: "",
    description: "",
    imageUrl: "",
    bestFor: "",
    isPopular: false,
    status: "Active",
};

const Destinations = () => {
    const [destinations, setDestinations] = useState([]);
    const [formData, setFormData] = useState(initialFormState);

    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState(null);

    const [searchInput, setSearchInput] = useState("");
    const [keyword, setKeyword] = useState("");
    const [category, setCategory] = useState("");
    const [status, setStatus] = useState("");
    const [isPopular, setIsPopular] = useState("");

    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalDestinations, setTotalDestinations] = useState(0);

    const [loading, setLoading] = useState(false);
    const [formLoading, setFormLoading] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    const categories = [
        "Cultural",
        "Beach",
        "Wildlife",
        "Hill Country",
        "Adventure",
        "City",
        "Religious",
        "Other",
    ];

    const fetchDestinations = async () => {
        try {
            setLoading(true);
            setError("");

            const params = {
                page,
                limit: 5,
            };

            if (keyword) params.keyword = keyword;
            if (category) params.category = category;
            if (status) params.status = status;
            if (isPopular !== "") params.isPopular = isPopular;

            const response = await api.get("/destinations", { params });

            setDestinations(response.data.destinations || []);
            setTotalPages(response.data.totalPages || 1);
            setTotalDestinations(response.data.totalDestinations || 0);
        } catch (err) {
            setError(err.response?.data?.message || "Failed to load destinations");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDestinations();
    }, [page, keyword, category, status, isPopular]);

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

            if (editingId) {
                await api.put(`/destinations/${editingId}`, formData);
                setSuccess("Destination updated successfully");
            } else {
                await api.post("/destinations", formData);
                setSuccess("Destination added successfully");
            }

            resetForm();
            fetchDestinations();
        } catch (err) {
            setError(err.response?.data?.message || "Failed to save destination");
        } finally {
            setFormLoading(false);
        }
    };

    const handleEdit = (destination) => {
        setEditingId(destination._id);

        setFormData({
            name: destination.name || "",
            province: destination.province || "",
            category: destination.category || "Other",
            shortDescription: destination.shortDescription || "",
            description: destination.description || "",
            imageUrl: destination.imageUrl || "",
            bestFor: destination.bestFor || "",
            isPopular: destination.isPopular || false,
            status: destination.status || "Active",
        });

        setShowForm(true);
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    const handleDelete = async (id) => {
        const confirmDelete = window.confirm(
            "Are you sure you want to delete this destination?"
        );

        if (!confirmDelete) return;

        try {
            setError("");
            setSuccess("");

            await api.delete(`/destinations/${id}`);

            setSuccess("Destination deleted successfully");
            fetchDestinations();
        } catch (err) {
            setError(err.response?.data?.message || "Failed to delete destination");
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
        setCategory("");
        setStatus("");
        setIsPopular("");
        setPage(1);
    };

    return (
        <div>
            <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-4 gap-3">
                <div>
                    <h2 className="fw-bold mb-1">Destinations</h2>
                    <p className="text-muted mb-0">
                        Manage Sri Lankan destinations used in your tour packages.
                    </p>
                </div>

                <button
                    className="btn btn-primary"
                    onClick={() => {
                        setShowForm((prev) => !prev);
                        setEditingId(null);
                        setFormData(initialFormState);
                    }}
                >
                    <FaPlus className="me-2" />
                    Add Destination
                </button>
            </div>

            {error && <div className="alert alert-danger">{error}</div>}
            {success && <div className="alert alert-success">{success}</div>}

            {showForm && (
                <div className="card border-0 shadow-sm rounded-4 mb-4">
                    <div className="card-body">
                        <h5 className="fw-bold mb-3">
                            {editingId ? "Edit Destination" : "Add New Destination"}
                        </h5>

                        <form onSubmit={handleSubmit}>
                            <div className="row g-3">
                                <div className="col-12 col-md-6">
                                    <label className="form-label fw-semibold">Name</label>
                                    <input
                                        type="text"
                                        name="name"
                                        className="form-control"
                                        value={formData.name}
                                        onChange={handleChange}
                                        placeholder="Sigiriya"
                                        required
                                    />
                                </div>

                                <div className="col-12 col-md-6">
                                    <label className="form-label fw-semibold">Province</label>
                                    <input
                                        type="text"
                                        name="province"
                                        className="form-control"
                                        value={formData.province}
                                        onChange={handleChange}
                                        placeholder="Central Province"
                                        required
                                    />
                                </div>

                                <div className="col-12 col-md-4">
                                    <label className="form-label fw-semibold">Category</label>
                                    <select
                                        name="category"
                                        className="form-select"
                                        value={formData.category}
                                        onChange={handleChange}
                                    >
                                        {categories.map((item) => (
                                            <option key={item} value={item}>
                                                {item}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="col-12 col-md-4">
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

                                <div className="col-12 col-md-4 d-flex align-items-end">
                                    <div className="form-check mb-2">
                                        <input
                                            className="form-check-input"
                                            type="checkbox"
                                            name="isPopular"
                                            checked={formData.isPopular}
                                            onChange={handleChange}
                                            id="isPopular"
                                        />
                                        <label className="form-check-label" htmlFor="isPopular">
                                            Popular destination
                                        </label>
                                    </div>
                                </div>

                                <div className="col-12">
                                    <label className="form-label fw-semibold">
                                        Short Description
                                    </label>
                                    <input
                                        type="text"
                                        name="shortDescription"
                                        className="form-control"
                                        value={formData.shortDescription}
                                        onChange={handleChange}
                                        placeholder="Ancient rock fortress and iconic heritage site."
                                        maxLength="200"
                                        required
                                    />
                                </div>

                                <div className="col-12">
                                    <label className="form-label fw-semibold">Description</label>
                                    <textarea
                                        name="description"
                                        className="form-control"
                                        rows="4"
                                        value={formData.description}
                                        onChange={handleChange}
                                        placeholder="Write a detailed destination description..."
                                        required
                                    ></textarea>
                                </div>

                                <div className="col-12 col-md-6">
                                    <label className="form-label fw-semibold">Image URL</label>
                                    <input
                                        type="text"
                                        name="imageUrl"
                                        className="form-control"
                                        value={formData.imageUrl}
                                        onChange={handleChange}
                                        placeholder="https://example.com/sigiriya.jpg"
                                    />
                                </div>

                                <div className="col-12 col-md-6">
                                    <label className="form-label fw-semibold">Best For</label>
                                    <input
                                        type="text"
                                        name="bestFor"
                                        className="form-control"
                                        value={formData.bestFor}
                                        onChange={handleChange}
                                        placeholder="History, culture, photography"
                                    />
                                </div>
                            </div>

                            <div className="d-flex gap-2 mt-4">
                                <button
                                    type="submit"
                                    className="btn btn-primary"
                                    disabled={formLoading}
                                >
                                    {formLoading
                                        ? "Saving..."
                                        : editingId
                                            ? "Update Destination"
                                            : "Save Destination"}
                                </button>

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
                                        placeholder="Search by name or province..."
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
                                value={category}
                                onChange={(e) => {
                                    setPage(1);
                                    setCategory(e.target.value);
                                }}
                            >
                                <option value="">All Categories</option>
                                {categories.map((item) => (
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
                                value={isPopular}
                                onChange={(e) => {
                                    setPage(1);
                                    setIsPopular(e.target.value);
                                }}
                            >
                                <option value="">All</option>
                                <option value="true">Popular</option>
                                <option value="false">Not Popular</option>
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
                        <h5 className="fw-bold mb-0">Destination List</h5>
                        <small className="text-muted">
                            Total: {totalDestinations} destinations
                        </small>
                    </div>

                    {loading ? (
                        <p className="text-muted">Loading destinations...</p>
                    ) : destinations.length === 0 ? (
                        <p className="text-muted mb-0">No destinations found.</p>
                    ) : (
                        <div className="table-responsive">
                            <table className="table align-middle">
                                <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Province</th>
                                    <th>Category</th>
                                    <th>Popular</th>
                                    <th>Status</th>
                                    <th className="text-end">Actions</th>
                                </tr>
                                </thead>
                                <tbody>
                                {destinations.map((destination) => (
                                    <tr key={destination._id}>
                                        <td>
                                            <div>
                                                <h6 className="mb-1">{destination.name}</h6>
                                                <small className="text-muted">
                                                    {destination.shortDescription}
                                                </small>
                                            </div>
                                        </td>

                                        <td>{destination.province}</td>

                                        <td>
                        <span className="badge text-bg-light">
                          {destination.category}
                        </span>
                                        </td>

                                        <td>
                                            {destination.isPopular ? (
                                                <span className="badge text-bg-success">Yes</span>
                                            ) : (
                                                <span className="badge text-bg-secondary">No</span>
                                            )}
                                        </td>

                                        <td>
                                            {destination.status === "Active" ? (
                                                <span className="badge text-bg-success">Active</span>
                                            ) : (
                                                <span className="badge text-bg-warning">
                            Inactive
                          </span>
                                            )}
                                        </td>

                                        <td className="text-end">
                                            <button
                                                className="btn btn-sm btn-outline-primary me-2"
                                                onClick={() => handleEdit(destination)}
                                            >
                                                <FaEdit />
                                            </button>

                                            <button
                                                className="btn btn-sm btn-outline-danger"
                                                onClick={() => handleDelete(destination._id)}
                                            >
                                                <FaTrash />
                                            </button>
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

export default Destinations;