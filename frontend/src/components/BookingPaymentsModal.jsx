import { formatCalendarDate, toCalendarDateInput, todayCalendarDate } from "../utils/calendarDate";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
    FaFilePdf,
    FaPlus,
    FaReceipt,
    FaSyncAlt,
    FaTimes,
    FaTrash,
    FaWallet,
} from "react-icons/fa";
import api from "../api/axios";
import PermissionGuard from "./PermissionGuard";
import { usePermissions } from "../context/PermissionContext";
import { notifyPaymentAttentionChanged } from "../utils/paymentEvents";
import { getGuestPaymentMilestones } from "../utils/guestPaymentMilestones";
import { paymentMethods } from "../utils/paymentMethods";

const initialPaymentForm = () => ({
    amount: "",
    currency: "USD",
    paymentDate: todayCalendarDate(),
    paymentType: "Partial Payment",
    paymentMethod: "Bank Transfer",
    status: "Received",
    referenceNumber: "",
    notes: "",
});

const paymentTypeOptions = [
    "Advance",
    "Partial Payment",
    "Final Payment",
    "Refund",
    "Other",
];

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
    const { loading: permissionsLoading, hasPermission } = usePermissions();

    const canViewPayments = hasPermission("payment.view");
    const canCreatePayment = hasPermission("payment.create");
    const canRefundPayment = hasPermission("payment.refund");
    const canDeletePayment = hasPermission("payment.delete");
    const canGeneratePdf = hasPermission("pdf.generate");
    const [payments, setPayments] = useState([]);
    const [currentBooking, setCurrentBooking] = useState(booking);
    const [formData, setFormData] = useState({
        ...initialPaymentForm(),
        currency: booking?.currency || "USD",
    });

    const [showForm, setShowForm] = useState(false);
    const [loading, setLoading] = useState(false);
    const [formLoading, setFormLoading] = useState(false);
    const [deleteLoadingId, setDeleteLoadingId] = useState("");
    const [receiptLoadingId, setReceiptLoadingId] = useState("");
    const [statementLoading, setStatementLoading] = useState(false);
    const [statementReadiness, setStatementReadiness] = useState(null);
    const [readinessError, setReadinessError] = useState("");
    const [summaryReviewOpen, setSummaryReviewOpen] = useState(false);
    const [summaryReason, setSummaryReason] = useState("");
    const [summaryConfirmed, setSummaryConfirmed] = useState(false);
    const [summarySaving, setSummarySaving] = useState(false);

    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    const bookingId = booking?._id;

    const availablePaymentTypeOptions = canRefundPayment
        ? paymentTypeOptions
        : paymentTypeOptions.filter((item) => item !== "Refund");

    const availableStatusOptions = formData.paymentType === "Refund"
        ? ["Refunded", "Cancelled"]
        : ["Received", "Cancelled"];

    const selectedPaymentNeedsRefundPermission =
        formData.paymentType === "Refund" || formData.status === "Refunded";

    const canSubmitSelectedPayment = selectedPaymentNeedsRefundPermission
        ? canRefundPayment
        : canCreatePayment;

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
    const refundableCents = useMemo(() => payments.reduce((sum, payment) => {
        if (payment.currency !== currentBooking?.currency) return sum;
        const amount = Math.round(Number(payment.amount || 0) * 100);
        if (payment.status === "Received") return sum + amount;
        if (payment.status === "Refunded") return sum - amount;
        return sum;
    }, 0), [payments, currentBooking?.currency]);
    const milestones = useMemo(() => getGuestPaymentMilestones(currentBooking), [currentBooking]);
    const paidMismatch = statementReadiness?.issues?.find((issue) => issue.code === "paid_mismatch");

    const fetchPaymentHistory = async () => {
        if (!bookingId || !canViewPayments) {
            return;
        }

        try {
            setLoading(true);
            setError("");
            setReadinessError("");
            setStatementReadiness(null);
            setSummaryReviewOpen(false);
            setSummaryReason("");
            setSummaryConfirmed(false);

            const [response, bookingResponse, readiness] = await Promise.allSettled([
                api.get(`/booking-payments/booking/${bookingId}`),
                api.get(`/bookings/${bookingId}`),
                api.get(`/booking-pdf/payment-statement/${bookingId}/readiness`),
            ]);
            if (response.status !== "fulfilled") throw response.reason;
            if (bookingResponse.status !== "fulfilled") throw bookingResponse.reason;

            setPayments(response.value.data.payments || []);
            setCurrentBooking(bookingResponse.value.data);
            if (readiness.status === "fulfilled") setStatementReadiness(readiness.value.data);
            else setReadinessError(readiness.reason.response?.data?.message || "Could not check statement readiness. Refresh and try again.");
        } catch (err) {
            setReadinessError("Could not complete the statement check. Refresh and try again.");
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
        if (!permissionsLoading && canViewPayments) {
            fetchPaymentHistory();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [bookingId, permissionsLoading, canViewPayments]);

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

    const openPaymentForm = () => {
        if (!canCreatePayment && !canRefundPayment) {
            return;
        }

        if (showForm) {
            resetForm();
            return;
        }

        setFormData({
            ...initialPaymentForm(),
            currency: currentBooking?.currency || booking?.currency || "USD",
            paymentType: canCreatePayment ? "Partial Payment" : "Refund",
            status: canCreatePayment ? "Received" : "Refunded",
        });
        setShowForm(true);
    };

    const resetForm = () => {
        setFormData({
            ...initialPaymentForm(),
            currency: currentBooking?.currency || booking?.currency || "USD",
        });
        setShowForm(false);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!canSubmitSelectedPayment) {
            setError(
                selectedPaymentNeedsRefundPermission
                    ? "You do not have permission to record refunds."
                    : "You do not have permission to create payments."
            );
            return;
        }

        try {
            setFormLoading(true);
            setError("");
            setSuccess("");

            const payload = {
                booking: bookingId,
                amount: Number(formData.amount),
                currency: currentBooking?.currency || formData.currency,
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
            if (payload.status === "Refunded" && Math.round(payload.amount * 100) > refundableCents) {
                setError(`Only ${formatMoney(Math.max(refundableCents, 0) / 100, payload.currency)} is available to refund. Refresh the payment history if it has changed.`);
                return;
            }

            const response = await api.post("/booking-payments", payload);

            setSuccess("Payment added successfully.");
            setCurrentBooking(response.data.booking || currentBooking);
            resetForm();
            fetchPaymentHistory();
            notifyPaymentAttentionChanged();

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
            notifyPaymentAttentionChanged();

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
                    .replace(/^-+|-+$/g, "") || "payment-document";

            link.href = fileUrl;
            link.download = `dream-ceylon-${payment.status === "Refunded" ? "refund-confirmation" : "payment-receipt"}-${cleanPaymentNo}.pdf`;

            document.body.appendChild(link);
            link.click();
            link.remove();

            window.URL.revokeObjectURL(fileUrl);
        } catch (err) {
            let message = "Failed to download payment document PDF.";

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

    const handleDownloadStatement = async () => {
        try {
            setStatementLoading(true);
            setError("");
            const response = await api.post(`/booking-pdf/payment-statement/${bookingId}`, {}, {
                responseType: "blob",
            });
            const fileUrl = window.URL.createObjectURL(new Blob([response.data], { type: "application/pdf" }));
            const link = document.createElement("a");
            const cleanCode = (currentBooking?.bookingCode || booking.bookingCode || "booking")
                .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
            link.href = fileUrl;
            link.download = `dream-ceylon-payment-statement-${cleanCode}.pdf`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(fileUrl);
        } catch (err) {
            let message = "Failed to download the payment statement.";
            if (err.response?.data instanceof Blob) {
                try {
                    const body = JSON.parse(await err.response.data.text());
                    message = body.message || message;
                } catch { /* Keep the safe fallback. */ }
            } else if (err.response?.data?.message) {
                message = err.response.data.message;
            }
            if (err.response?.status === 409) await fetchPaymentHistory();
            setError(message);
        } finally {
            setStatementLoading(false);
        }
    };

    const handleReconcilePaidTotal = async (event) => {
        event.preventDefault();
        if (!paidMismatch || summarySaving) return;
        try {
            setSummarySaving(true);
            setError("");
            setSuccess("");
            await api.post(`/booking-payments/booking/${bookingId}/reconcile-summary`, {
                confirmLedgerComplete: summaryConfirmed, reason: summaryReason,
                expectedBookedPaidCents: paidMismatch.bookedPaidCents,
                expectedLedgerNetCents: paidMismatch.ledgerNetCents,
                expectedTargetPaidCents: paidMismatch.targetPaidCents,
            });
            await fetchPaymentHistory();
            notifyPaymentAttentionChanged();
            if (onPaymentChanged) onPaymentChanged();
            setSuccess("Booking paid amount reconciled to the verified payment history.");
        } catch (err) {
            if (err.response?.status === 409) await fetchPaymentHistory();
            setError(err.response?.data?.message || "Could not reconcile the booking paid amount.");
        } finally {
            setSummarySaving(false);
        }
    };

    if (!booking) {
        return null;
    }

    if (permissionsLoading) {
        return null;
    }

    if (!canViewPayments) {
        return (
            <div
                className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center p-3"
                style={{
                    background: "rgba(15, 23, 42, 0.45)",
                    zIndex: 1050,
                }}
            >
                <div
                    className="card border-0 shadow-lg rounded-4"
                    style={{ width: "100%", maxWidth: "520px" }}
                >
                    <div className="card-body p-4 text-center">
                        <FaWallet className="text-muted mb-3" size={36} />
                        <h5 className="fw-bold">Payment Access Restricted</h5>
                        <p className="text-muted">
                            Your account does not have permission to view booking
                            payments.
                        </p>
                        <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={onClose}
                        >
                            Close
                        </button>
                    </div>
                </div>
            </div>
        );
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
                                        <PermissionGuard all={["booking.view", "payment.view", "pdf.generate"]}>
                                            <button type="button" className="btn btn-outline-primary"
                                                onClick={handleDownloadStatement} disabled={statementLoading || loading || !statementReadiness?.ready}>
                                                <FaFilePdf className="me-2" />
                                                {statementLoading ? "Preparing..." : "Download statement"}
                                            </button>
                                        </PermissionGuard>
                                        <button
                                            type="button"
                                            className="btn btn-outline-success"
                                            onClick={fetchPaymentHistory}
                                            disabled={loading}
                                        >
                                            <FaSyncAlt className="me-2" />
                                            Refresh
                                        </button>

                                        <button
                                            type="button"
                                            className="btn btn-outline-secondary"
                                            onClick={onClose}
                                        >
                                            <FaTimes />
                                        </button>
                                    </div>
                                </div>

                                {error && <div className="alert alert-danger">{error}</div>}
                                {success && <div className="alert alert-success">{success}</div>}

                                <div className={`alert ${statementReadiness?.ready ? "alert-success" : "alert-warning"}`} role="status">
                                    {loading ? <strong>Checking guest statement...</strong> : readinessError ?
                                        <><strong>Statement check unavailable.</strong> {readinessError}</> : statementReadiness?.ready ?
                                        <><strong>Statement ready.</strong> The booking price and recorded payments agree. The ledger is checked again when downloading.</> :
                                        statementReadiness ? <>
                                            <strong>Statement needs review.</strong> Resolve these items before downloading:
                                            <ul className="mb-0 mt-2">
                                                {statementReadiness.issues.slice(0, 10).map((issue, index) => {
                                                    const date = toCalendarDateInput(issue.paymentDate);
                                                    return <li key={`${issue.code}-${issue.paymentNo || index}`}>
                                                        {issue.paymentNo && <strong>{issue.paymentNo}: </strong>}{issue.message}{" "}
                                                        {issue.paymentNo && date && <PermissionGuard all={["report.view", "payment.view"]}>
                                                            <Link to={`/payment-reports?payment=${encodeURIComponent(issue.paymentNo)}&date=${date}#guest-payment-matching`}>Find in matching register</Link>
                                                        </PermissionGuard>}
                                                    </li>;
                                                })}
                                            </ul>
                                            {statementReadiness.issues.length > 10 && <div className="small mt-1">{statementReadiness.issues.length - 10} more records need review.</div>}
                                            {paidMismatch && <div className="border border-warning-subtle rounded-3 bg-white p-3 mt-3">
                                                <strong>Paid amount review</strong>
                                                <div className="small mt-1">Booking shows {paidMismatch.bookedPaidCents === null ? "an invalid paid amount" :
                                                    formatMoney(paidMismatch.bookedPaidCents / 100, currentBooking?.currency)} paid.
                                                    The payment history shows {formatMoney(paidMismatch.receivedCents / 100, currentBooking?.currency)} received and {formatMoney(paidMismatch.refundedCents / 100, currentBooking?.currency)} refunded,
                                                    leaving {formatMoney(paidMismatch.ledgerNetCents / 100, currentBooking?.currency)} net.</div>
                                                <p className="small mt-2 mb-2">If older receipts or refunds are missing, verify and record <strong>all</strong> of them using Add Payment below, with their actual dates and references. Adding a payment recalculates the booking paid amount from the full recorded history.</p>
                                                {paidMismatch.bookedPaidCents !== null && <PermissionGuard all={["payment.update", "payment.reconcile"]}>
                                                    <div>
                                                        <button type="button" className="btn btn-sm btn-outline-warning" disabled={summarySaving}
                                                            onClick={() => setSummaryReviewOpen((open) => !open)}>
                                                            {summaryReviewOpen ? "Close review" : "Reconcile from complete ledger"}
                                                        </button>
                                                        {summaryReviewOpen && <form className="mt-3" onSubmit={handleReconcilePaidTotal}>
                                                            <p className="small mb-2">This will set the booking paid amount to <strong>{formatMoney(paidMismatch.targetPaidCents / 100, currentBooking?.currency)}</strong> and update its payment status. It will not create a receipt or move money.</p>
                                                            <label className="form-label" htmlFor="ledger-summary-reason">Reason and evidence checked</label>
                                                            <textarea id="ledger-summary-reason" className="form-control mb-2" required minLength={10} maxLength={300}
                                                                value={summaryReason} onChange={(event) => setSummaryReason(event.target.value)}
                                                                placeholder="Which bank statement or cashbook entries did you verify?" />
                                                            <div className="form-check mb-2">
                                                                <input id="ledger-summary-confirm" className="form-check-input" type="checkbox" required checked={summaryConfirmed}
                                                                    onChange={(event) => setSummaryConfirmed(event.target.checked)} />
                                                                <label className="form-check-label small" htmlFor="ledger-summary-confirm">I checked that every guest receipt and refund for this booking is recorded in the payment history.</label>
                                                            </div>
                                                            <button type="submit" className="btn btn-sm btn-warning" disabled={summarySaving || !summaryConfirmed}>
                                                                {summarySaving ? "Reconciling..." : "Confirm paid amount correction"}
                                                            </button>
                                                        </form>}
                                                    </div>
                                                </PermissionGuard>}
                                            </div>}
                                        </> : <strong>Checking guest statement...</strong>}
                                </div>

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

                                <div className="border rounded-4 p-3 mb-4">
                                    <h6 className="fw-bold mb-2">Guest payment schedule</h6>
                                    <p className="small text-muted mb-3">Targets in the booking currency. Recorded payments cover the hotel advance first; this schedule does not record a payment.</p>
                                    <div className="row g-2">
                                        {milestones.map((stage) => {
                                            const day = toCalendarDateInput(stage.dueDate);
                                            const status = stage.outstanding <= 0 ? "Covered" : !day ? "Date needed" :
                                                day < todayCalendarDate() ? "Overdue" : day === todayCalendarDate() ? "Due today" : "Scheduled";
                                            return (
                                                <div className="col-md-6" key={stage.label}>
                                                    <div className="border rounded-3 p-3 h-100">
                                                        <strong>{stage.label}</strong>
                                                        <div className="small text-muted">Target: {formatMoney(stage.target, currentBooking?.currency)}</div>
                                                        <div className="fw-semibold">Outstanding: {formatMoney(stage.outstanding, currentBooking?.currency)}</div>
                                                        <div className="small">{formatCalendarDate(stage.dueDate)} · {status}</div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div className="d-flex justify-content-between align-items-center flex-wrap gap-3 mb-3">
                                    <div>
                                        <h5 className="fw-bold mb-1">Payment Records</h5>
                                        <small className="text-muted">
                                            Add advance, partial, final, or refund payments.
                                        </small>
                                    </div>

                                    <PermissionGuard
                                        any={["payment.create", "payment.refund"]}
                                    >
                                        <button
                                            type="button"
                                            className="btn btn-primary"
                                            onClick={openPaymentForm}
                                        >
                                            <FaPlus className="me-2" />
                                            {showForm ? "Close Form" : "Add Payment"}
                                        </button>
                                    </PermissionGuard>
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
                                                            min="0.01"
                                                            step="0.01"
                                                            required
                                                        />
                                                    </div>

                                                    {formData.paymentType === "Refund" && formData.status === "Refunded" && (
                                                        <div className="col-12 small text-muted">
                                                            Available to refund: {formatMoney(Math.max(refundableCents, 0) / 100, currentBooking?.currency)}. Record a refund as a separate entry; the original receipt stays in the history.
                                                        </div>
                                                    )}

                                                    <div className="col-md-3">
                                                        <label className="form-label fw-semibold">Booking currency</label>
                                                        <input className="form-control" value={currentBooking?.currency || formData.currency} readOnly />
                                                    </div>

                                                    <div className="col-12 small text-muted">Enter the amount in the booking currency. If the guest paid in another currency, convert it and note the original amount and agreed rate.</div>

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
                                                            {availablePaymentTypeOptions.map((type) => (
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
                                                            {paymentMethods.map((method) => (
                                                                <option key={method} value={method}>
                                                                    {method}
                                                                </option>
                                                            ))}
                                                        </select>
                                                        {formData.paymentMethod === "PayHere" && <small className="text-muted">Record only a confirmed guest payment. Match it to the bank credit later in Payment Reports.</small>}
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
                                                            {availableStatusOptions.map((status) => (
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
                                                            placeholder={formData.paymentMethod === "PayHere" ? "PayHere payment / refund ID" : "Bank ref / receipt no"}
                                                            required={formData.paymentMethod === "PayHere"}
                                                            maxLength={formData.paymentMethod === "PayHere" ? 100 : undefined}
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

                                                {!canSubmitSelectedPayment && (
                                                    <div className="alert alert-warning mt-3 mb-0">
                                                        You do not have permission to save this
                                                        payment type.
                                                    </div>
                                                )}

                                                <div className="d-flex gap-2 mt-4">
                                                    <button
                                                        type="submit"
                                                        className="btn btn-primary"
                                                        disabled={formLoading || !canSubmitSelectedPayment}
                                                    >
                                                        {formLoading
                                                            ? "Saving..."
                                                            : selectedPaymentNeedsRefundPermission
                                                                ? "Save Refund"
                                                                : "Save Payment"}
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
                                                <th>Bank match</th>
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

                                                    <td>{formatCalendarDate(payment.paymentDate)}</td>

                                                    <td>{payment.paymentType}</td>

                                                    <td>{payment.paymentMethod}</td>

                                                    <td>
                                                        <small>{payment.referenceNumber || "-"}</small>
                                                    </td>

                                                    <td>
                                                        <strong>
                                                            {formatMoney(payment.amount, payment.currency)}
                                                        </strong>
                                                        {payment.currency !== currentBooking?.currency &&
                                                            <div className="small text-danger">Currency differs from booking. Review this payment.</div>}
                                                    </td>

                                                    <td>
                              <span
                                  className={`badge ${getStatusBadgeClass(
                                      payment.status
                                  )}`}
                              >
                                {payment.status}
                              </span>
                                                        {payment.status !== "Cancelled" &&
                                                            (payment.status === "Refunded") !== (payment.paymentType === "Refund") &&
                                                            <div className="small text-danger">Review type and status before downloading.</div>}
                                                    </td>

                                                    <td>
                                                        {payment.status === "Cancelled" ? "—" : payment.reconciledAt ? (
                                                            <><span className="text-success fw-semibold">Matched</span>
                                                                <div className="small text-muted">{payment.statementReference}</div></>
                                                        ) : <span className="text-warning-emphasis">To match</span>}
                                                    </td>

                                                    <td className="text-end">
                                                        <div className="d-flex justify-content-end gap-2">
                                                            {payment.status !== "Cancelled" &&
                                                                (payment.status === "Refunded") === (payment.paymentType === "Refund") && (
                                                                    <PermissionGuard all={["payment.view", "pdf.generate"]}>
                                                                        <button
                                                                            type="button"
                                                                            className="btn btn-sm btn-outline-success"
                                                                            onClick={() => handleDownloadPaymentReceipt(payment)}
                                                                            disabled={receiptLoadingId === payment._id}
                                                                            title={payment.status === "Refunded" ? "Download refund confirmation" : "Download payment receipt"}
                                                                            aria-label={payment.status === "Refunded" ? "Download refund confirmation" : "Download payment receipt"}
                                                                        >
                                                                            <FaReceipt />
                                                                        </button>
                                                                    </PermissionGuard>
                                                                )}

                                                            <PermissionGuard permission="payment.delete">
                                                                <button
                                                                    type="button"
                                                                    className="btn btn-sm btn-outline-danger"
                                                                    onClick={() =>
                                                                        handleDeletePayment(
                                                                            payment._id
                                                                        )
                                                                    }
                                                                    disabled={deleteLoadingId === payment._id || Boolean(payment.reconciledAt)}
                                                                    title={payment.reconciledAt ? "Reopen the bank match in Payment Reports before deleting" : "Delete payment"}
                                                                >
                                                                    <FaTrash />
                                                                </button>
                                                            </PermissionGuard>
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
