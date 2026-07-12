import { useEffect, useState } from "react";
import {
    FaDownload,
    FaEdit,
    FaFileInvoiceDollar,
    FaSearch,
    FaTrash,
} from "react-icons/fa";
import api from "../api/axios";

const statusOptions = ["Draft", "Sent", "Accepted", "Rejected", "Expired"];
const currencyOptions = ["USD", "LKR", "EUR", "GBP"];

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

const getStatusBadgeClass = (status) => {
    switch (status) {
        case "Draft":
            return "bg-secondary";
        case "Sent":
            return "bg-info";
        case "Accepted":
            return "bg-success";
        case "Rejected":
            return "bg-danger";
        case "Expired":
            return "bg-warning text-dark";
        default:
            return "bg-secondary";
    }
};

const cleanFileName = (value) => {
    return (
        String(value || "client")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "") || "client"
    );
};

const getIdValue = (value) => {
    if (!value) {
        return null;
    }

    if (typeof value === "string") {
        return value;
    }

    return value._id || null;
};

const buildQuotationPayload = (quotation, overrides = {}) => {
    return {
        inquiry: getIdValue(quotation.inquiry),
        booking: getIdValue(quotation.booking),

        clientName: quotation.clientName,
        country: quotation.country,
        tourTitle: quotation.tourTitle,

        travelStartDate: quotation.travelStartDate,
        travelEndDate: quotation.travelEndDate,

        travelers: quotation.travelers,
        durationDays: quotation.durationDays,

        vehicleType: quotation.vehicleType,
        vehicleDailyRate: quotation.vehicleDailyRate,
        vehicleDays: quotation.vehicleDays,

        hotelCost: quotation.hotelCost,
        activitiesCost: quotation.activitiesCost,
        entranceFeesCost: quotation.entranceFeesCost,
        otherCost: quotation.otherCost,

        discount: quotation.discount,
        advancePayment: quotation.advancePayment,

        currency: quotation.currency,

        inclusions: quotation.inclusions || [],
        exclusions: quotation.exclusions || [],
        notes: quotation.notes || "",

        status: quotation.status || "Draft",
        adminNotes: quotation.adminNotes || "",

        ...overrides,
    };
};

