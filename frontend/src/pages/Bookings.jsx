import { useEffect, useState } from "react";
import {
    FaEdit,
    FaPlus,
    FaSearch,
    FaTrash,
    FaFileInvoiceDollar,
    FaReceipt,
    FaWallet,
} from "react-icons/fa";
import api from "../api/axios";
import BookingPaymentsModal from "../components/BookingPaymentsModal";

const initialFormState = {
    inquiry: "",
    customer: {
        fullName: "",
        email: "",
        whatsappNumber: "",
        country: "",
    },
    selectedPackage: "",
    travelStartDate: "",
    travelEndDate: "",
    numberOfTravelers: 1,
    vehicleType: "Car",
    totalPrice: 0,
    currency: "USD",
    advancePayment: 0,
    paymentStatus: "Pending",
    bookingStatus: "Pending",
    specialRequests: "",
    adminNotes: "",
};

const Bookings = () => {
    const [bookings, setBookings] = useState([]);
    const [inquiries, setInquiries] = useState([]);
    const [packages, setPackages] = useState([]);

    const [formData, setFormData] = useState(initialFormState);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [selectedPaymentBooking, setSelectedPaymentBooking] = useState(null);


    const [searchInput, setSearchInput] = useState("");
    const [keyword, setKeyword] = useState("");
    const [bookingStatus, setBookingStatus] = useState("");
    const [paymentStatus, setPaymentStatus] = useState("");
    const [vehicleType, setVehicleType] = useState("");

    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalBookings, setTotalBookings] = useState(0);

    const [loading, setLoading] = useState(false);
    const [formLoading, setFormLoading] = useState(false);
    const [pdfLoadingKey, setPdfLoadingKey] = useState("");

    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    const vehicleOptions = ["Car", "SUV", "Van", "Mini Bus", "Other"];

    const bookingStatusOptions = [
        "Pending",
        "Confirmed",
        "In Progress",
        "Completed",
        "Cancelled",
    ];

    const paymentStatusOptions = [
        "Pending",
        "Partially Paid",
        "Paid",
        "Refunded",
    ];

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

    const fetchBookings = async () => {
        try {
            setLoading(true);
            setError("");

            const params = {
                page,
                limit: 5,
            };

            if (keyword) {
                params.keyword = keyword;
            }

            if (bookingStatus) {
                params.bookingStatus = bookingStatus;
            }

            if (paymentStatus) {
                params.paymentStatus = paymentStatus;
            }

            if (vehicleType) {
                params.vehicleType = vehicleType;
            }

            const response = await api.get("/bookings", { params });

            setBookings(response.data.bookings || []);
            setTotalPages(response.data.totalPages || 1);
            setTotalBookings(response.data.totalBookings || 0);
        } catch (err) {
            setError(err.response?.data?.message || "Failed to load bookings");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchInquiries();
        fetchPackages();
    }, []);

    useEffect(() => {
        fetchBookings();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page, keyword, bookingStatus, paymentStatus, vehicleType]);

    const formatDateInput = (dateValue) => {
        if (!dateValue) {
            return "";
        }

        return new Date(dateValue).toISOString().split("T")[0];
    };

    const formatDate = (dateValue) => {
        if (!dateValue) {
            return "-";
        }

        const date = new Date(dateValue);

        if (Number.isNaN(date.getTime())) {
            return "-";
        }

        return date.toLocaleDateString();
    };

    const formatMoney = (amount, currency = "USD") => {
        const number = Number(amount);

        return `${currency} ${(Number.isFinite(number) ? number : 0).toLocaleString(
            "en-US",
            {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
            }
        )}`;
    };

    const handleCustomerChange = (e) => {
        const { name, value } = e.target;

        setFormData((prev) => ({
            ...prev,
            customer: {
                ...prev.customer,
                [name]: value,
            },
        }));
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

        if (!inquiryId) {
            setFormData((prev) => ({
                ...prev,
                inquiry: "",
            }));
            return;
        }

        const selectedInquiry = inquiries.find((item) => item._id === inquiryId);

        setFormData((prev) => ({
            ...prev,
            inquiry: inquiryId,
            customer: {
                fullName: selectedInquiry?.fullName || "",
                email: selectedInquiry?.email || "",
                whatsappNumber: selectedInquiry?.whatsappNumber || "",
                country: selectedInquiry?.country || "",
            },
            selectedPackage: selectedInquiry?.interestedPackage?._id || prev.selectedPackage,
            numberOfTravelers:
                selectedInquiry?.numberOfTravelers || prev.numberOfTravelers,
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
                inquiry: formData.inquiry || null,
                selectedPackage: formData.selectedPackage || null,
                numberOfTravelers: Number(formData.numberOfTravelers),
                totalPrice: Number(formData.totalPrice),
                advancePayment: Number(formData.advancePayment),
            };

            if (editingId) {
                await api.put(`/bookings/${editingId}`, payload);
                setSuccess("Booking updated successfully");
            } else {
                await api.post("/bookings", payload);
                setSuccess("Booking added successfully");
            }

            resetForm();
            fetchBookings();
            fetchInquiries();
        } catch (err) {
            setError(err.response?.data?.message || "Failed to save booking");
        } finally {
            setFormLoading(false);
        }
    };

    const handleEdit = (booking) => {
        setEditingId(booking._id);

        setFormData({
            inquiry: booking.inquiry?._id || "",
            customer: {
                fullName: booking.customer?.fullName || "",
                email: booking.customer?.email || "",
                whatsappNumber: booking.customer?.whatsappNumber || "",
                country: booking.customer?.country || "",
            },
            selectedPackage: booking.selectedPackage?._id || "",
            travelStartDate: formatDateInput(booking.travelStartDate),
            travelEndDate: formatDateInput(booking.travelEndDate),
            numberOfTravelers: booking.numberOfTravelers || 1,
            vehicleType: booking.vehicleType || "Car",
            totalPrice: booking.totalPrice || 0,
            currency: booking.currency || "USD",
            advancePayment: booking.advancePayment || 0,
            paymentStatus: booking.paymentStatus || "Pending",
            bookingStatus: booking.bookingStatus || "Pending",
            specialRequests: booking.specialRequests || "",
            adminNotes: booking.adminNotes || "",
        });

        setShowForm(true);
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    const handleDelete = async (id) => {
        const confirmDelete = window.confirm(
            "Are you sure you want to delete this booking?"
        );

        if (!confirmDelete) {
            return;
        }

        try {
            setError("");
            setSuccess("");

            await api.delete(`/bookings/${id}`);

            setSuccess("Booking deleted successfully");
            fetchBookings();
        } catch (err) {
            setError(err.response?.data?.message || "Failed to delete booking");
        }
    };

    const handleDownloadBookingPdf = async (booking, type) => {
        const loadingKey = `${type}-${booking._id}`;

        try {
            setPdfLoadingKey(loadingKey);
            setError("");
            setSuccess("");

            const endpoint =
                type === "invoice"
                    ? `/booking-pdf/invoice/${booking._id}`
                    : `/booking-pdf/receipt/${booking._id}`;

            const response = await api.post(
                endpoint,
                {},
                {
                    responseType: "blob",
                }
            );

            const blob = new Blob([response.data], {
                type: "application/pdf",
            });

            const fileUrl = window.URL.createObjectURL(blob);
            const link = document.createElement("a");

            const cleanBookingCode =
                booking.bookingCode
                    ?.toLowerCase()
                    .replace(/[^a-z0-9]+/g, "-")
                    .replace(/^-+|-+$/g, "") || "booking";

            link.href = fileUrl;
            link.download =
                type === "invoice"
                    ? `dream-ceylon-invoice-${cleanBookingCode}.pdf`
                    : `dream-ceylon-receipt-${cleanBookingCode}.pdf`;

            document.body.appendChild(link);
            link.click();
            link.remove();

            window.URL.revokeObjectURL(fileUrl);
        } catch (err) {
            let message =
                type === "invoice"
                    ? "Failed to download invoice PDF."
                    : "Failed to download receipt PDF.";

            if (err.response?.data instanceof Blob) {
                const errorText = await err.response.data.text();

                try {
                    const errorJson = JSON.parse(errorText);
                    message = errorJson.error || errorJson.message || message;
                } catch {
                    message = errorText || message;
                }
            } else if (err.response?.data?.message) {
                message = err.response.data.message;
            }

            setError(message);
        } finally {
            setPdfLoadingKey("");
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
        setBookingStatus("");
        setPaymentStatus("");
        setVehicleType("");
        setPage(1);
    };

    return (
        <div>
            <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-4 gap-3">
                <div>
                    <h2 className="fw-bold mb-1">Bookings</h2>
                    <p className="text-muted mb-0">
                        Manage confirmed customers, travel dates, payments, and booking
                        status.
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
                    Add Booking
                </button>
            </div>

            {error && <div className="alert alert-danger">{error}</div>}
            {success && <div className="alert alert-success">{success}</div>}

            {showForm && (
                <div className="card border-0 shadow-sm rounded-4 mb-4">
                    <div className="card-body">
                        <h5 className="fw-bold mb-3">
                            {editingId ? "Edit Booking" : "Add New Booking"}
                        </h5>

                        <form onSubmit={handleSubmit}>
                            <div className="row g-3">
                                <div className="col-12">
                                    <label className="form-label fw-semibold">
                                        Link Existing Inquiry
                                    </label>
                                    <select
                                        name="inquiry"
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
                                    <small className="text-muted">
                                        Selecting an inquiry will auto-fill customer details.
                                    </small>
                                </div>

                                <div className="col-12">
                                    <h6 className="fw-bold mt-2 mb-0">Customer Details</h6>
                                </div>

                                <div className="col-12 col-md-6">
                                    <label className="form-label fw-semibold">Full Name</label>
                                    <input
                                        type="text"
                                        name="fullName"
                                        className="form-control"
                                        value={formData.customer.fullName}
                                        onChange={handleCustomerChange}
                                        required
                                    />
                                </div>

                                <div className="col-12 col-md-6">
                                    <label className="form-label fw-semibold">Email</label>
                                    <input
                                        type="email"
                                        name="email"
                                        className="form-control"
                                        value={formData.customer.email}
                                        onChange={handleCustomerChange}
                                        required
                                    />
                                </div>

                                <div className="col-12 col-md-6">
                                    <label className="form-label fw-semibold">
                                        WhatsApp Number
                                    </label>
                                    <input
                                        type="text"
                                        name="whatsappNumber"
                                        className="form-control"
                                        value={formData.customer.whatsappNumber}
                                        onChange={handleCustomerChange}
                                        required
                                    />
                                </div>

                                <div className="col-12 col-md-6">
                                    <label className="form-label fw-semibold">Country</label>
                                    <input
                                        type="text"
                                        name="country"
                                        className="form-control"
                                        value={formData.customer.country}
                                        onChange={handleCustomerChange}
                                        required
                                    />
                                </div>

                                <div className="col-12">
                                    <h6 className="fw-bold mt-2 mb-0">Tour Details</h6>
                                </div>

                                <div className="col-12 col-md-6">
                                    <label className="form-label fw-semibold">Tour Package</label>
                                    <select
                                        name="selectedPackage"
                                        className="form-select"
                                        value={formData.selectedPackage}
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

                                <div className="col-12 col-md-3">
                                    <label className="form-label fw-semibold">Start Date</label>
                                    <input
                                        type="date"
                                        name="travelStartDate"
                                        className="form-control"
                                        value={formData.travelStartDate}
                                        onChange={handleChange}
                                        required
                                    />
                                </div>

                                <div className="col-12 col-md-3">
                                    <label className="form-label fw-semibold">End Date</label>
                                    <input
                                        type="date"
                                        name="travelEndDate"
                                        className="form-control"
                                        value={formData.travelEndDate}
                                        onChange={handleChange}
                                        required
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
                                        required
                                    />
                                </div>

                                <div className="col-12 col-md-4">
                                    <label className="form-label fw-semibold">Vehicle Type</label>
                                    <select
                                        name="vehicleType"
                                        className="form-select"
                                        value={formData.vehicleType}
                                        onChange={handleChange}
                                    >
                                        {vehicleOptions.map((item) => (
                                            <option key={item} value={item}>
                                                {item}
                                            </option>
                                        ))}
                                    </select>
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
                                    <h6 className="fw-bold mt-2 mb-0">Payment Details</h6>
                                </div>

                                <div className="col-12 col-md-4">
                                    <label className="form-label fw-semibold">Total Price</label>
                                    <input
                                        type="number"
                                        name="totalPrice"
                                        className="form-control"
                                        value={formData.totalPrice}
                                        onChange={handleChange}
                                        min="0"
                                        required
                                    />
                                </div>

                                <div className="col-12 col-md-4">
                                    <label className="form-label fw-semibold">
                                        Advance Payment
                                    </label>
                                    <input
                                        type="number"
                                        name="advancePayment"
                                        className="form-control"
                                        value={formData.advancePayment}
                                        onChange={handleChange}
                                        min="0"
                                    />
                                </div>

                                <div className="col-12 col-md-4">
                                    <label className="form-label fw-semibold">
                                        Payment Status
                                    </label>
                                    <select
                                        name="paymentStatus"
                                        className="form-select"
                                        value={formData.paymentStatus}
                                        onChange={handleChange}
                                    >
                                        {paymentStatusOptions.map((item) => (
                                            <option key={item} value={item}>
                                                {item}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="col-12 col-md-6">
                                    <label className="form-label fw-semibold">
                                        Booking Status
                                    </label>
                                    <select
                                        name="bookingStatus"
                                        className="form-select"
                                        value={formData.bookingStatus}
                                        onChange={handleChange}
                                    >
                                        {bookingStatusOptions.map((item) => (
                                            <option key={item} value={item}>
                                                {item}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="col-12 col-md-6">
                                    <label className="form-label fw-semibold">
                                        Balance Amount
                                    </label>
                                    <input
                                        type="text"
                                        className="form-control"
                                        value={formatMoney(
                                            Number(formData.totalPrice || 0) -
                                            Number(formData.advancePayment || 0),
                                            formData.currency
                                        )}
                                        disabled
                                    />
                                </div>

                                <div className="col-12">
                                    <label className="form-label fw-semibold">
                                        Special Requests
                                    </label>
                                    <textarea
                                        name="specialRequests"
                                        className="form-control"
                                        rows="3"
                                        value={formData.specialRequests}
                                        onChange={handleChange}
                                        placeholder="Customer special requests..."
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
                                        placeholder="Internal booking notes..."
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
                                            ? "Update Booking"
                                            : "Save Booking"}
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
                                        placeholder="Search booking code, name, email, country..."
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
                                value={bookingStatus}
                                onChange={(e) => {
                                    setPage(1);
                                    setBookingStatus(e.target.value);
                                }}
                            >
                                <option value="">All Booking</option>
                                {bookingStatusOptions.map((item) => (
                                    <option key={item} value={item}>
                                        {item}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="col-12 col-md-4 col-lg-2">
                            <select
                                className="form-select"
                                value={paymentStatus}
                                onChange={(e) => {
                                    setPage(1);
                                    setPaymentStatus(e.target.value);
                                }}
                            >
                                <option value="">All Payment</option>
                                {paymentStatusOptions.map((item) => (
                                    <option key={item} value={item}>
                                        {item}
                                    </option>
                                ))}
                            </select>
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
                                <option value="">All Vehicles</option>
                                {vehicleOptions.map((item) => (
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
                        <h5 className="fw-bold mb-0">Booking List</h5>
                        <small className="text-muted">Total: {totalBookings} bookings</small>
                    </div>

                    {loading ? (
                        <p className="text-muted">Loading bookings...</p>
                    ) : bookings.length === 0 ? (
                        <p className="text-muted mb-0">No bookings found.</p>
                    ) : (
                        <div className="table-responsive">
                            <table className="table align-middle">
                                <thead>
                                <tr>
                                    <th>Booking</th>
                                    <th>Customer</th>
                                    <th>Travel Dates</th>
                                    <th>Vehicle</th>
                                    <th>Total</th>
                                    <th>Payment</th>
                                    <th>Status</th>
                                    <th className="text-end">Actions</th>
                                </tr>
                                </thead>

                                <tbody>
                                {bookings.map((booking) => (
                                    <tr key={booking._id}>
                                        <td>
                                            <div>
                                                <h6 className="mb-1">{booking.bookingCode}</h6>
                                                <small className="text-muted">
                                                    {booking.selectedPackage?.title || "No package"}
                                                </small>
                                            </div>
                                        </td>

                                        <td>
                                            <div>
                                                <h6 className="mb-1">
                                                    {booking.customer?.fullName}
                                                </h6>
                                                <small className="text-muted">
                                                    {booking.customer?.country}
                                                    <br />
                                                    {booking.customer?.whatsappNumber}
                                                </small>
                                            </div>
                                        </td>

                                        <td>
                                            <small>
                                                {formatDate(booking.travelStartDate)} -{" "}
                                                {formatDate(booking.travelEndDate)}
                                            </small>
                                        </td>

                                        <td>{booking.vehicleType}</td>

                                        <td>
                                            {formatMoney(booking.totalPrice, booking.currency)}
                                            <br />
                                            <small className="text-muted">
                                                Advance:{" "}
                                                {formatMoney(
                                                    booking.advancePayment,
                                                    booking.currency
                                                )}
                                            </small>
                                        </td>

                                        <td>
                                            <PaymentBadge status={booking.paymentStatus} />
                                        </td>

                                        <td>
                                            <BookingBadge status={booking.bookingStatus} />
                                        </td>

                                        <td className="text-end">
                                            <div className="d-flex justify-content-end gap-2">
                                                <button
                                                    className="btn btn-sm btn-outline-warning"
                                                    onClick={() => setSelectedPaymentBooking(booking)}
                                                    title="Payment history"
                                                >
                                                    <FaWallet />
                                                </button>
                                                <button
                                                    className="btn btn-sm btn-outline-success"
                                                    onClick={() =>
                                                        handleDownloadBookingPdf(booking, "invoice")
                                                    }
                                                    disabled={
                                                        pdfLoadingKey === `invoice-${booking._id}`
                                                    }
                                                    title="Download invoice PDF"
                                                >
                                                    <FaFileInvoiceDollar />
                                                </button>

                                                <button
                                                    className="btn btn-sm btn-outline-dark"
                                                    onClick={() =>
                                                        handleDownloadBookingPdf(booking, "receipt")
                                                    }
                                                    disabled={
                                                        pdfLoadingKey === `receipt-${booking._id}`
                                                    }
                                                    title="Download receipt PDF"
                                                >
                                                    <FaReceipt />
                                                </button>

                                                <button
                                                    className="btn btn-sm btn-outline-primary"
                                                    onClick={() => handleEdit(booking)}
                                                    title="Edit booking"
                                                >
                                                    <FaEdit />
                                                </button>

                                                <button
                                                    className="btn btn-sm btn-outline-danger"
                                                    onClick={() => handleDelete(booking._id)}
                                                    title="Delete booking"
                                                >
                                                    <FaTrash />
                                                </button>
                                            </div>
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
            {selectedPaymentBooking && (
                <BookingPaymentsModal
                    booking={selectedPaymentBooking}
                    onClose={() => setSelectedPaymentBooking(null)}
                    onPaymentChanged={fetchBookings}
                />
            )}
        </div>
    );
};

const BookingBadge = ({ status }) => {
    const className =
        status === "Confirmed"
            ? "text-bg-success"
            : status === "In Progress"
                ? "text-bg-info"
                : status === "Completed"
                    ? "text-bg-primary"
                    : status === "Cancelled"
                        ? "text-bg-danger"
                        : "text-bg-warning";

    return <span className={`badge ${className}`}>{status}</span>;
};

const PaymentBadge = ({ status }) => {
    const className =
        status === "Paid"
            ? "text-bg-success"
            : status === "Partially Paid"
                ? "text-bg-warning"
                : status === "Refunded"
                    ? "text-bg-info"
                    : "text-bg-secondary";

    return <span className={`badge ${className}`}>{status}</span>;
};

export default Bookings;