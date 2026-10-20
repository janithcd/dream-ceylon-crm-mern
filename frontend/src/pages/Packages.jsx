import { useEffect, useState } from "react";
import {
    FaClock,
    FaEdit,
    FaMapMarkerAlt,
    FaPlus,
    FaSearch,
    FaTrash,
} from "react-icons/fa";
import api from "../api/axios";
import PermissionGuard from "../components/PermissionGuard";

const TOUR_TYPES = ["Multi-Day Tour", "Day Tour"];

const CATEGORIES = [
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

const PRICING_BASES = [
    "Starting Price",
    "Per Person",
    "Per Group",
    "Custom Quote",
];

const createInitialFormState = () => ({
    title: "",
    tourType: "Multi-Day Tour",
    durationDays: 1,
    durationHours: 8,
    category: "Other",
    overview: "",
    highlightsText: "",
    destinations: [],
    startLocation: "",
    endLocation: "",
    pickupAvailable: false,
    pickupDetails: "",
    startTime: "",
    returnTime: "",
    priceFrom: 0,
    currency: "USD",
    pricingBasis: "Starting Price",
    minTravelers: 1,
    maxTravelers: "",
    inclusionsText: "",
    exclusionsText: "",
    itinerary: [{ day: 1, title: "", description: "" }],
    imageUrl: "",
    isFeatured: false,
    status: "Active",
});

const Packages = () => {
    const [packages, setPackages] = useState([]);
    const [destinations, setDestinations] = useState([]);

    const [formData, setFormData] = useState(createInitialFormState());
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState(null);

    const [searchInput, setSearchInput] = useState("");
    const [keyword, setKeyword] = useState("");
    const [tourTypeFilter, setTourTypeFilter] = useState("");
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
            if (tourTypeFilter) params.tourType = tourTypeFilter;
            if (category) params.category = category;
            if (status) params.status = status;
            if (isFeatured !== "") params.isFeatured = isFeatured;

            const response = await api.get("/packages", { params });

            setPackages(response.data.packages || []);
            setTotalPages(Math.max(response.data.totalPages || 1, 1));
            setTotalPackages(response.data.totalPackages || 0);
        } catch (err) {
            setError(
                err.response?.data?.message || "Failed to load packages"
            );
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDestinations();
    }, []);

    useEffect(() => {
        fetchPackages();
    }, [
        page,
        keyword,
        tourTypeFilter,
        category,
        status,
        isFeatured,
    ]);

    const textToArray = (text) => {
        return String(text || "")
            .split("\n")
            .map((item) => item.trim())
            .filter((item) => item.length > 0);
    };

    const arrayToText = (array) => {
        return Array.isArray(array) ? array.join("\n") : "";
    };

    const getResolvedTourType = (tourPackage) => {
        return tourPackage.tourType || "Multi-Day Tour";
    };

    const getDurationLabel = (tourPackage) => {
        const resolvedTourType = getResolvedTourType(tourPackage);

        if (resolvedTourType === "Day Tour") {
            const hours = Number(tourPackage.durationHours || 0);

            return hours > 0
                ? `${hours} hour${hours === 1 ? "" : "s"}`
                : "Full day";
        }

        const days = Number(tourPackage.durationDays || 1);
        return `${days} day${days === 1 ? "" : "s"}`;
    };

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        const resolvedValue = type === "checkbox" ? checked : value;

        setFormData((prev) => {
            const nextState = {
                ...prev,
                [name]: resolvedValue,
            };

            if (name === "tourType") {
                if (value === "Day Tour") {
                    nextState.durationDays = 1;
                    nextState.durationHours = prev.durationHours || 8;

                    if (!prev.itinerary?.length) {
                        nextState.itinerary = [
                            { day: 1, title: "", description: "" },
                        ];
                    }
                } else {
                    nextState.durationDays = prev.durationDays || 1;
                    nextState.durationHours = "";
                    nextState.pickupAvailable = false;
                    nextState.pickupDetails = "";
                    nextState.startLocation = "";
                    nextState.endLocation = "";
                    nextState.startTime = "";
                    nextState.returnTime = "";
                }
            }

            if (name === "pickupAvailable" && !checked) {
                nextState.pickupDetails = "";
            }

            return nextState;
        });
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

    const addItineraryItem = () => {
        setFormData((prev) => ({
            ...prev,
            itinerary: [
                ...prev.itinerary,
                {
                    day:
                        prev.tourType === "Day Tour"
                            ? 1
                            : prev.itinerary.length + 1,
                    title: "",
                    description: "",
                },
            ],
        }));
    };

    const removeItineraryItem = (index) => {
        const updatedItinerary = formData.itinerary.filter(
            (_, itemIndex) => itemIndex !== index
        );

        setFormData((prev) => ({
            ...prev,
            itinerary:
                updatedItinerary.length > 0
                    ? updatedItinerary
                    : [{ day: 1, title: "", description: "" }],
        }));
    };

    const resetForm = () => {
        setFormData(createInitialFormState());
        setEditingId(null);
        setShowForm(false);
    };

    const openCreateForm = () => {
        setError("");
        setSuccess("");
        setEditingId(null);
        setFormData(createInitialFormState());
        setShowForm(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        const minTravelers = Number(formData.minTravelers || 1);
        const maxTravelers =
            formData.maxTravelers === "" ||
            formData.maxTravelers === null
                ? null
                : Number(formData.maxTravelers);

        if (
            formData.tourType === "Day Tour" &&
            (!Number(formData.durationHours) ||
                Number(formData.durationHours) < 1 ||
                Number(formData.durationHours) > 24)
        ) {
            setError("Day tour duration must be between 1 and 24 hours");
            return;
        }

        if (maxTravelers !== null && maxTravelers < minTravelers) {
            setError(
                "Maximum travellers cannot be lower than minimum travellers"
            );
            return;
        }

        try {
            setFormLoading(true);
            setError("");
            setSuccess("");

            const payload = {
                title: formData.title.trim(),
                tourType: formData.tourType,
                durationDays:
                    formData.tourType === "Day Tour"
                        ? 1
                        : Number(formData.durationDays),
                durationHours:
                    formData.tourType === "Day Tour"
                        ? Number(formData.durationHours)
                        : null,
                category: formData.category,
                overview: formData.overview.trim(),
                highlights: textToArray(formData.highlightsText),
                destinations: formData.destinations,
                startLocation:
                    formData.tourType === "Day Tour"
                        ? formData.startLocation.trim()
                        : "",
                endLocation:
                    formData.tourType === "Day Tour"
                        ? formData.endLocation.trim()
                        : "",
                pickupAvailable:
                    formData.tourType === "Day Tour"
                        ? formData.pickupAvailable
                        : false,
                pickupDetails:
                    formData.tourType === "Day Tour" &&
                    formData.pickupAvailable
                        ? formData.pickupDetails.trim()
                        : "",
                startTime:
                    formData.tourType === "Day Tour"
                        ? formData.startTime
                        : "",
                returnTime:
                    formData.tourType === "Day Tour"
                        ? formData.returnTime
                        : "",
                priceFrom: Number(formData.priceFrom),
                currency: formData.currency,
                pricingBasis: formData.pricingBasis,
                minTravelers,
                maxTravelers,
                inclusions: textToArray(formData.inclusionsText),
                exclusions: textToArray(formData.exclusionsText),
                itinerary: formData.itinerary
                    .filter(
                        (item) =>
                            item.title.trim() && item.description.trim()
                    )
                    .map((item) => ({
                        day:
                            formData.tourType === "Day Tour"
                                ? 1
                                : Number(item.day),
                        title: item.title.trim(),
                        description: item.description.trim(),
                    })),
                imageUrl: formData.imageUrl.trim(),
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
            setError(
                err.response?.data?.message || "Failed to save package"
            );
        } finally {
            setFormLoading(false);
        }
    };

    const handleEdit = (tourPackage) => {
        const resolvedTourType = getResolvedTourType(tourPackage);

        setEditingId(tourPackage._id);
        setError("");
        setSuccess("");

        setFormData({
            title: tourPackage.title || "",
            tourType: resolvedTourType,
            durationDays: tourPackage.durationDays || 1,
            durationHours:
                tourPackage.durationHours ??
                (resolvedTourType === "Day Tour" ? 8 : ""),
            category: tourPackage.category || "Other",
            overview: tourPackage.overview || "",
            highlightsText: arrayToText(tourPackage.highlights),
            destinations:
                tourPackage.destinations?.map((destination) =>
                    typeof destination === "string"
                        ? destination
                        : destination._id
                ) || [],
            startLocation: tourPackage.startLocation || "",
            endLocation: tourPackage.endLocation || "",
            pickupAvailable: Boolean(tourPackage.pickupAvailable),
            pickupDetails: tourPackage.pickupDetails || "",
            startTime: tourPackage.startTime || "",
            returnTime: tourPackage.returnTime || "",
            priceFrom: tourPackage.priceFrom ?? 0,
            currency: tourPackage.currency || "USD",
            pricingBasis: tourPackage.pricingBasis || "Starting Price",
            minTravelers: tourPackage.minTravelers || 1,
            maxTravelers: tourPackage.maxTravelers ?? "",
            inclusionsText: arrayToText(tourPackage.inclusions),
            exclusionsText: arrayToText(tourPackage.exclusions),
            itinerary:
                tourPackage.itinerary?.length > 0
                    ? tourPackage.itinerary.map((item) => ({
                        day: item.day || 1,
                        title: item.title || "",
                        description: item.description || "",
                    }))
                    : [{ day: 1, title: "", description: "" }],
            imageUrl: tourPackage.imageUrl || "",
            isFeatured: Boolean(tourPackage.isFeatured),
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
            setError(
                err.response?.data?.message || "Failed to delete package"
            );
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
        setTourTypeFilter("");
        setCategory("");
        setStatus("");
        setIsFeatured("");
        setPage(1);
    };

    const isDayTour = formData.tourType === "Day Tour";

    return (
        <div>
            <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-4 gap-3">
                <div>
                    <h2 className="fw-bold mb-1">Tour Packages</h2>
                    <p className="text-muted mb-0">
                        Manage multi-day Sri Lanka tours and private day tours
                        from one place.
                    </p>
                </div>

                <PermissionGuard permission="package.manage">
                    <button
                        className="btn btn-primary"
                        onClick={openCreateForm}
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
                    <div className="card-body p-3 p-lg-4">
                        <div className="d-flex flex-column flex-md-row justify-content-between gap-2 mb-3">
                            <div>
                                <h5 className="fw-bold mb-1">
                                    {editingId
                                        ? "Edit Tour Package"
                                        : "Add New Tour Package"}
                                </h5>
                                <p className="small text-muted mb-0">
                                    Choose Day Tour to display the additional
                                    pickup, timing, and location fields.
                                </p>
                            </div>

                            <span
                                className={`badge align-self-start px-3 py-2 ${
                                    isDayTour
                                        ? "text-bg-warning"
                                        : "text-bg-primary"
                                }`}
                            >
                                {formData.tourType}
                            </span>
                        </div>

                        <form onSubmit={handleSubmit}>
                            <div className="row g-3">
                                <div className="col-12 col-lg-8">
                                    <label className="form-label fw-semibold">
                                        Package Title
                                    </label>
                                    <input
                                        type="text"
                                        name="title"
                                        className="form-control"
                                        value={formData.title}
                                        onChange={handleChange}
                                        placeholder={
                                            isDayTour
                                                ? "Sigiriya and Dambulla Day Tour"
                                                : "14 Days Sri Lanka Round Tour"
                                        }
                                        required
                                    />
                                </div>

                                <div className="col-12 col-lg-4">
                                    <label className="form-label fw-semibold">
                                        Tour Type
                                    </label>
                                    <select
                                        name="tourType"
                                        className="form-select"
                                        value={formData.tourType}
                                        onChange={handleChange}
                                    >
                                        {TOUR_TYPES.map((item) => (
                                            <option key={item} value={item}>
                                                {item}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="col-12 col-md-4">
                                    <label className="form-label fw-semibold">
                                        {isDayTour
                                            ? "Duration Hours"
                                            : "Duration Days"}
                                    </label>

                                    {isDayTour ? (
                                        <input
                                            type="number"
                                            name="durationHours"
                                            className="form-control"
                                            value={formData.durationHours}
                                            onChange={handleChange}
                                            min="1"
                                            max="24"
                                            required
                                        />
                                    ) : (
                                        <input
                                            type="number"
                                            name="durationDays"
                                            className="form-control"
                                            value={formData.durationDays}
                                            onChange={handleChange}
                                            min="1"
                                            required
                                        />
                                    )}
                                </div>

                                <div className="col-12 col-md-4">
                                    <label className="form-label fw-semibold">
                                        Category
                                    </label>
                                    <select
                                        name="category"
                                        className="form-select"
                                        value={formData.category}
                                        onChange={handleChange}
                                    >
                                        {CATEGORIES.map((item) => (
                                            <option key={item} value={item}>
                                                {item}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="col-12 col-md-4">
                                    <label className="form-label fw-semibold">
                                        Status
                                    </label>
                                    <select
                                        name="status"
                                        className="form-select"
                                        value={formData.status}
                                        onChange={handleChange}
                                    >
                                        <option value="Active">Active</option>
                                        <option value="Inactive">
                                            Inactive
                                        </option>
                                    </select>
                                </div>

                                <div className="col-12 col-md-6 col-xl-3">
                                    <label className="form-label fw-semibold">
                                        Price From
                                    </label>
                                    <input
                                        type="number"
                                        name="priceFrom"
                                        className="form-control"
                                        value={formData.priceFrom}
                                        onChange={handleChange}
                                        min="0"
                                        step="0.01"
                                        required
                                    />
                                </div>

                                <div className="col-12 col-md-6 col-xl-3">
                                    <label className="form-label fw-semibold">
                                        Currency
                                    </label>
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

                                <div className="col-12 col-md-6 col-xl-3">
                                    <label className="form-label fw-semibold">
                                        Pricing Basis
                                    </label>
                                    <select
                                        name="pricingBasis"
                                        className="form-select"
                                        value={formData.pricingBasis}
                                        onChange={handleChange}
                                    >
                                        {PRICING_BASES.map((item) => (
                                            <option key={item} value={item}>
                                                {item}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="col-6 col-md-3 col-xl-1">
                                    <label className="form-label fw-semibold">
                                        Min
                                    </label>
                                    <input
                                        type="number"
                                        name="minTravelers"
                                        className="form-control"
                                        value={formData.minTravelers}
                                        onChange={handleChange}
                                        min="1"
                                        required
                                    />
                                </div>

                                <div className="col-6 col-md-3 col-xl-2">
                                    <label className="form-label fw-semibold">
                                        Max Travellers
                                    </label>
                                    <input
                                        type="number"
                                        name="maxTravelers"
                                        className="form-control"
                                        value={formData.maxTravelers}
                                        onChange={handleChange}
                                        min="1"
                                        placeholder="Optional"
                                    />
                                </div>

                                <div className="col-12">
                                    <label className="form-label fw-semibold">
                                        Overview
                                    </label>
                                    <textarea
                                        name="overview"
                                        className="form-control"
                                        rows="4"
                                        value={formData.overview}
                                        onChange={handleChange}
                                        placeholder="Write a clear customer-facing tour overview..."
                                        required
                                    />
                                </div>

                                <div className="col-12">
                                    <label className="form-label fw-semibold">
                                        Highlights
                                    </label>
                                    <textarea
                                        name="highlightsText"
                                        className="form-control"
                                        rows="5"
                                        value={formData.highlightsText}
                                        onChange={handleChange}
                                        placeholder={
                                            "Sigiriya Rock Fortress\nDambulla Cave Temple\nTraditional village experience"
                                        }
                                    />
                                    <small className="text-muted">
                                        Add one highlight per line.
                                    </small>
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
                                        style={{ minHeight: "170px" }}
                                    >
                                        {destinations.map((destination) => (
                                            <option
                                                key={destination._id}
                                                value={destination._id}
                                            >
                                                {destination.name} - {" "}
                                                {destination.category}
                                            </option>
                                        ))}
                                    </select>
                                    <small className="text-muted">
                                        Hold Ctrl and click to select multiple
                                        destinations.
                                    </small>
                                </div>

                                {isDayTour && (
                                    <div className="col-12">
                                        <div className="border rounded-4 p-3 p-lg-4 bg-light-subtle">
                                            <div className="d-flex align-items-center gap-2 mb-3">
                                                <FaMapMarkerAlt className="text-primary" />
                                                <div>
                                                    <h6 className="fw-bold mb-0">
                                                        Day Tour Logistics
                                                    </h6>
                                                    <small className="text-muted">
                                                        These details appear on
                                                        the day-tour page.
                                                    </small>
                                                </div>
                                            </div>

                                            <div className="row g-3">
                                                <div className="col-12 col-md-6">
                                                    <label className="form-label fw-semibold">
                                                        Starting Location
                                                    </label>
                                                    <input
                                                        type="text"
                                                        name="startLocation"
                                                        className="form-control"
                                                        value={
                                                            formData.startLocation
                                                        }
                                                        onChange={handleChange}
                                                        placeholder="Colombo / Negombo"
                                                    />
                                                </div>

                                                <div className="col-12 col-md-6">
                                                    <label className="form-label fw-semibold">
                                                        Ending Location
                                                    </label>
                                                    <input
                                                        type="text"
                                                        name="endLocation"
                                                        className="form-control"
                                                        value={
                                                            formData.endLocation
                                                        }
                                                        onChange={handleChange}
                                                        placeholder="Return to Colombo"
                                                    />
                                                </div>

                                                <div className="col-12 col-md-6">
                                                    <label className="form-label fw-semibold">
                                                        Suggested Start Time
                                                    </label>
                                                    <div className="input-group">
                                                        <span className="input-group-text">
                                                            <FaClock />
                                                        </span>
                                                        <input
                                                            type="time"
                                                            name="startTime"
                                                            className="form-control"
                                                            value={
                                                                formData.startTime
                                                            }
                                                            onChange={handleChange}
                                                        />
                                                    </div>
                                                </div>

                                                <div className="col-12 col-md-6">
                                                    <label className="form-label fw-semibold">
                                                        Estimated Return Time
                                                    </label>
                                                    <div className="input-group">
                                                        <span className="input-group-text">
                                                            <FaClock />
                                                        </span>
                                                        <input
                                                            type="time"
                                                            name="returnTime"
                                                            className="form-control"
                                                            value={
                                                                formData.returnTime
                                                            }
                                                            onChange={handleChange}
                                                        />
                                                    </div>
                                                </div>

                                                <div className="col-12">
                                                    <div className="form-check form-switch">
                                                        <input
                                                            className="form-check-input"
                                                            type="checkbox"
                                                            name="pickupAvailable"
                                                            checked={
                                                                formData.pickupAvailable
                                                            }
                                                            onChange={handleChange}
                                                            id="pickupAvailable"
                                                        />
                                                        <label
                                                            className="form-check-label fw-semibold"
                                                            htmlFor="pickupAvailable"
                                                        >
                                                            Hotel pickup is
                                                            available
                                                        </label>
                                                    </div>
                                                </div>

                                                {formData.pickupAvailable && (
                                                    <div className="col-12">
                                                        <label className="form-label fw-semibold">
                                                            Pickup Details
                                                        </label>
                                                        <textarea
                                                            name="pickupDetails"
                                                            className="form-control"
                                                            rows="3"
                                                            value={
                                                                formData.pickupDetails
                                                            }
                                                            onChange={handleChange}
                                                            placeholder="Pickup is available from selected Colombo and Negombo hotels. Additional distance charges may apply."
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <div className="col-12 col-md-6">
                                    <label className="form-label fw-semibold">
                                        Inclusions
                                    </label>
                                    <textarea
                                        name="inclusionsText"
                                        className="form-control"
                                        rows="6"
                                        value={formData.inclusionsText}
                                        onChange={handleChange}
                                        placeholder={
                                            "Licensed chauffeur guide\nA/C vehicle\nBottled water"
                                        }
                                    />
                                    <small className="text-muted">
                                        Add one inclusion per line.
                                    </small>
                                </div>

                                <div className="col-12 col-md-6">
                                    <label className="form-label fw-semibold">
                                        Exclusions
                                    </label>
                                    <textarea
                                        name="exclusionsText"
                                        className="form-control"
                                        rows="6"
                                        value={formData.exclusionsText}
                                        onChange={handleChange}
                                        placeholder={
                                            "Entrance fees\nMeals\nPersonal expenses"
                                        }
                                    />
                                    <small className="text-muted">
                                        Add one exclusion per line.
                                    </small>
                                </div>

                                <div className="col-12">
                                    <label className="form-label fw-semibold">
                                        Image URL
                                    </label>
                                    <input
                                        type="text"
                                        name="imageUrl"
                                        className="form-control"
                                        value={formData.imageUrl}
                                        onChange={handleChange}
                                        placeholder="/uploads/tours/sigiriya-day-tour.webp"
                                    />
                                </div>

                                <div className="col-12">
                                    <div className="form-check form-switch">
                                        <input
                                            className="form-check-input"
                                            type="checkbox"
                                            name="isFeatured"
                                            checked={formData.isFeatured}
                                            onChange={handleChange}
                                            id="isFeatured"
                                        />
                                        <label
                                            className="form-check-label fw-semibold"
                                            htmlFor="isFeatured"
                                        >
                                            Feature this {" "}
                                            {isDayTour
                                                ? "day tour"
                                                : "tour package"}
                                        </label>
                                    </div>
                                </div>

                                <div className="col-12">
                                    <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-2 mb-2">
                                        <div>
                                            <label className="form-label fw-semibold mb-0">
                                                {isDayTour
                                                    ? "Day Tour Programme"
                                                    : "Itinerary"}
                                            </label>
                                            <div className="small text-muted">
                                                {isDayTour
                                                    ? "Add the main stops or activity stages in their correct order."
                                                    : "Add one itinerary block for each tour day."}
                                            </div>
                                        </div>

                                        <button
                                            type="button"
                                            className="btn btn-sm btn-outline-primary"
                                            onClick={addItineraryItem}
                                        >
                                            <FaPlus className="me-1" />
                                            {isDayTour
                                                ? "Add Programme Item"
                                                : "Add Day"}
                                        </button>
                                    </div>

                                    {formData.itinerary.map(
                                        (dayItem, index) => (
                                            <div
                                                className="border rounded-3 p-3 mb-3 bg-light"
                                                key={index}
                                            >
                                                <div className="row g-2">
                                                    {!isDayTour && (
                                                        <div className="col-12 col-md-2">
                                                            <label className="form-label">
                                                                Day
                                                            </label>
                                                            <input
                                                                type="number"
                                                                className="form-control"
                                                                value={
                                                                    dayItem.day
                                                                }
                                                                min="1"
                                                                onChange={(e) =>
                                                                    handleItineraryChange(
                                                                        index,
                                                                        "day",
                                                                        e.target
                                                                            .value
                                                                    )
                                                                }
                                                            />
                                                        </div>
                                                    )}

                                                    <div
                                                        className={
                                                            isDayTour
                                                                ? "col-12"
                                                                : "col-12 col-md-10"
                                                        }
                                                    >
                                                        <label className="form-label">
                                                            {isDayTour
                                                                ? `Programme Item ${
                                                                    index + 1
                                                                } Title`
                                                                : "Title"}
                                                        </label>
                                                        <input
                                                            type="text"
                                                            className="form-control"
                                                            value={
                                                                dayItem.title
                                                            }
                                                            onChange={(e) =>
                                                                handleItineraryChange(
                                                                    index,
                                                                    "title",
                                                                    e.target
                                                                        .value
                                                                )
                                                            }
                                                            placeholder={
                                                                isDayTour
                                                                    ? "Visit Sigiriya Rock Fortress"
                                                                    : "Arrival and Negombo"
                                                            }
                                                        />
                                                    </div>

                                                    <div className="col-12">
                                                        <label className="form-label">
                                                            Description
                                                        </label>
                                                        <textarea
                                                            className="form-control"
                                                            rows="3"
                                                            value={
                                                                dayItem.description
                                                            }
                                                            onChange={(e) =>
                                                                handleItineraryChange(
                                                                    index,
                                                                    "description",
                                                                    e.target
                                                                        .value
                                                                )
                                                            }
                                                            placeholder={
                                                                isDayTour
                                                                    ? "Describe this stop, visit, or activity..."
                                                                    : "Describe the day plan..."
                                                            }
                                                        />
                                                    </div>

                                                    <div className="col-12 text-end">
                                                        <button
                                                            type="button"
                                                            className="btn btn-sm btn-outline-danger"
                                                            onClick={() =>
                                                                removeItineraryItem(
                                                                    index
                                                                )
                                                            }
                                                        >
                                                            Remove {" "}
                                                            {isDayTour
                                                                ? "Item"
                                                                : "Day"}
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    )}
                                </div>
                            </div>

                            <div className="d-flex flex-wrap gap-2 mt-4">
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
                                    disabled={formLoading}
                                >
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <div className="card border-0 shadow-sm rounded-4">
                <div className="card-body p-3 p-lg-4">
                    <div className="row g-3 mb-4">
                        <div className="col-12 col-xl-3">
                            <form onSubmit={handleSearch}>
                                <div className="input-group">
                                    <input
                                        type="text"
                                        className="form-control"
                                        placeholder="Search package..."
                                        value={searchInput}
                                        onChange={(e) =>
                                            setSearchInput(e.target.value)
                                        }
                                    />
                                    <button
                                        className="btn btn-primary"
                                        type="submit"
                                        aria-label="Search packages"
                                    >
                                        <FaSearch />
                                    </button>
                                </div>
                            </form>
                        </div>

                        <div className="col-12 col-md-4 col-xl-2">
                            <select
                                className="form-select"
                                value={tourTypeFilter}
                                onChange={(e) => {
                                    setPage(1);
                                    setTourTypeFilter(e.target.value);
                                }}
                            >
                                <option value="">All Tour Types</option>
                                {TOUR_TYPES.map((item) => (
                                    <option key={item} value={item}>
                                        {item}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="col-12 col-md-4 col-xl-2">
                            <select
                                className="form-select"
                                value={category}
                                onChange={(e) => {
                                    setPage(1);
                                    setCategory(e.target.value);
                                }}
                            >
                                <option value="">All Categories</option>
                                {CATEGORIES.map((item) => (
                                    <option key={item} value={item}>
                                        {item}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="col-12 col-md-4 col-xl-2">
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

                        <div className="col-12 col-md-6 col-xl-2">
                            <select
                                className="form-select"
                                value={isFeatured}
                                onChange={(e) => {
                                    setPage(1);
                                    setIsFeatured(e.target.value);
                                }}
                            >
                                <option value="">All Featured States</option>
                                <option value="true">Featured</option>
                                <option value="false">Not Featured</option>
                            </select>
                        </div>

                        <div className="col-12 col-md-6 col-xl-1">
                            <button
                                type="button"
                                className="btn btn-outline-secondary w-100"
                                onClick={clearFilters}
                            >
                                Clear
                            </button>
                        </div>
                    </div>

                    <div className="d-flex flex-column flex-sm-row justify-content-between align-items-sm-center gap-2 mb-3">
                        <h5 className="fw-bold mb-0">Package List</h5>
                        <small className="text-muted">
                            Total: {totalPackages} package
                            {totalPackages === 1 ? "" : "s"}
                        </small>
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
                                    <th>Type</th>
                                    <th>Duration</th>
                                    <th>Category</th>
                                    <th>Price</th>
                                    <th>Featured</th>
                                    <th>Status</th>
                                    <th className="text-end">Actions</th>
                                </tr>
                                </thead>

                                <tbody>
                                {packages.map((tourPackage) => {
                                    const resolvedTourType =
                                        getResolvedTourType(tourPackage);
                                    const dayTour =
                                        resolvedTourType === "Day Tour";

                                    return (
                                        <tr key={tourPackage._id}>
                                            <td style={{ minWidth: "220px" }}>
                                                <div>
                                                    <h6 className="mb-1">
                                                        {tourPackage.title}
                                                    </h6>
                                                    <small className="text-muted">
                                                        {tourPackage
                                                            .destinations
                                                            ?.length || 0}{" "}
                                                        destination
                                                        {(tourPackage
                                                            .destinations
                                                            ?.length || 0) ===
                                                        1
                                                            ? ""
                                                            : "s"}
                                                    </small>
                                                </div>
                                            </td>

                                            <td>
                                                    <span
                                                        className={`badge ${
                                                            dayTour
                                                                ? "text-bg-warning"
                                                                : "text-bg-primary"
                                                        }`}
                                                    >
                                                        {resolvedTourType}
                                                    </span>
                                            </td>

                                            <td>{getDurationLabel(tourPackage)}</td>

                                            <td>
                                                    <span className="badge text-bg-light">
                                                        {tourPackage.category}
                                                    </span>
                                            </td>

                                            <td style={{ minWidth: "130px" }}>
                                                <div className="fw-semibold">
                                                    {tourPackage.currency}{" "}
                                                    {tourPackage.priceFrom}
                                                </div>
                                                <small className="text-muted">
                                                    {tourPackage.pricingBasis ||
                                                        "Starting Price"}
                                                </small>
                                            </td>

                                            <td>
                                                {tourPackage.isFeatured ? (
                                                    <span className="badge text-bg-success">
                                                            Yes
                                                        </span>
                                                ) : (
                                                    <span className="badge text-bg-secondary">
                                                            No
                                                        </span>
                                                )}
                                            </td>

                                            <td>
                                                {tourPackage.status ===
                                                "Active" ? (
                                                    <span className="badge text-bg-success">
                                                            Active
                                                        </span>
                                                ) : (
                                                    <span className="badge text-bg-warning">
                                                            Inactive
                                                        </span>
                                                )}
                                            </td>

                                            <td className="text-end text-nowrap">
                                                <PermissionGuard permission="package.manage">
                                                    <button
                                                        type="button"
                                                        className="btn btn-sm btn-outline-primary me-2"
                                                        onClick={() =>
                                                            handleEdit(
                                                                tourPackage
                                                            )
                                                        }
                                                        aria-label={`Edit ${tourPackage.title}`}
                                                    >
                                                        <FaEdit />
                                                    </button>
                                                </PermissionGuard>

                                                <PermissionGuard permission="package.manage">
                                                    <button
                                                        type="button"
                                                        className="btn btn-sm btn-outline-danger"
                                                        onClick={() =>
                                                            handleDelete(
                                                                tourPackage._id
                                                            )
                                                        }
                                                        aria-label={`Delete ${tourPackage.title}`}
                                                    >
                                                        <FaTrash />
                                                    </button>
                                                </PermissionGuard>
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
                            type="button"
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
                            type="button"
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
