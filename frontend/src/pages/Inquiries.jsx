import { useEffect, useState } from "react";
import { FaEdit, FaPlus, FaSearch, FaTrash } from "react-icons/fa";
import api from "../api/axios";

const initialFormState = {
    fullName: "",
    email: "",
    whatsappNumber: "",
    country: "",
    travelDate: "",
    numberOfTravelers: 1,
    interestedPackage: "",
    message: "",
    status: "New",
    priority: "Medium",
    source: "Website",
    adminNotes: "",
};

const Inquiries = () => {
    const [inquiries, setInquiries] = useState([]);
    const [packages, setPackages] = useState([]);

    const [formData, setFormData] = useState(initialFormState);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState(null);

    const [searchInput, setSearchInput] = useState("");
    const [keyword, setKeyword] = useState("");
    const [status, setStatus] = useState("");
    const [priority, setPriority] = useState("");
    const [source, setSource] = useState("");

    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalInquiries, setTotalInquiries] = useState(0);

    const [loading, setLoading] = useState(false);
    const [formLoading, setFormLoading] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    const statusOptions = ["New", "Contacted", "Follow Up", "Converted", "Cancelled"];
    const priorityOptions = ["Low", "Medium", "High"];
    const sourceOptions = ["Website", "Facebook", "Instagram", "WhatsApp", "Referral", "Other"];

    const fetchPackages = async () => {
        try {
            const response = await api.get("/packages", {
                params: {
                    limit: 100,
                    status: "Active",
                },
            });

            setPackages(response.data.packages || []);
        } catch (err) {
            console.error("Failed to load packages", err);
        }
    };

    const fetchInquiries = async () => {
        try {
            setLoading(true);
            setError("");

            const params = {
                page,
                limit: 5,
            };

            if (keyword) params.keyword = keyword;
            if (status) params.status = status;
            if (priority) params.priority = priority;
            if (source) params.source = source;

            const response = await api.get("/inquiries", { params });

            setInquiries(response.data.inquiries || []);
            setTotalPages(response.data.totalPages || 1);
            setTotalInquiries(response.data.totalInquiries || 0);
        } catch (err) {
            setError(err.response?.data?.message || "Failed to load inquiries");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPackages();
    }, []);

    useEffect(() => {
        fetchInquiries();
    }, [page, keyword, status, priority, source]);

    const formatDateInput = (dateValue) => {
        if (!dateValue) return "";
        return new Date(dateValue).toISOString().split("T")[0];
    };

    const handleChange = (e) => {
        const { name, value } = e.target;

        setFormData((prev) => ({
            ...prev,
            [name]: value,
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
                ...formData,
                numberOfTravelers: Number(formData.numberOfTravelers),
                interestedPackage: formData.interestedPackage || null,
                travelDate: formData.travelDate || null,
            };

            if (editingId) {
                await api.put(`/inquiries/${editingId}`, payload);
                setSuccess("Inquiry updated successfully");
            } else {
                await api.post("/inquiries", payload);
                setSuccess("Inquiry added successfully");
            }

            resetForm();
            fetchInquiries();
        } catch (err) {
            setError(err.response?.data?.message || "Failed to save inquiry");
        } finally {
            setFormLoading(false);
        }
    };

    const handleEdit = (inquiry) => {
        setEditingId(inquiry._id);

        setFormData({
            fullName: inquiry.fullName || "",
            email: inquiry.email || "",
            whatsappNumber: inquiry.whatsappNumber || "",
            country: inquiry.country || "",
            travelDate: formatDateInput(inquiry.travelDate),
            numberOfTravelers: inquiry.numberOfTravelers || 1,
            interestedPackage: inquiry.interestedPackage?._id || "",
            message: inquiry.message || "",
            status: inquiry.status || "New",
            priority: inquiry.priority || "Medium",
            source: inquiry.source || "Website",
            adminNotes: inquiry.adminNotes || "",
        });

        setShowForm(true);
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    const handleDelete = async (id) => {
        const confirmDelete = window.confirm(
            "Are you sure you want to delete this inquiry?"
        );

        if (!confirmDelete) return;

        try {
            setError("");
            setSuccess("");

            await api.delete(`/inquiries/${id}`);

            setSuccess("Inquiry deleted successfully");
            fetchInquiries();
        } catch (err) {
            setError(err.response?.data?.message || "Failed to delete inquiry");
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
        setStatus("");
        setPriority("");
        setSource("");
        setPage(1);
    };

    return (
        <div>
            <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-4 gap-3">
                <div>
                    <h2 className="fw-bold mb-1">Inquiries</h2>
                    <p className="text-muted mb-0">
                        Manage customer leads from website, WhatsApp, Facebook, and referrals.
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
                    Add Inquiry
                </button>
            </div>

            {error && <div className="alert alert-danger">{error}</div>}
            {success && <div className="alert alert-success">{success}</div>}

            {showForm && (
                <div className="card border-0 shadow-sm rounded-4 mb-4">
                    <div className="card-body">
                        <h5 className="fw-bold mb-3">
                            {editingId ? "Edit Inquiry" : "Add New Inquiry"}
                        </h5>

                        <form onSubmit={handleSubmit}>
                            <div className="row g-3">
                                <div className="col-12 col-md-6">
                                    <label className="form-label fw-semibold">Full Name</label>
                                    <input
                                        type="text"
                                        name="fullName"
                                        className="form-control"
                                        value={formData.fullName}
                                        onChange={handleChange}
                                        placeholder="John Smith"
                                        required
                                    />
                                </div>

                                <div className="col-12 col-md-6">
                                    <label className="form-label fw-semibold">Email</label>
                                    <input
                                        type="email"
                                        name="email"
                                        className="form-control"
                                        value={formData.email}
                                        onChange={handleChange}
                                        placeholder="john@example.com"
                                        required
                                    />
                                </div>

                                <div className="col-12 col-md-6">
                                    <label className="form-label fw-semibold">WhatsApp Number</label>
                                    <input
                                        type="text"
                                        name="whatsappNumber"
                                        className="form-control"
                                        value={formData.whatsappNumber}
                                        onChange={handleChange}
                                        placeholder="+14155550123"
                                        required
                                    />
                                </div>

                                <div className="col-12 col-md-6">
                                    <label className="form-label fw-semibold">Country</label>
                                    <input
                                        type="text"
                                        name="country"
                                        className="form-control"
                                        value={formData.country}
                                        onChange={handleChange}
                                        placeholder="United States"
                                        required
                                    />
                                </div>

                                <div className="col-12 col-md-4">
                                    <label className="form-label fw-semibold">Travel Date</label>
                                    <input
                                        type="date"
                                        name="travelDate"
                                        className="form-control"
                                        value={formData.travelDate}
                                        onChange={handleChange}
                                    />
                                </div>

                                <div className="col-12 col-md-4">
                                    <label className="form-label fw-semibold">Travelers</label>
                                    <input
                                        type="number"
                                        name="numberOfTravelers"
                                        className="form-control"
                                        value={formData.numberOfTravelers}
                                        onChange={handleChange}
                                        min="1"
                                    />
                                </div>

                                <div className="col-12 col-md-4">
                                    <label className="form-label fw-semibold">Source</label>
                                    <select
                                        name="source"
                                        className="form-select"
                                        value={formData.source}
                                        onChange={handleChange}
                                    >
                                        {sourceOptions.map((item) => (
                                            <option key={item} value={item}>
                                                {item}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="col-12">
                                    <label className="form-label fw-semibold">
                                        Interested Package
                                    </label>
                                    <select
                                        name="interestedPackage"
                                        className="form-select"
                                        value={formData.interestedPackage}
                                        onChange={handleChange}
                                    >
                                        <option value="">No package selected</option>
                                        {packages.map((tourPackage) => (
                                            <option key={tourPackage._id} value={tourPackage._id}>
                                                {tourPackage.title} - {tourPackage.durationDays} days
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="col-12 col-md-6">
                                    <label className="form-label fw-semibold">Status</label>
                                    <select
                                        name="status"
                                        className="form-select"
                                        value={formData.status}
                                        onChange={handleChange}
                                    >
                                        {statusOptions.map((item) => (
                                            <option key={item} value={item}>
                                                {item}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="col-12 col-md-6">
                                    <label className="form-label fw-semibold">Priority</label>
                                    <select
                                        name="priority"
                                        className="form-select"
                                        value={formData.priority}
                                        onChange={handleChange}
                                    >
                                        {priorityOptions.map((item) => (
                                            <option key={item} value={item}>
                                                {item}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="col-12">
                                    <label className="form-label fw-semibold">Customer Message</label>
                                    <textarea
                                        name="message"
                                        className="form-control"
                                        rows="4"
                                        value={formData.message}
                                        onChange={handleChange}
                                        placeholder="Customer inquiry message..."
                                        required
                                    ></textarea>
                                </div>

                                <div className="col-12">
                                    <label className="form-label fw-semibold">Admin Notes</label>
                                    <textarea
                                        name="adminNotes"
                                        className="form-control"
                                        rows="3"
                                        value={formData.adminNotes}
                                        onChange={handleChange}
                                        placeholder="Internal follow-up notes..."
                                    ></textarea>
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
                                            ? "Update Inquiry"
                                            : "Save Inquiry"}
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
                                        placeholder="Search name, email, country, message..."
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
                                value={status}
                                onChange={(e) => {
                                    setPage(1);
                                    setStatus(e.target.value);
                                }}
                            >
                                <option value="">All Status</option>
                                {statusOptions.map((item) => (
                                    <option key={item} value={item}>
                                        {item}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="col-12 col-md-4 col-lg-2">
                            <select
                                className="form-select"
                                value={priority}
                                onChange={(e) => {
                                    setPage(1);
                                    setPriority(e.target.value);
                                }}
                            >
                                <option value="">All Priority</option>
                                {priorityOptions.map((item) => (
                                    <option key={item} value={item}>
                                        {item}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="col-12 col-md-4 col-lg-2">
                            <select
                                className="form-select"
                                value={source}
                                onChange={(e) => {
                                    setPage(1);
                                    setSource(e.target.value);
                                }}
                            >
                                <option value="">All Sources</option>
                                {sourceOptions.map((item) => (
                                    <option key={item} value={item}>
                                        {item}
                                    </option>
                                ))}
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
                        <h5 className="fw-bold mb-0">Inquiry List</h5>
                        <small className="text-muted">Total: {totalInquiries} inquiries</small>
                    </div>

                    {loading ? (
                        <p className="text-muted">Loading inquiries...</p>
                    ) : inquiries.length === 0 ? (
                        <p className="text-muted mb-0">No inquiries found.</p>
                    ) : (
                        <div className="table-responsive">
                            <table className="table align-middle">
                                <thead>
                                <tr>
                                    <th>Customer</th>
                                    <th>Country</th>
                                    <th>Travel Date</th>
                                    <th>Package</th>
                                    <th>Status</th>
                                    <th>Priority</th>
                                    <th>Source</th>
                                    <th className="text-end">Actions</th>
                                </tr>
                                </thead>

                                <tbody>
                                {inquiries.map((inquiry) => (
                                    <tr key={inquiry._id}>
                                        <td>
                                            <div>
                                                <h6 className="mb-1">{inquiry.fullName}</h6>
                                                <small className="text-muted">
                                                    {inquiry.email}
                                                    <br />
                                                    {inquiry.whatsappNumber}
                                                </small>
                                            </div>
                                        </td>

                                        <td>{inquiry.country}</td>

                                        <td>
                                            {inquiry.travelDate
                                                ? new Date(inquiry.travelDate).toLocaleDateString()
                                                : "Not set"}
                                        </td>

                                        <td>
                                            {inquiry.interestedPackage?.title || (
                                                <span className="text-muted">No package</span>
                                            )}
                                        </td>

                                        <td>
                                            <StatusBadge status={inquiry.status} />
                                        </td>

                                        <td>
                                            <PriorityBadge priority={inquiry.priority} />
                                        </td>

                                        <td>
                                            <span className="badge text-bg-light">{inquiry.source}</span>
                                        </td>

                                        <td className="text-end">
                                            <button
                                                className="btn btn-sm btn-outline-primary me-2"
                                                onClick={() => handleEdit(inquiry)}
                                            >
                                                <FaEdit />
                                            </button>

                                            <button
                                                className="btn btn-sm btn-outline-danger"
                                                onClick={() => handleDelete(inquiry._id)}
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

const StatusBadge = ({ status }) => {
    const className =
        status === "New"
            ? "text-bg-primary"
            : status === "Contacted"
                ? "text-bg-info"
                : status === "Follow Up"
                    ? "text-bg-warning"
                    : status === "Converted"
                        ? "text-bg-success"
                        : "text-bg-secondary";

    return <span className={`badge ${className}`}>{status}</span>;
};

const PriorityBadge = ({ priority }) => {
    const className =
        priority === "High"
            ? "text-bg-danger"
            : priority === "Medium"
                ? "text-bg-warning"
                : "text-bg-secondary";

    return <span className={`badge ${className}`}>{priority}</span>;
};

export default Inquiries;