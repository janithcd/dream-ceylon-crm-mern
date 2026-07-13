import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
    FaBell,
    FaCheckCircle,
    FaEdit,
    FaExclamationTriangle,
    FaPlus,
    FaSearch,
    FaSyncAlt,
    FaTrash,
} from "react-icons/fa";
import api from "../api/axios";

const initialFormState = {
    title: "",
    type: "General",
    inquiry: "",
    quotation: "",
    booking: "",
    customerName: "",
    customerContact: "",
    followUpDate: new Date().toISOString().split("T")[0],
    priority: "Medium",
    status: "Pending",
    notes: "",
};

const typeOptions = [
    "General",
    "Inquiry",
    "Quotation",
    "Booking",
    "Payment",
    "Client Call",
    "WhatsApp",
    "Email",
];

const priorityOptions = ["Low", "Medium", "High", "Urgent"];

const statusOptions = ["Pending", "Completed", "Cancelled"];

const dateFilterOptions = [
    {
        label: "All",
        value: "",
    },
    {
        label: "Today",
        value: "today",
    },
    {
        label: "Overdue",
        value: "overdue",
    },
    {
        label: "Upcoming",
        value: "upcoming",
    },
];

const formatDate = (value) => {
    if (!value) {
        return "-";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "-";
    }

    return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
    });
};

const formatDateInput = (value) => {
    if (!value) {
        return "";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "";
    }

    return date.toISOString().split("T")[0];
};

const getIdValue = (value) => {
    if (!value) {
        return "";
    }

    if (typeof value === "string") {
        return value;
    }

    return value._id || "";
};

const getPriorityBadgeClass = (priority) => {
    switch (priority) {
        case "Urgent":
            return "text-bg-danger";
        case "High":
            return "text-bg-warning";
        case "Medium":
            return "text-bg-primary";
        case "Low":
            return "text-bg-secondary";
        default:
            return "text-bg-secondary";
    }
};

const getStatusBadgeClass = (status) => {
    switch (status) {
        case "Completed":
            return "text-bg-success";
        case "Cancelled":
            return "text-bg-danger";
        case "Pending":
            return "text-bg-warning";
        default:
            return "text-bg-secondary";
    }
};