const QuotationHistory = () => {
    const [quotations, setQuotations] = useState([]);
    const [keyword, setKeyword] = useState("");
    const [status, setStatus] = useState("");
    const [currency, setCurrency] = useState("");
    const [page, setPage] = useState(1);
    const [pagination, setPagination] = useState({
        currentPage: 1,
        totalPages: 1,
        totalQuotations: 0,
    });

    const [loading, setLoading] = useState(false);
    const [pdfLoadingId, setPdfLoadingId] = useState("");
    const [statusLoadingId, setStatusLoadingId] = useState("");
    const [deleteLoadingId, setDeleteLoadingId] = useState("");
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    const fetchQuotations = async () => {
        try {
            setLoading(true);
            setError("");

            const params = {
                page,
                limit: 8,
            };

            if (keyword.trim()) {
                params.keyword = keyword.trim();
            }

            if (status) {
                params.status = status;
            }

            if (currency) {
                params.currency = currency;
            }

            const response = await api.get("/quotations", { params });

            setQuotations(response.data.quotations || []);
            setPagination({
                currentPage: response.data.currentPage || 1,
                totalPages: response.data.totalPages || 1,
                totalQuotations: response.data.totalQuotations || 0,
            });
        } catch (err) {
            setError(
                err.response?.data?.message ||
                err.response?.data?.error ||
                "Failed to fetch quotations."
            );
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchQuotations();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page, status, currency]);

    const handleSearch = (e) => {
        e.preventDefault();
        setPage(1);
        fetchQuotations();
    };

    const handleResetFilters = () => {
        setKeyword("");
        setStatus("");
        setCurrency("");
        setPage(1);
    };

    const handleDownloadPdf = async (quotation) => {
        try {
            setPdfLoadingId(quotation._id);
            setError("");
            setSuccess("");

            const response = await api.post(
                "/quotations/pdf",
                buildQuotationPayload(quotation),
                {
                    responseType: "blob",
                }
            );

            const blob = new Blob([response.data], {
                type: "application/pdf",
            });

            const fileUrl = window.URL.createObjectURL(blob);
            const link = document.createElement("a");

            link.href = fileUrl;
            link.download = `dream-ceylon-quotation-${cleanFileName(
                quotation.clientName
            )}.pdf`;

            document.body.appendChild(link);
            link.click();
            link.remove();

            window.URL.revokeObjectURL(fileUrl);
        } catch (err) {
            let message = "Failed to download quotation PDF.";

            if (err.response?.data instanceof Blob) {
                const errorText = await err.response.data.text();

                try {
                    const errorJson = JSON.parse(errorText);
                    message = errorJson.error || errorJson.message || message;
                } catch {
                    message = errorText || message;
                }
            }

            setError(message);
        } finally {
            setPdfLoadingId("");
        }
    };

    const handleStatusChange = async (quotation, newStatus) => {
        try {
            setStatusLoadingId(quotation._id);
            setError("");
            setSuccess("");

            await api.put(
                `/quotations/${quotation._id}`,
                buildQuotationPayload(quotation, {
                    status: newStatus,
                })
            );

            setSuccess("Quotation status updated successfully.");
            fetchQuotations();
        } catch (err) {
            setError(
                err.response?.data?.message ||
                err.response?.data?.error ||
                "Failed to update quotation status."
            );
        } finally {
            setStatusLoadingId("");
        }
    };

    const handleDelete = async (quotationId) => {
        const confirmed = window.confirm(
            "Are you sure you want to delete this quotation?"
        );

        if (!confirmed) {
            return;
        }

        try {
            setDeleteLoadingId(quotationId);
            setError("");
            setSuccess("");

            await api.delete(`/quotations/${quotationId}`);

            setSuccess("Quotation deleted successfully.");
            fetchQuotations();
        } catch (err) {
            setError(
                err.response?.data?.message ||
                err.response?.data?.error ||
                "Failed to delete quotation."
            );
        } finally {
            setDeleteLoadingId("");
        }
    };

    return (
        <div>
            <div className="d-flex justify-content-between align-items-start flex-wrap gap-3 mb-4">
                <div>
                    <h3 className="fw-bold mb-1">Quotation History</h3>
                    <p className="text-muted mb-0">
                        View, filter, update, delete, and download saved quotation PDFs.
                    </p>
                </div>

                <div className="badge bg-success-subtle text-success px-3 py-2 rounded-pill">
                    {pagination.totalQuotations} quotations
                </div>
            </div>

            {error && <div className="alert alert-danger">{error}</div>}
            {success && <div className="alert alert-success">{success}</div>}

            <div className="card border-0 shadow-sm rounded-4 mb-4">
                <div className="card-body p-4">
                    <form onSubmit={handleSearch}>
                        <div className="row g-3 align-items-end">
                            <div className="col-lg-5">
                                <label className="form-label">Search</label>
                                <div className="input-group">
                  <span className="input-group-text">
                    <FaSearch />
                  </span>
                                    <input
                                        type="text"
                                        className="form-control"
                                        value={keyword}
                                        onChange={(e) => setKeyword(e.target.value)}
                                        placeholder="Search by quotation no, client, country, or tour"
                                    />
                                </div>
                            </div>

                            <div className="col-lg-2 col-md-4">
                                <label className="form-label">Status</label>
                                <select
                                    className="form-select"
                                    value={status}
                                    onChange={(e) => {
                                        setStatus(e.target.value);
                                        setPage(1);
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

                            <div className="col-lg-2 col-md-4">
                                <label className="form-label">Currency</label>
                                <select
                                    className="form-select"
                                    value={currency}
                                    onChange={(e) => {
                                        setCurrency(e.target.value);
                                        setPage(1);
                                    }}
                                >
                                    <option value="">All Currency</option>
                                    {currencyOptions.map((item) => (
                                        <option key={item} value={item}>
                                            {item}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="col-lg-3 col-md-4 d-flex gap-2">
                                <button type="submit" className="btn btn-success w-100">
                                    Search
                                </button>

                                <button
                                    type="button"
                                    className="btn btn-outline-secondary w-100"
                                    onClick={handleResetFilters}
                                >
                                    Reset
                                </button>
                            </div>
                        </div>
                    </form>
                </div>
            </div>

            <div className="card border-0 shadow-sm rounded-4">
                <div className="card-body p-0">
                    {loading ? (
                        <div className="p-4 text-center text-muted">Loading quotations...</div>
                    ) : quotations.length === 0 ? (
                        <div className="p-5 text-center">
                            <FaFileInvoiceDollar className="text-muted mb-3" size={42} />
                            <h5 className="fw-bold">No quotations found</h5>
                            <p className="text-muted mb-0">
                                Save a quotation from the quotation generator first.
                            </p>
                        </div>
                    ) : (
                        <div className="table-responsive">
                            <table className="table table-hover align-middle mb-0">
                                <thead className="table-light">
                                <tr>
                                    <th>Quotation</th>
                                    <th>Client</th>
                                    <th>Tour</th>
                                    <th>Total</th>
                                    <th>Status</th>
                                    <th>Created</th>
                                    <th className="text-end">Actions</th>
                                </tr>
                                </thead>

                                <tbody>
                                {quotations.map((quotation) => (
                                    <tr key={quotation._id}>
                                        <td>
                                            <div className="fw-bold">{quotation.quotationNo}</div>
                                            <small className="text-muted">
                                                {quotation.currency}
                                            </small>
                                        </td>

                                        <td>
                                            <div className="fw-semibold">{quotation.clientName}</div>
                                            <small className="text-muted">{quotation.country}</small>
                                        </td>

                                        <td style={{ minWidth: "240px" }}>
                                            <div className="fw-semibold">{quotation.tourTitle}</div>
                                            <small className="text-muted">
                                                {quotation.durationDays} days · {quotation.vehicleType}
                                            </small>
                                        </td>

                                        <td>
                                            <div className="fw-bold text-success">
                                                {formatMoney(
                                                    quotation.totals?.grandTotal,
                                                    quotation.currency
                                                )}
                                            </div>
                                            <small className="text-muted">
                                                Balance:{" "}
                                                {formatMoney(
                                                    quotation.totals?.balancePayment,
                                                    quotation.currency
                                                )}
                                            </small>
                                        </td>

                                        <td style={{ minWidth: "155px" }}>
                        <span
                            className={`badge ${getStatusBadgeClass(
                                quotation.status
                            )} mb-2`}
                        >
                          {quotation.status}
                        </span>

                                            <select
                                                className="form-select form-select-sm"
                                                value={quotation.status}
                                                disabled={statusLoadingId === quotation._id}
                                                onChange={(e) =>
                                                    handleStatusChange(quotation, e.target.value)
                                                }
                                            >
                                                {statusOptions.map((item) => (
                                                    <option key={item} value={item}>
                                                        {item}
                                                    </option>
                                                ))}
                                            </select>
                                        </td>

                                        <td>
                                            <div>{formatDate(quotation.createdAt)}</div>
                                            <small className="text-muted">
                                                Travel: {formatDate(quotation.travelStartDate)}
                                            </small>
                                        </td>

                                        <td>
                                            <div className="d-flex justify-content-end gap-2">
                                                <button
                                                    className="btn btn-sm btn-outline-success"
                                                    onClick={() => handleDownloadPdf(quotation)}
                                                    disabled={pdfLoadingId === quotation._id}
                                                    title="Download PDF"
                                                >
                                                    <FaDownload />
                                                </button>

                                                <button
                                                    className="btn btn-sm btn-outline-primary"
                                                    disabled
                                                    title="Edit feature will be added next"
                                                >
                                                    <FaEdit />
                                                </button>

                                                <button
                                                    className="btn btn-sm btn-outline-danger"
                                                    onClick={() => handleDelete(quotation._id)}
                                                    disabled={deleteLoadingId === quotation._id}
                                                    title="Delete"
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
                </div>

                {pagination.totalPages > 1 && (
                    <div className="card-footer bg-white border-0 p-3">
                        <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
              <span className="text-muted small">
                Page {pagination.currentPage} of {pagination.totalPages}
              </span>

                            <div className="d-flex gap-2">
                                <button
                                    className="btn btn-sm btn-outline-secondary"
                                    disabled={page <= 1}
                                    onClick={() => setPage((previous) => previous - 1)}
                                >
                                    Previous
                                </button>

                                <button
                                    className="btn btn-sm btn-outline-secondary"
                                    disabled={page >= pagination.totalPages}
                                    onClick={() => setPage((previous) => previous + 1)}
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default QuotationHistory;