import { useEffect, useState } from "react";
import { FaEdit, FaPlus, FaSearch, FaTrash } from "react-icons/fa";
import api from "../api/axios";
import PermissionGuard from "../components/PermissionGuard";

const initialFormState = {
    title: "",
    durationDays: 1,
    category: "Other",
    overview: "",
    destinations: [],
    priceFrom: 0,
    currency: "USD",
    inclusionsText: "",
    exclusionsText: "",
    itinerary: [{ day: 1, title: "", description: "" }],
    imageUrl: "",
    isFeatured: false,
    status: "Active",
};

const Packages = () => {
    const [packages, setPackages] = useState([]);
    const [destinations, setDestinations] = useState([]);

    const [formData, setFormData] = useState(initialFormState);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState(null);

    const [searchInput, setSearchInput] = useState("");
    const [keyword, setKeyword] = useState("");
    const [category, setCategory] = useState("");
    const [status, setStatus] = useState("");
    const [isFeatured, setIsFeatured] = useState("");

    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalPackages, setTotalPackages] = useState(0);

    const [loading, setLoading] = useState(false);
    const [formLoading, setFormLoading] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    const categories = [
        "Cultural",
        "Beach",
        "Wildlife",
        "Adventure",
        "Honeymoon",
        "Family",
        "Luxury",
        "Budget",
        "Round Tour",
        "Other",
    ];

    const fetchDestinations = async () => {
        try {
            const response = await api.get("/destinations", {
                params: {
                    limit: 100,
                    status: "Active",
                },
            });

            setDestinations(response.data.destinations || []);
        } catch (err) {
            console.error("Failed to load destinations", err);
        }
    };

    const fetchPackages = async () => {
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
            if (isFeatured !== "") params.isFeatured = isFeatured;

            const response = await api.get("/packages", { params });

            setPackages(response.data.packages || []);
            setTotalPages(response.data.totalPages || 1);
            setTotalPackages(response.data.totalPackages || 0);
        } catch (err) {
            setError(err.response?.data?.message || "Failed to load packages");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDestinations();
    }, []);

    useEffect(() => {
        fetchPackages();
    }, [page, keyword, category, status, isFeatured]);

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

    const handleDestinationChange = (e) => {
        const selectedValues = Array.from(
            e.target.selectedOptions,
            (option) => option.value
        );

        setFormData((prev) => ({
            ...prev,
            destinations: selectedValues,
        }));
    };

    const handleItineraryChange = (index, field, value) => {
        const updatedItinerary = [...formData.itinerary];

        updatedItinerary[index] = {
            ...updatedItinerary[index],
            [field]: field === "day" ? Number(value) : value,
        };

        setFormData((prev) => ({
            ...prev,
            itinerary: updatedItinerary,
        }));
    };

    const addItineraryDay = () => {
        setFormData((prev) => ({
            ...prev,
            itinerary: [
                ...prev.itinerary,
                {
                    day: prev.itinerary.length + 1,
                    title: "",
                    description: "",
                },
            ],
        }));
    };

    const removeItineraryDay = (index) => {
        const updatedItinerary = formData.itinerary.filter((_, i) => i !== index);

        setFormData((prev) => ({
            ...prev,
            itinerary:
                updatedItinerary.length > 0
                    ? updatedItinerary
                    : [{ day: 1, title: "", description: "" }],
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
                title: formData.title,
                durationDays: Number(formData.durationDays),
                category: formData.category,
                overview: formData.overview,
                destinations: formData.destinations,
                priceFrom: Number(formData.priceFrom),
                currency: formData.currency,
                inclusions: textToArray(formData.inclusionsText),
                exclusions: textToArray(formData.exclusionsText),
                itinerary: formData.itinerary.filter(
                    (day) => day.title.trim() && day.description.trim()
                ),
                imageUrl: formData.imageUrl,
                isFeatured: formData.isFeatured,
                status: formData.status,
            };

            if (editingId) {
                await api.put(`/packages/${editingId}`, payload);
                setSuccess("Tour package updated successfully");
            } else {
                await api.post("/packages", payload);
                setSuccess("Tour package added successfully");
            }

            resetForm();
            fetchPackages();
        } catch (err) {
            setError(err.response?.data?.message || "Failed to save package");
        } finally {
            setFormLoading(false);
        }
    };

    const handleEdit = (tourPackage) => {
        setEditingId(tourPackage._id);

        setFormData({
            title: tourPackage.title || "",
            durationDays: tourPackage.durationDays || 1,
            category: tourPackage.category || "Other",
            overview: tourPackage.overview || "",
            destinations:
                tourPackage.destinations?.map((destination) => destination._id) || [],
            priceFrom: tourPackage.priceFrom || 0,
            currency: tourPackage.currency || "USD",
            inclusionsText: arrayToText(tourPackage.inclusions),
            exclusionsText: arrayToText(tourPackage.exclusions),
            itinerary:
                tourPackage.itinerary?.length > 0
                    ? tourPackage.itinerary
                    : [{ day: 1, title: "", description: "" }],
            imageUrl: tourPackage.imageUrl || "",
            isFeatured: tourPackage.isFeatured || false,
            status: tourPackage.status || "Active",
        });

        setShowForm(true);
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    const handleDelete = async (id) => {
        const confirmDelete = window.confirm(
            "Are you sure you want to delete this tour package?"
        );

        if (!confirmDelete) return;

        try {
            setError("");
            setSuccess("");

            await api.delete(`/packages/${id}`);

            setSuccess("Tour package deleted successfully");
            fetchPackages();
        } catch (err) {
            setError(err.response?.data?.message || "Failed to delete package");
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
        setIsFeatured("");
        setPage(1);
    };

    return (
        <div>
            <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-4 gap-3">
                <div>
                    <h2 className="fw-bold mb-1">Tour Packages</h2>
                    <p className="text-muted mb-0">
                        Manage Sri Lanka tour packages, inclusions, exclusions, and itinerary.
                    </p>
                </div>

                <PermissionGuard permission="package.manage">
                    <button
                        className="btn btn-primary"
                        onClick={() => {
                            setShowForm((prev) => !prev);
                            setEditingId(null);
                            setFormData(initialFormState);
                        }}
                    >
                        <FaPlus className="me-2" />
                        Add Package
                    </button>
                </PermissionGuard>
            </div>

            {error && <div className="alert alert-danger">{error}</div>}
            {success && <div className="alert alert-success">{success}</div>}

            {showForm && (
                <div className="card border-0 shadow-sm rounded-4 mb-4">
                    <div className="card-body">
                        <h5 className="fw-bold mb-3">
                            {editingId ? "Edit Tour Package" : "Add New Tour Package"}
                        </h5>

                        <form onSubmit={handleSubmit}>
                            <div className="row g-3">
                                <div className="col-12 col-md-8">
                                    <label className="form-label fw-semibold">Package Title</label>
                                    <input
                                        type="text"
                                        name="title"
                                        className="form-control"
                                        value={formData.title}
                                        onChange={handleChange}
                                        placeholder="14 Days Sri Lanka Round Tour"
                                        required
                                    />
                                </div>

                                <div className="col-12 col-md-4">
                                    <label className="form-label fw-semibold">Duration Days</label>
                                    <input
                                        type="number"
                                        name="durationDays"
                                        className="form-control"
                                        value={formData.durationDays}
                                        onChange={handleChange}
                                        min="1"
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
                                    <label className="form-label fw-semibold">Price From</label>
                                    <input
                                        type="number"
                                        name="priceFrom"
                                        className="form-control"
                                        value={formData.priceFrom}
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
                                    <label className="form-label fw-semibold">Overview</label>
                                    <textarea
                                        name="overview"
                                        className="form-control"
                                        rows="3"
                                        value={formData.overview}
                                        onChange={handleChange}
                                        placeholder="Write package overview..."
                                        required
                                    ></textarea>
                                </div>

                                <div className="col-12">
                                    <label className="form-label fw-semibold">
                                        Destinations
                                    </label>
                                    <select
                                        className="form-select"
                                        multiple
                                        value={formData.destinations}
                                        onChange={handleDestinationChange}
                                    >
                                        {destinations.map((destination) => (
                                            <option key={destination._id} value={destination._id}>
                                                {destination.name} - {destination.category}
                                            </option>
                                        ))}
                                    </select>
                                    <small className="text-muted">
                                        Hold Ctrl and click to select multiple destinations.
                                    </small>
                                </div>

                                <div className="col-12 col-md-6">
                                    <label className="form-label fw-semibold">Inclusions</label>
                                    <textarea
                                        name="inclusionsText"
                                        className="form-control"
                                        rows="5"
                                        value={formData.inclusionsText}
                                        onChange={handleChange}
                                        placeholder={"Licensed chauffeur guide\nA/C vehicle\nAirport pickup"}
                                    ></textarea>
                                    <small className="text-muted">Add one inclusion per line.</small>
                                </div>

                                <div className="col-12 col-md-6">
                                    <label className="form-label fw-semibold">Exclusions</label>
                                    <textarea
                                        name="exclusionsText"
                                        className="form-control"
                                        rows="5"
                                        value={formData.exclusionsText}
                                        onChange={handleChange}
                                        placeholder={"Hotel accommodation\nEntrance fees\nActivity fees"}
                                    ></textarea>
                                    <small className="text-muted">Add one exclusion per line.</small>
                                </div>

                                <div className="col-12">
                                    <label className="form-label fw-semibold">Image URL</label>
                                    <input
                                        type="text"
                                        name="imageUrl"
                                        className="form-control"
                                        value={formData.imageUrl}
                                        onChange={handleChange}
                                        placeholder="https://example.com/tour.jpg"
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
                                            id="isFeatured"
                                        />
                                        <label className="form-check-label" htmlFor="isFeatured">
                                            Featured package
                                        </label>
                                    </div>
                                </div>

                                <div className="col-12">
                                    <div className="d-flex justify-content-between align-items-center mb-2">
                                        <label className="form-label fw-semibold mb-0">
                                            Itinerary
                                        </label>
                                        <button
                                            type="button"
                                            className="btn btn-sm btn-outline-primary"
                                            onClick={addItineraryDay}
                                        >
                                            Add Day
                                        </button>
                                    </div>

                                    {formData.itinerary.map((dayItem, index) => (
                                        <div
                                            className="border rounded-3 p-3 mb-3 bg-light"
                                            key={index}
                                        >
                                            <div className="row g-2">
                                                <div className="col-12 col-md-2">
                                                    <label className="form-label">Day</label>
                                                    <input
                                                        type="number"
                                                        className="form-control"
                                                        value={dayItem.day}
                                                        onChange={(e) =>
                                                            handleItineraryChange(index, "day", e.target.value)
                                                        }
                                                    />
                                                </div>

                                                <div className="col-12 col-md-10">
                                                    <label className="form-label">Title</label>
                                                    <input
                                                        type="text"
                                                        className="form-control"
                                                        value={dayItem.title}
                                                        onChange={(e) =>
                                                            handleItineraryChange(
                                                                index,
                                                                "title",
                                                                e.target.value
                                                            )
                                                        }
                                                        placeholder="Arrival and Negombo"
                                                    />
                                                </div>

                                                <div className="col-12">
                                                    <label className="form-label">Description</label>
                                                    <textarea
                                                        className="form-control"
                                                        rows="2"
                                                        value={dayItem.description}
                                                        onChange={(e) =>
                                                            handleItineraryChange(
                                                                index,
                                                                "description",
                                                                e.target.value
                                                            )
                                                        }
                                                        placeholder="Describe the day plan..."
                                                    ></textarea>
                                                </div>

                                                <div className="col-12 text-end">
                                                    <button
                                                        type="button"
                                                        className="btn btn-sm btn-outline-danger"
                                                        onClick={() => removeItineraryDay(index)}
                                                    >
                                                        Remove Day
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="d-flex gap-2 mt-4">
                                <PermissionGuard permission="package.manage">
                                    <button
                                        type="submit"
                                        className="btn btn-primary"
                                        disabled={formLoading}
                                    >
                                        {formLoading
                                            ? "Saving..."
                                            : editingId
                                                ? "Update Package"
                                                : "Save Package"}
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
                                        placeholder="Search package..."
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
                        <h5 className="fw-bold mb-0">Package List</h5>
                        <small className="text-muted">Total: {totalPackages} packages</small>
                    </div>

                    {loading ? (
                        <p className="text-muted">Loading packages...</p>
                    ) : packages.length === 0 ? (
                        <p className="text-muted mb-0">No packages found.</p>
                    ) : (
                        <div className="table-responsive">
                            <table className="table align-middle">
                                <thead>
                                <tr>
                                    <th>Package</th>
                                    <th>Duration</th>
                                    <th>Category</th>
                                    <th>Price</th>
                                    <th>Featured</th>
                                    <th>Status</th>
                                    <th className="text-end">Actions</th>
                                </tr>
                                </thead>

                                <tbody>
                                {packages.map((tourPackage) => (
                                    <tr key={tourPackage._id}>
                                        <td>
                                            <div>
                                                <h6 className="mb-1">{tourPackage.title}</h6>
                                                <small className="text-muted">
                                                    {tourPackage.destinations?.length || 0} destinations
                                                </small>
                                            </div>
                                        </td>

                                        <td>{tourPackage.durationDays} days</td>

                                        <td>
                        <span className="badge text-bg-light">
                          {tourPackage.category}
                        </span>
                                        </td>

                                        <td>
                                            {tourPackage.currency} {tourPackage.priceFrom}
                                        </td>

                                        <td>
                                            {tourPackage.isFeatured ? (
                                                <span className="badge text-bg-success">Yes</span>
                                            ) : (
                                                <span className="badge text-bg-secondary">No</span>
                                            )}
                                        </td>

                                        <td>
                                            {tourPackage.status === "Active" ? (
                                                <span className="badge text-bg-success">Active</span>
                                            ) : (
                                                <span className="badge text-bg-warning">Inactive</span>
                                            )}
                                        </td>

                                        <td className="text-end">
                                            <PermissionGuard permission="package.manage">
                                                <button
                                                    className="btn btn-sm btn-outline-primary me-2"
                                                    onClick={() => handleEdit(tourPackage)}
                                                >
                                                    <FaEdit />
                                                </button>
                                            </PermissionGuard>

                                            <PermissionGuard permission="package.manage">
                                                <button
                                                    className="btn btn-sm btn-outline-danger"
                                                    onClick={() => handleDelete(tourPackage._id)}
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

export default Packages;