const getDateStatus = (followUpDate, status) => {
    if (status !== "Pending") {
        return {
            label: status,
            className: status === "Completed" ? "text-success" : "text-danger",
        };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const date = new Date(followUpDate);
    date.setHours(0, 0, 0, 0);

    if (date < today) {
        return {
            label: "Overdue",
            className: "text-danger",
        };
    }

    if (date.getTime() === today.getTime()) {
        return {
            label: "Today",
            className: "text-success",
        };
    }

    return {
        label: "Upcoming",
        className: "text-muted",
    };
};

const SummaryCard = ({ title, value, subtitle, icon, variant = "success" }) => {
    return (
        <div className="stat-card h-100">
            <div>
                <p className="text-muted mb-1">{title}</p>
                <h3 className={`fw-bold mb-1 text-${variant}`}>{value}</h3>
                <small className="text-muted">{subtitle}</small>
            </div>

            <div className="stat-icon">{icon}</div>
        </div>
    );
};

const FollowUps = () => {
    const [searchParams] = useSearchParams();

    const inquiryParam = searchParams.get("inquiry");
    const quotationParam = searchParams.get("quotation");
    const bookingParam = searchParams.get("booking");

    const prefillKey = `${inquiryParam || ""}|${quotationParam || ""}|${
        bookingParam || ""
    }`;

    const [appliedPrefillKey, setAppliedPrefillKey] = useState("");

    const [followUps, setFollowUps] = useState([]);
    const [summary, setSummary] = useState({
        totalPending: 0,
        today: 0,
        overdue: 0,
        upcoming: 0,
        completed: 0,
        urgent: 0,
    });

    const [inquiries, setInquiries] = useState([]);
    const [quotations, setQuotations] = useState([]);
    const [bookings, setBookings] = useState([]);

    const [formData, setFormData] = useState(initialFormState);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState(null);

    const [searchInput, setSearchInput] = useState("");
    const [keyword, setKeyword] = useState("");
    const [status, setStatus] = useState("");
    const [priority, setPriority] = useState("");
    const [type, setType] = useState("");
    const [dateFilter, setDateFilter] = useState("");

    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalFollowUps, setTotalFollowUps] = useState(0);

    const [loading, setLoading] = useState(false);
    const [formLoading, setFormLoading] = useState(false);
    const [completeLoadingId, setCompleteLoadingId] = useState("");
    const [deleteLoadingId, setDeleteLoadingId] = useState("");

    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    const selectedLinkType = useMemo(() => {
        if (formData.inquiry) {
            return "Inquiry";
        }

        if (formData.quotation) {
            return "Quotation";
        }

        if (formData.booking) {
            return "Booking";
        }

        return "";
    }, [formData.inquiry, formData.quotation, formData.booking]);

    const fetchSummary = async () => {
        try {
            const response = await api.get("/follow-ups/summary");
            setSummary(response.data || {});
        } catch (err) {
            console.error("Failed to load follow-up summary", err);
        }
    };

    const fetchFollowUps = async () => {
        try {
            setLoading(true);
            setError("");

            const params = {
                page,
                limit: 10,
            };

            if (keyword) {
                params.keyword = keyword;
            }

            if (status) {
                params.status = status;
            }

            if (priority) {
                params.priority = priority;
            }

            if (type) {
                params.type = type;
            }

            if (dateFilter) {
                params.dateFilter = dateFilter;
            }

            const response = await api.get("/follow-ups", { params });

            setFollowUps(response.data.followUps || []);
            setTotalPages(response.data.totalPages || 1);
            setTotalFollowUps(response.data.totalFollowUps || 0);
        } catch (err) {
            setError(
                err.response?.data?.message ||
                err.response?.data?.error ||
                "Failed to load follow-ups."
            );
        } finally {
            setLoading(false);
        }
    };

    const fetchInquiries = async () => {
        try {
            const response = await api.get("/inquiries", {
                params: {
                    limit: 100,
                },
            });

            setInquiries(response.data.inquiries || []);
        } catch (err) {
            console.error("Failed to load inquiries", err);
        }
    };

    const fetchQuotations = async () => {
        try {
            const response = await api.get("/quotations", {
                params: {
                    limit: 100,
                },
            });

            setQuotations(response.data.quotations || []);
        } catch (err) {
            console.error("Failed to load quotations", err);
        }
    };

    const fetchBookings = async () => {
        try {
            const response = await api.get("/bookings", {
                params: {
                    limit: 100,
                },
            });

            setBookings(response.data.bookings || []);
        } catch (err) {
            console.error("Failed to load bookings", err);
        }
    };

    useEffect(() => {
        fetchInquiries();
        fetchQuotations();
        fetchBookings();
        fetchSummary();
    }, []);

    useEffect(() => {
        fetchFollowUps();
        fetchSummary();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page, keyword, status, priority, type, dateFilter]);

    useEffect(() => {
        if (!inquiryParam && !quotationParam && !bookingParam) {
            return;
        }

        if (appliedPrefillKey === prefillKey) {
            return;
        }

        if (inquiryParam) {
            const selectedInquiry = inquiries.find(
                (item) => item._id === inquiryParam
            );

            if (!selectedInquiry && inquiries.length === 0) {
                return;
            }

            setEditingId(null);
            setShowForm(true);

            setFormData({
                ...initialFormState,
                title: selectedInquiry
                    ? `Follow up with ${selectedInquiry.fullName}`
                    : "Follow up inquiry",
                type: "Inquiry",
                inquiry: inquiryParam,
                quotation: "",
                booking: "",
                customerName: selectedInquiry?.fullName || "",
                customerContact:
                    selectedInquiry?.whatsappNumber || selectedInquiry?.email || "",
                followUpDate: new Date().toISOString().split("T")[0],
                priority: "Medium",
                status: "Pending",
                notes: selectedInquiry?.message
                    ? `Inquiry message: ${selectedInquiry.message}`
                    : "",
            });

            setAppliedPrefillKey(prefillKey);
            return;
        }

        if (quotationParam) {
            const selectedQuotation = quotations.find(
                (item) => item._id === quotationParam
            );

            if (!selectedQuotation && quotations.length === 0) {
                return;
            }

            setEditingId(null);
            setShowForm(true);

            setFormData({
                ...initialFormState,
                title: selectedQuotation
                    ? `Follow up quotation ${selectedQuotation.quotationNo}`
                    : "Follow up quotation",
                type: "Quotation",
                inquiry: "",
                quotation: quotationParam,
                booking: "",
                customerName:
                    selectedQuotation?.clientName ||
                    selectedQuotation?.inquiry?.fullName ||
                    "",
                customerContact:
                    selectedQuotation?.inquiry?.whatsappNumber ||
                    selectedQuotation?.inquiry?.email ||
                    "",
                followUpDate: new Date().toISOString().split("T")[0],
                priority: "High",
                status: "Pending",
                notes: selectedQuotation?.tourTitle
                    ? `Quotation follow-up for: ${selectedQuotation.tourTitle}`
                    : "",
            });

            setAppliedPrefillKey(prefillKey);
            return;
        }

        if (bookingParam) {
            const selectedBooking = bookings.find((item) => item._id === bookingParam);

            if (!selectedBooking && bookings.length === 0) {
                return;
            }

            setEditingId(null);
            setShowForm(true);

            setFormData({
                ...initialFormState,
                title: selectedBooking
                    ? `Follow up booking ${selectedBooking.bookingCode}`
                    : "Follow up booking",
                type: "Booking",
                inquiry: "",
                quotation: "",
                booking: bookingParam,
                customerName: selectedBooking?.customer?.fullName || "",
                customerContact:
                    selectedBooking?.customer?.whatsappNumber ||
                    selectedBooking?.customer?.email ||
                    "",
                followUpDate: new Date().toISOString().split("T")[0],
                priority: "High",
                status: "Pending",
                notes: selectedBooking
                    ? `Booking follow-up for ${selectedBooking.bookingCode}`
                    : "",
            });

            setAppliedPrefillKey(prefillKey);
        }
    }, [
        inquiryParam,
        quotationParam,
        bookingParam,
        prefillKey,
        appliedPrefillKey,
        inquiries,
        quotations,
        bookings,
    ]);

    const resetForm = () => {
        setFormData(initialFormState);
        setEditingId(null);
        setShowForm(false);
    };

    const refreshAll = () => {
        fetchFollowUps();
        fetchSummary();
    };

    const handleChange = (e) => {
        const { name, value } = e.target;

        setFormData((prev) => ({
            ...prev,
            [name]: value,
        }));
    };

    const handleInquirySelect = (e) => {
        const inquiryId = e.target.value;
        const selectedInquiry = inquiries.find((item) => item._id === inquiryId);

        setFormData((prev) => ({
            ...prev,
            inquiry: inquiryId,
            quotation: "",
            booking: "",
            type: inquiryId ? "Inquiry" : prev.type,
            customerName: selectedInquiry?.fullName || prev.customerName,
            customerContact:
                selectedInquiry?.whatsappNumber ||
                selectedInquiry?.email ||
                prev.customerContact,
        }));
    };

    const handleQuotationSelect = (e) => {
        const quotationId = e.target.value;
        const selectedQuotation = quotations.find((item) => item._id === quotationId);

        setFormData((prev) => ({
            ...prev,
            inquiry: "",
            quotation: quotationId,
            booking: "",
            type: quotationId ? "Quotation" : prev.type,
            customerName:
                selectedQuotation?.clientName ||
                selectedQuotation?.inquiry?.fullName ||
                prev.customerName,
            customerContact:
                selectedQuotation?.inquiry?.whatsappNumber ||
                selectedQuotation?.inquiry?.email ||
                prev.customerContact,
        }));
    };

    const handleBookingSelect = (e) => {
        const bookingId = e.target.value;
        const selectedBooking = bookings.find((item) => item._id === bookingId);

        setFormData((prev) => ({
            ...prev,
            inquiry: "",
            quotation: "",
            booking: bookingId,
            type: bookingId ? "Booking" : prev.type,
            customerName: selectedBooking?.customer?.fullName || prev.customerName,
            customerContact:
                selectedBooking?.customer?.whatsappNumber ||
                selectedBooking?.customer?.email ||
                prev.customerContact,
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        try {
            setFormLoading(true);
            setError("");
            setSuccess("");

            const payload = {
                ...formData,
                inquiry: formData.inquiry || null,
                quotation: formData.quotation || null,
                booking: formData.booking || null,
            };

            if (editingId) {
                await api.put(`/follow-ups/${editingId}`, payload);
                setSuccess("Follow-up updated successfully.");
            } else {
                await api.post("/follow-ups", payload);
                setSuccess("Follow-up created successfully.");
            }

            resetForm();
            refreshAll();
        } catch (err) {
            setError(
                err.response?.data?.message ||
                err.response?.data?.error ||
                "Failed to save follow-up."
            );
        } finally {
            setFormLoading(false);
        }
    };

    const handleEdit = (followUp) => {
        setEditingId(followUp._id);

        setFormData({
            title: followUp.title || "",
            type: followUp.type || "General",
            inquiry: getIdValue(followUp.inquiry),
            quotation: getIdValue(followUp.quotation),
            booking: getIdValue(followUp.booking),
            customerName: followUp.customerName || "",
            customerContact: followUp.customerContact || "",
            followUpDate: formatDateInput(followUp.followUpDate),
            priority: followUp.priority || "Medium",
            status: followUp.status || "Pending",
            notes: followUp.notes || "",
        });

        setShowForm(true);
        window.scrollTo({
            top: 0,
            behavior: "smooth",
        });
    };

    const handleComplete = async (followUp) => {
        const confirmComplete = window.confirm("Mark this follow-up as completed?");

        if (!confirmComplete) {
            return;
        }

        try {
            setCompleteLoadingId(followUp._id);
            setError("");
            setSuccess("");

            await api.patch(`/follow-ups/${followUp._id}/complete`, {
                notes: followUp.notes,
            });

            setSuccess("Follow-up marked as completed.");
            refreshAll();
        } catch (err) {
            setError(
                err.response?.data?.message ||
                err.response?.data?.error ||
                "Failed to complete follow-up."
            );
        } finally {
            setCompleteLoadingId("");
        }
    };

    const handleDelete = async (followUpId) => {
        const confirmDelete = window.confirm(
            "Are you sure you want to delete this follow-up?"
        );

        if (!confirmDelete) {
            return;
        }

        try {
            setDeleteLoadingId(followUpId);
            setError("");
            setSuccess("");

            await api.delete(`/follow-ups/${followUpId}`);

            setSuccess("Follow-up deleted successfully.");
            refreshAll();
        } catch (err) {
            setError(
                err.response?.data?.message ||
                err.response?.data?.error ||
                "Failed to delete follow-up."
            );
        } finally {
            setDeleteLoadingId("");
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
        setType("");
        setDateFilter("");
        setPage(1);
    };

    return (
        <div>
            <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-4 gap-3">
                <div>
                    <h2 className="fw-bold mb-1">Follow-Up Reminders</h2>
                    <p className="text-muted mb-0">
                        Track client follow-ups, quotation reminders, booking confirmations,
                        and payment reminders.
                    </p>
                </div>

                <div className="d-flex gap-2">
                    <button className="btn btn-outline-success" onClick={refreshAll}>
                        <FaSyncAlt className="me-2" />
                        Refresh
                    </button>

                    <button
                        className="btn btn-primary"
                        onClick={() => {
                            setShowForm((prev) => !prev);
                            setEditingId(null);
                            setFormData(initialFormState);
                        }}
                    >
                        <FaPlus className="me-2" />
                        Add Follow-Up
                    </button>
                </div>
            </div>

            <div className="row g-4 mb-4">
                <div className="col-xl-2 col-md-4 col-sm-6">
                    <SummaryCard
                        title="Today"
                        value={summary.today || 0}
                        subtitle="pending today"
                        icon={<FaBell />}
                        variant="success"
                    />
                </div>

                <div className="col-xl-2 col-md-4 col-sm-6">
                    <SummaryCard
                        title="Overdue"
                        value={summary.overdue || 0}
                        subtitle="need attention"
                        icon={<FaExclamationTriangle />}
                        variant="danger"
                    />
                </div>

                <div className="col-xl-2 col-md-4 col-sm-6">
                    <SummaryCard
                        title="Upcoming"
                        value={summary.upcoming || 0}
                        subtitle="future reminders"
                        icon={<FaBell />}
                        variant="primary"
                    />
                </div>

                <div className="col-xl-2 col-md-4 col-sm-6">
                    <SummaryCard
                        title="Urgent"
                        value={summary.urgent || 0}
                        subtitle="urgent pending"
                        icon={<FaExclamationTriangle />}
                        variant="warning"
                    />
                </div>

                <div className="col-xl-2 col-md-4 col-sm-6">
                    <SummaryCard
                        title="Pending"
                        value={summary.totalPending || 0}
                        subtitle="all pending"
                        icon={<FaBell />}
                        variant="secondary"
                    />
                </div>

                <div className="col-xl-2 col-md-4 col-sm-6">
                    <SummaryCard
                        title="Completed"
                        value={summary.completed || 0}
                        subtitle="finished"
                        icon={<FaCheckCircle />}
                        variant="success"
                    />
                </div>
            </div>

            {error && <div className="alert alert-danger">{error}</div>}
            {success && <div className="alert alert-success">{success}</div>}

            {showForm && (
                <div className="card border-0 shadow-sm rounded-4 mb-4">
                    <div className="card-body">
                        <h5 className="fw-bold mb-3">
                            {editingId ? "Edit Follow-Up" : "Add New Follow-Up"}
                        </h5>

                        <form onSubmit={handleSubmit}>
                            <div className="row g-3">
                                <div className="col-12 col-lg-8">
                                    <label className="form-label fw-semibold">Title</label>
                                    <input
                                        type="text"
                                        name="title"
                                        className="form-control"
                                        value={formData.title}
                                        onChange={handleChange}
                                        placeholder="Example: Follow up quotation acceptance"
                                        required
                                    />
                                </div>

                                <div className="col-12 col-lg-4">
                                    <label className="form-label fw-semibold">Type</label>
                                    <select
                                        name="type"
                                        className="form-select"
                                        value={formData.type}
                                        onChange={handleChange}
                                    >
                                        {typeOptions.map((item) => (
                                            <option key={item} value={item}>
                                                {item}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="col-12">
                                    <h6 className="fw-bold mt-2 mb-0">Link With CRM Record</h6>
                                    <small className="text-muted">
                                        Select one record type only. Customer details will auto-fill.
                                    </small>
                                </div>

                                <div className="col-12 col-md-4">
                                    <label className="form-label fw-semibold">Inquiry</label>
                                    <select
                                        className="form-select"
                                        value={formData.inquiry}
                                        onChange={handleInquirySelect}
                                    >
                                        <option value="">No inquiry selected</option>
                                        {inquiries.map((inquiry) => (
                                            <option key={inquiry._id} value={inquiry._id}>
                                                {inquiry.fullName} - {inquiry.country} -{" "}
                                                {inquiry.status}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="col-12 col-md-4">
                                    <label className="form-label fw-semibold">Quotation</label>
                                    <select
                                        className="form-select"
                                        value={formData.quotation}
                                        onChange={handleQuotationSelect}
                                    >
                                        <option value="">No quotation selected</option>
                                        {quotations.map((quotation) => (
                                            <option key={quotation._id} value={quotation._id}>
                                                {quotation.quotationNo} -{" "}
                                                {quotation.clientName || "Client"} - {quotation.status}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="col-12 col-md-4">
                                    <label className="form-label fw-semibold">Booking</label>
                                    <select
                                        className="form-select"
                                        value={formData.booking}
                                        onChange={handleBookingSelect}
                                    >
                                        <option value="">No booking selected</option>
                                        {bookings.map((booking) => (
                                            <option key={booking._id} value={booking._id}>
                                                {booking.bookingCode} -{" "}
                                                {booking.customer?.fullName || "Client"} -{" "}
                                                {booking.bookingStatus}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {selectedLinkType && (
                                    <div className="col-12">
                                        <div className="alert alert-info py-2 mb-0">
                                            Linked with: <strong>{selectedLinkType}</strong>
                                        </div>
                                    </div>
                                )}

                                <div className="col-12">
                                    <h6 className="fw-bold mt-2 mb-0">Customer Details</h6>
                                </div>

                                <div className="col-12 col-md-6">
                                    <label className="form-label fw-semibold">
                                        Customer Name
                                    </label>
                                    <input
                                        type="text"
                                        name="customerName"
                                        className="form-control"
                                        value={formData.customerName}
                                        onChange={handleChange}
                                        placeholder="Client name"
                                    />
                                </div>

                                <div className="col-12 col-md-6">
                                    <label className="form-label fw-semibold">
                                        Customer Contact
                                    </label>
                                    <input
                                        type="text"
                                        name="customerContact"
                                        className="form-control"
                                        value={formData.customerContact}
                                        onChange={handleChange}
                                        placeholder="WhatsApp or email"
                                    />
                                </div>

                                <div className="col-12">
                                    <h6 className="fw-bold mt-2 mb-0">Reminder Details</h6>
                                </div>

                                <div className="col-12 col-md-4">
                                    <label className="form-label fw-semibold">
                                        Follow-Up Date
                                    </label>
                                    <input
                                        type="date"
                                        name="followUpDate"
                                        className="form-control"
                                        value={formData.followUpDate}
                                        onChange={handleChange}
                                        required
                                    />
                                </div>

                                <div className="col-12 col-md-4">
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

                                <div className="col-12 col-md-4">
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

                                <div className="col-12">
                                    <label className="form-label fw-semibold">Notes</label>
                                    <textarea
                                        name="notes"
                                        className="form-control"
                                        rows="3"
                                        value={formData.notes}
                                        onChange={handleChange}
                                        placeholder="Example: Client said they will confirm after discussing with family."
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
                                            ? "Update Follow-Up"
                                            : "Save Follow-Up"}
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
                        <div className="col-12 col-lg-4">
                            <form onSubmit={handleSearch}>
                                <div className="input-group">
                                    <input
                                        type="text"
                                        className="form-control"
                                        placeholder="Search title, client, contact, notes..."
                                        value={searchInput}
                                        onChange={(e) => setSearchInput(e.target.value)}
                                    />
                                    <button className="btn btn-primary" type="submit">
                                        <FaSearch />
                                    </button>
                                </div>
                            </form>
                        </div>

                        <div className="col-12 col-md-3 col-lg-2">
                            <select
                                className="form-select"
                                value={dateFilter}
                                onChange={(e) => {
                                    setPage(1);
                                    setDateFilter(e.target.value);
                                }}
                            >
                                {dateFilterOptions.map((item) => (
                                    <option key={item.value || "all"} value={item.value}>
                                        {item.label}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="col-12 col-md-3 col-lg-2">
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

                        <div className="col-12 col-md-3 col-lg-2">
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

                        <div className="col-12 col-md-3 col-lg-1">
                            <select
                                className="form-select"
                                value={type}
                                onChange={(e) => {
                                    setPage(1);
                                    setType(e.target.value);
                                }}
                            >
                                <option value="">All Type</option>
                                {typeOptions.map((item) => (
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
                        <h5 className="fw-bold mb-0">Follow-Up List</h5>
                        <small className="text-muted">
                            Total: {totalFollowUps} reminders
                        </small>
                    </div>

                    {loading ? (
                        <p className="text-muted">Loading follow-ups...</p>
                    ) : followUps.length === 0 ? (
                        <div className="text-center py-5 border rounded-4">
                            <FaBell className="text-muted mb-3" size={32} />
                            <h6 className="fw-bold">No follow-ups found</h6>
                            <p className="text-muted mb-0">
                                Add a reminder to follow up with clients.
                            </p>
                        </div>
                    ) : (
                        <div className="table-responsive">
                            <table className="table align-middle">
                                <thead>
                                <tr>
                                    <th>Reminder</th>
                                    <th>Client</th>
                                    <th>Date</th>
                                    <th>Type</th>
                                    <th>Priority</th>
                                    <th>Status</th>
                                    <th>Linked Record</th>
                                    <th className="text-end">Actions</th>
                                </tr>
                                </thead>

                                <tbody>
                                {followUps.map((followUp) => {
                                    const dateStatus = getDateStatus(
                                        followUp.followUpDate,
                                        followUp.status
                                    );

                                    return (
                                        <tr key={followUp._id}>
                                            <td>
                                                <h6 className="mb-1">{followUp.title}</h6>
                                                {followUp.notes && (
                                                    <small className="text-muted">
                                                        {followUp.notes}
                                                    </small>
                                                )}
                                            </td>

                                            <td>
                                                <h6 className="mb-1">
                                                    {followUp.customerName || "-"}
                                                </h6>
                                                <small className="text-muted">
                                                    {followUp.customerContact || "-"}
                                                </small>
                                            </td>

                                            <td>
                                                <strong>{formatDate(followUp.followUpDate)}</strong>
                                                <br />
                                                <small className={dateStatus.className}>
                                                    {dateStatus.label}
                                                </small>
                                            </td>

                                            <td>{followUp.type}</td>

                                            <td>
                          <span
                              className={`badge ${getPriorityBadgeClass(
                                  followUp.priority
                              )}`}
                          >
                            {followUp.priority}
                          </span>
                                            </td>

                                            <td>
                          <span
                              className={`badge ${getStatusBadgeClass(
                                  followUp.status
                              )}`}
                          >
                            {followUp.status}
                          </span>
                                            </td>

                                            <td>
                                                {followUp.inquiry && (
                                                    <small className="d-block">
                                                        Inquiry: {followUp.inquiry.fullName}
                                                    </small>
                                                )}

                                                {followUp.quotation && (
                                                    <small className="d-block">
                                                        Quotation: {followUp.quotation.quotationNo}
                                                    </small>
                                                )}

                                                {followUp.booking && (
                                                    <small className="d-block">
                                                        Booking: {followUp.booking.bookingCode}
                                                    </small>
                                                )}

                                                {!followUp.inquiry &&
                                                    !followUp.quotation &&
                                                    !followUp.booking && (
                                                        <small className="text-muted">General</small>
                                                    )}
                                            </td>

                                            <td className="text-end">
                                                <div className="d-flex justify-content-end gap-2">
                                                    {followUp.status === "Pending" && (
                                                        <button
                                                            className="btn btn-sm btn-outline-success"
                                                            onClick={() => handleComplete(followUp)}
                                                            disabled={completeLoadingId === followUp._id}
                                                            title="Mark completed"
                                                        >
                                                            <FaCheckCircle />
                                                        </button>
                                                    )}

                                                    <button
                                                        className="btn btn-sm btn-outline-primary"
                                                        onClick={() => handleEdit(followUp)}
                                                        title="Edit follow-up"
                                                    >
                                                        <FaEdit />
                                                    </button>

                                                    <button
                                                        className="btn btn-sm btn-outline-danger"
                                                        onClick={() => handleDelete(followUp._id)}
                                                        disabled={deleteLoadingId === followUp._id}
                                                        title="Delete follow-up"
                                                    >
                                                        <FaTrash />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
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

export default FollowUps;