import { useEffect, useMemo, useState } from "react";
import {
    FaPlus,
    FaReceipt,
    FaSyncAlt,
    FaTimes,
    FaTrash,
    FaWallet,
} from "react-icons/fa";
import api from "../api/axios";

const initialPaymentForm = {
    amount: "",
    currency: "USD",
    paymentDate: new Date().toISOString().split("T")[0],
    paymentType: "Partial Payment",
    paymentMethod: "Bank Transfer",
    status: "Received",
    referenceNumber: "",
    notes: "",
};

const paymentTypeOptions = [
    "Advance",
    "Partial Payment",
    "Final Payment",
    "Refund",
    "Other",
];

const paymentMethodOptions = [
    "Cash",
    "Bank Transfer",
    "Card",
    "Online Payment",
    "Other",
];

const statusOptions = ["Received", "Refunded", "Cancelled"];

const currencyOptions = ["USD", "LKR", "EUR", "GBP"];

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

const getStatusBadgeClass = (status) => {
    switch (status) {
        case "Received":
            return "text-bg-success";
        case "Refunded":
            return "text-bg-info";
        case "Cancelled":
            return "text-bg-danger";
        default:
            return "text-bg-secondary";
    }
};

const BookingPaymentsModal = ({ booking, onClose, onPaymentChanged }) => {
    const [payments, setPayments] = useState([]);
    const [currentBooking, setCurrentBooking] = useState(booking);
    const [formData, setFormData] = useState({
        ...initialPaymentForm,
        currency: booking?.currency || "USD",
    });

    const [showForm, setShowForm] = useState(false);
    const [loading, setLoading] = useState(false);
    const [formLoading, setFormLoading] = useState(false);
    const [deleteLoadingId, setDeleteLoadingId] = useState("");
    const [receiptLoadingId, setReceiptLoadingId] = useState("");

    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    const bookingId = booking?._id;

    const financialSummary = useMemo(() => {
        const totalPrice = Number(currentBooking?.totalPrice || 0);
        const paidAmount = Number(currentBooking?.advancePayment || 0);
        const balance = Math.max(totalPrice - paidAmount, 0);

        return {
            totalPrice,
            paidAmount,
            balance,
        };
    }, [currentBooking]);

    const fetchPaymentHistory = async () => {
        if (!bookingId) {
            return;
        }

        try {
            setLoading(true);
            setError("");

            const response = await api.get(`/booking-payments/booking/${bookingId}`);

            setPayments(response.data.payments || []);
            setCurrentBooking(response.data.booking || booking);
        } catch (err) {
            setError(
                err.response?.data?.message ||
                err.response?.data?.error ||
                "Failed to load payment history."
            );
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPaymentHistory();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [bookingId]);

    const handleChange = (e) => {
        const { name, value } = e.target;

        setFormData((prev) => {
            const updatedData = {
                ...prev,
                [name]: value,
            };

            if (name === "paymentType" && value === "Refund") {
                updatedData.status = "Refunded";
            }

            if (name === "paymentType" && value !== "Refund" && prev.status === "Refunded") {
                updatedData.status = "Received";
            }

            return updatedData;
        });
    };

    const resetForm = () => {
        setFormData({
            ...initialPaymentForm,
            currency: currentBooking?.currency || booking?.currency || "USD",
        });
        setShowForm(false);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        try {
            setFormLoading(true);
            setError("");
            setSuccess("");

            const payload = {
                booking: bookingId,
                amount: Number(formData.amount),
                currency: formData.currency,
                paymentDate: formData.paymentDate,
                paymentType: formData.paymentType,
                paymentMethod: formData.paymentMethod,
                status: formData.status,
                referenceNumber: formData.referenceNumber,
                notes: formData.notes,
            };

            if (!payload.amount || payload.amount <= 0) {
                setError("Payment amount must be greater than 0.");
                return;
            }

            const response = await api.post("/booking-payments", payload);

            setSuccess("Payment added successfully.");
            setCurrentBooking(response.data.booking || currentBooking);
            resetForm();
            fetchPaymentHistory();

            if (onPaymentChanged) {
                onPaymentChanged();
            }
        } catch (err) {
            setError(
                err.response?.data?.message ||
                err.response?.data?.error ||
                "Failed to save payment."
            );
        } finally {
            setFormLoading(false);
        }
    };

    const handleDeletePayment = async (paymentId) => {
        const confirmDelete = window.confirm(
            "Are you sure you want to delete this payment record?"
        );

        if (!confirmDelete) {
            return;
        }

        try {
            setDeleteLoadingId(paymentId);
            setError("");
            setSuccess("");

            const response = await api.delete(`/booking-payments/${paymentId}`);

            setSuccess("Payment deleted successfully.");
            setCurrentBooking(response.data.booking || currentBooking);
            fetchPaymentHistory();

            if (onPaymentChanged) {
                onPaymentChanged();
            }
        } catch (err) {
            setError(
                err.response?.data?.message ||
                err.response?.data?.error ||
                "Failed to delete payment."
            );
        } finally {
            setDeleteLoadingId("");
        }
    };

    const handleDownloadPaymentReceipt = async (payment) => {
        try {
            setReceiptLoadingId(payment._id);
            setError("");
            setSuccess("");

            const response = await api.post(
                `/payment-receipts/${payment._id}`,
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

            const cleanPaymentNo =
                payment.paymentNo
                    ?.toLowerCase()
                    .replace(/[^a-z0-9]+/g, "-")
                    .replace(/^-+|-+$/g, "") || "payment-receipt";

            link.href = fileUrl;
            link.download = `dream-ceylon-payment-receipt-${cleanPaymentNo}.pdf`;

            document.body.appendChild(link);
            link.click();
            link.remove();

            window.URL.revokeObjectURL(fileUrl);
        } catch (err) {
            let message = "Failed to download payment receipt PDF.";

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
            setReceiptLoadingId("");
        }
    };

    if (!booking) {
        return null;
    }

    return (
        <div
            className="position-fixed top-0 start-0 w-100 h-100"
            style={{
                background: "rgba(15, 23, 42, 0.45)",
                zIndex: 1050,
                overflowY: "auto",
            }}
        >
            <div className="container py-5">
                <div className="row justify-content-center">
                    <div className="col-xl-10">
                        <div className="card border-0 shadow-lg rounded-4">
                            <div className="card-body p-4">
                                <div className="d-flex justify-content-between align-items-start flex-wrap gap-3 mb-4">
                                    <div>
                                        <h4 className="fw-bold mb-1">Payment History</h4>
                                        <p className="text-muted mb-0">
                                            {currentBooking?.bookingCode || booking.bookingCode} ·{" "}
                                            {currentBooking?.customer?.fullName ||
                                                booking.customer?.fullName ||
                                                "Client"}
                                        </p>
                                    </div>

                                    <div className="d-flex gap-2">
                                        <button
                                            className="btn btn-outline-success"
                                            onClick={fetchPaymentHistory}
                                            disabled={loading}
                                        >
                                            <FaSyncAlt className="me-2" />
                                            Refresh
                                        </button>

                                        <button
                                            className="btn btn-outline-secondary"
                                            onClick={onClose}
                                        >
                                            <FaTimes />
                                        </button>
                                    </div>
                                </div>

                                {error && <div className="alert alert-danger">{error}</div>}
                                {success && <div className="alert alert-success">{success}</div>}

                                <div className="row g-3 mb-4">
                                    <div className="col-md-4">
                                        <div className="border rounded-4 p-3 h-100">
                                            <small className="text-muted">Total Price</small>
                                            <h5 className="fw-bold mb-0">
                                                {formatMoney(
                                                    financialSummary.totalPrice,
                                                    currentBooking?.currency || booking.currency
                                                )}
                                            </h5>
                                        </div>
                                    </div>

                                    <div className="col-md-4">
                                        <div className="border rounded-4 p-3 h-100">
                                            <small className="text-muted">Paid Amount</small>
                                            <h5 className="fw-bold text-success mb-0">
                                                {formatMoney(
                                                    financialSummary.paidAmount,
                                                    currentBooking?.currency || booking.currency
                                                )}
                                            </h5>
                                        </div>
                                    </div>

                                    <div className="col-md-4">
                                        <div className="border rounded-4 p-3 h-100">
                                            <small className="text-muted">Balance</small>
                                            <h5 className="fw-bold text-danger mb-0">
                                                {formatMoney(
                                                    financialSummary.balance,
                                                    currentBooking?.currency || booking.currency
                                                )}
                                            </h5>
                                        </div>
                                    </div>
                                </div>

                                <div className="d-flex justify-content-between align-items-center flex-wrap gap-3 mb-3">
                                    <div>
                                        <h5 className="fw-bold mb-1">Payment Records</h5>
                                        <small className="text-muted">
                                            Add advance, partial, final, or refund payments.
                                        </small>
                                    </div>

                                    <button
                                        className="btn btn-primary"
                                        onClick={() => setShowForm((prev) => !prev)}
                                    >
                                        <FaPlus className="me-2" />
                                        Add Payment
                                    </button>
                                </div>

                                {showForm && (
                                    <div className="card border-0 bg-light rounded-4 mb-4">
                                        <div className="card-body">
                                            <h6 className="fw-bold mb-3">Add New Payment</h6>

                                            <form onSubmit={handleSubmit}>
                                                <div className="row g-3">
                                                    <div className="col-md-3">
                                                        <label className="form-label fw-semibold">
                                                            Amount
                                                        </label>
                                                        <input
                                                            type="number"
                                                            name="amount"
                                                            className="form-control"
                                                            value={formData.amount}
                                                            onChange={handleChange}
                                                            min="1"
                                                            required
                                                        />
                                                    </div>

                                                    <div className="col-md-3">
                                                        <label className="form-label fw-semibold">
                                                            Currency
                                                        </label>
                                                        <select
                                                            name="currency"
                                                            className="form-select"
                                                            value={formData.currency}
                                                            onChange={handleChange}
                                                        >
                                                            {currencyOptions.map((currency) => (
                                                                <option key={currency} value={currency}>
                                                                    {currency}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>

                                                    <div className="col-md-3">
                                                        <label className="form-label fw-semibold">
                                                            Payment Date
                                                        </label>
                                                        <input
                                                            type="date"
                                                            name="paymentDate"
                                                            className="form-control"
                                                            value={formData.paymentDate}
                                                            onChange={handleChange}
                                                            required
                                                        />
                                                    </div>

                                                    <div className="col-md-3">
                                                        <label className="form-label fw-semibold">
                                                            Payment Type
                                                        </label>
                                                        <select
                                                            name="paymentType"
                                                            className="form-select"
                                                            value={formData.paymentType}
                                                            onChange={handleChange}
                                                        >
                                                            {paymentTypeOptions.map((type) => (
                                                                <option key={type} value={type}>
                                                                    {type}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>

                                                    <div className="col-md-4">
                                                        <label className="form-label fw-semibold">
                                                            Payment Method
                                                        </label>
                                                        <select
                                                            name="paymentMethod"
                                                            className="form-select"
                                                            value={formData.paymentMethod}
                                                            onChange={handleChange}
                                                        >
                                                            {paymentMethodOptions.map((method) => (
                                                                <option key={method} value={method}>
                                                                    {method}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>

                                                    <div className="col-md-4">
                                                        <label className="form-label fw-semibold">
                                                            Status
                                                        </label>
                                                        <select
                                                            name="status"
                                                            className="form-select"
                                                            value={formData.status}
                                                            onChange={handleChange}
                                                        >
                                                            {statusOptions.map((status) => (
                                                                <option key={status} value={status}>
                                                                    {status}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>

                                                    <div className="col-md-4">
                                                        <label className="form-label fw-semibold">
                                                            Reference Number
                                                        </label>
                                                        <input
                                                            type="text"
                                                            name="referenceNumber"
                                                            className="form-control"
                                                            value={formData.referenceNumber}
                                                            onChange={handleChange}
                                                            placeholder="Bank ref / receipt no"
                                                        />
                                                    </div>

                                                    <div className="col-12">
                                                        <label className="form-label fw-semibold">
                                                            Notes
                                                        </label>
                                                        <textarea
                                                            name="notes"
                                                            className="form-control"
                                                            rows="2"
                                                            value={formData.notes}
                                                            onChange={handleChange}
                                                            placeholder="Payment note..."
                                                        ></textarea>
                                                    </div>
                                                </div>

                                                <div className="d-flex gap-2 mt-4">
                                                    <button
                                                        type="submit"
                                                        className="btn btn-primary"
                                                        disabled={formLoading}
                                                    >
                                                        {formLoading ? "Saving..." : "Save Payment"}
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

                                {loading ? (
                                    <p className="text-muted mb-0">Loading payment history...</p>
                                ) : payments.length === 0 ? (
                                    <div className="text-center py-5 border rounded-4">
                                        <FaWallet className="text-muted mb-3" size={32} />
                                        <h6 className="fw-bold">No payments recorded yet</h6>
                                        <p className="text-muted mb-0">
                                            Add the first payment for this booking.
                                        </p>
                                    </div>
                                ) : (
                                    <div className="table-responsive">
                                        <table className="table align-middle">
                                            <thead>
                                            <tr>
                                                <th>Payment No</th>
                                                <th>Date</th>
                                                <th>Type</th>
                                                <th>Method</th>
                                                <th>Reference</th>
                                                <th>Amount</th>
                                                <th>Status</th>
                                                <th className="text-end">Action</th>
                                            </tr>
                                            </thead>

                                            <tbody>
                                            {payments.map((payment) => (
                                                <tr key={payment._id}>
                                                    <td>
                                                        <h6 className="mb-1">{payment.paymentNo}</h6>
                                                        {payment.notes && (
                                                            <small className="text-muted">
                                                                {payment.notes}
                                                            </small>
                                                        )}
                                                    </td>

                                                    <td>{formatDate(payment.paymentDate)}</td>

                                                    <td>{payment.paymentType}</td>

                                                    <td>{payment.paymentMethod}</td>

                                                    <td>
                                                        <small>{payment.referenceNumber || "-"}</small>
                                                    </td>

                                                    <td>
                                                        <strong>
                                                            {formatMoney(payment.amount, payment.currency)}
                                                        </strong>
                                                    </td>

                                                    <td>
                              <span
                                  className={`badge ${getStatusBadgeClass(
                                      payment.status
                                  )}`}
                              >
                                {payment.status}
                              </span>
                                                    </td>

                                                    <td className="text-end">
                                                        <div className="d-flex justify-content-end gap-2">
                                                            <button
                                                                className="btn btn-sm btn-outline-success"
                                                                onClick={() => handleDownloadPaymentReceipt(payment)}
                                                                disabled={receiptLoadingId === payment._id}
                                                                title="Download payment receipt"
                                                            >
                                                                <FaReceipt />
                                                            </button>

                                                            <button
                                                                className="btn btn-sm btn-outline-danger"
                                                                onClick={() => handleDeletePayment(payment._id)}
                                                                disabled={deleteLoadingId === payment._id}
                                                                title="Delete payment"
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

                                <div className="alert alert-info mt-4 mb-0">
                                    When a payment is added or deleted, the booking paid amount and
                                    payment status will update automatically.
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default BookingPaymentsModal;