import { formatCalendarDate, toCalendarDateInput, todayCalendarDate } from "../utils/calendarDate";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    FaCalendarCheck,
    FaDownload,
    FaEdit,
    FaFileInvoiceDollar,
    FaSearch,
    FaTrash,
    FaBell,
    FaFileCsv,
    FaCoins,
    FaCopy,
} from "react-icons/fa";
import api from "../api/axios";
import { exportToCsv } from "../utils/csvExport";
import PermissionGuard from "../components/PermissionGuard";
const statusOptions = ["Draft", "Sent", "Accepted", "Rejected", "Expired"];
const currencyOptions = ["USD", "LKR", "EUR", "GBP"];
const validityOptions = [
    { value: "", label: "All validity dates" },
    { value: "pastDue", label: "Past validity · sent" },
    { value: "dueSoon", label: "Ends within 7 days · sent" },
    { value: "noDate", label: "No date · sent" },
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
        validUntil: toCalendarDateInput(quotation.validUntil) || null,
        quotationNo: quotation.quotationNo,
        quotationDate: quotation.createdAt,
        adminNotes: quotation.adminNotes || "",

        ...overrides,
    };
};

const QuotationHistory = () => {
    const navigate = useNavigate();

    const [quotations, setQuotations] = useState([]);
    const [keyword, setKeyword] = useState("");
    const [status, setStatus] = useState("");
    const [currency, setCurrency] = useState("");
    const [validity, setValidity] = useState("");
    const [page, setPage] = useState(1);
    const [exportLoading, setExportLoading] = useState(false);
    const [pagination, setPagination] = useState({
        currentPage: 1,
        totalPages: 1,
        totalQuotations: 0,
    });

    const [loading, setLoading] = useState(false);
    const [pdfLoadingId, setPdfLoadingId] = useState("");
    const [statusLoadingId, setStatusLoadingId] = useState("");
    const [convertLoadingId, setConvertLoadingId] = useState("");
    const [revisionLoadingId, setRevisionLoadingId] = useState("");
    const [deleteLoadingId, setDeleteLoadingId] = useState("");
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    const fetchQuotations = async ({
                                       pageValue = page,
                                       keywordValue = keyword,
                                       statusValue = status,
                                       currencyValue = currency,
                                       validityValue = validity,
                                   } = {}) => {
        try {
            setLoading(true);
            setError("");

            const params = {
                page: pageValue,
                limit: 8,
            };

            if (keywordValue.trim()) {
                params.keyword = keywordValue.trim();
            }

            if (statusValue) {
                params.status = statusValue;
            }

            if (currencyValue) {
                params.currency = currencyValue;
            }
            if (validityValue) params.validity = validityValue;

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
        fetchQuotations({ pageValue: page });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page, status, currency, validity]);

    const handleSearch = (e) => {
        e.preventDefault();

        setPage(1);
        fetchQuotations({
            pageValue: 1,
            keywordValue: keyword,
            statusValue: status,
            currencyValue: currency,
            validityValue: validity,
        });
    };

    const handleResetFilters = () => {
        setKeyword("");
        setStatus("");
        setCurrency("");
        setValidity("");
        setPage(1);

        fetchQuotations({
            pageValue: 1,
            keywordValue: "",
            statusValue: "",
            currencyValue: "",
            validityValue: "",
        });
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
            } else if (err.response?.data?.message) {
                message = err.response.data.message;
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

    const handleConvertToBooking = async (quotation) => {
        if (quotation.booking) {
            setError("This quotation is already converted to a booking.");
            return;
        }

        const confirmed = window.confirm(
            "Convert this quotation to a confirmed booking?"
        );

        if (!confirmed) {
            return;
        }

        let email = quotation.inquiry?.email || "";
        let whatsappNumber = quotation.inquiry?.whatsappNumber || "";

        if (!email) {
            email = window.prompt("Enter client email address:");

            if (!email) {
                setError("Client email is required to create a booking.");
                return;
            }
        }

        if (!whatsappNumber) {
            whatsappNumber = window.prompt("Enter client WhatsApp number:");

            if (!whatsappNumber) {
                setError("Client WhatsApp number is required to create a booking.");
                return;
            }
        }

        try {
            setConvertLoadingId(quotation._id);
            setError("");
            setSuccess("");

            const response = await api.post(
                `/quotations/${quotation._id}/convert-to-booking`,
                {
                    confirmAccepted: true,
                    email,
                    whatsappNumber,
                    bookingStatus: "Confirmed",
                    specialRequests:
                        quotation.notes ||
                        `Client accepted quotation ${quotation.quotationNo}.`,
                    adminNotes: `Booking created from quotation ${quotation.quotationNo}.`,
                }
            );

            setSuccess(
                `Quotation converted successfully. Booking Code: ${response.data.booking.bookingCode}`
            );

            fetchQuotations();
        } catch (err) {
            setError(
                err.response?.data?.message ||
                err.response?.data?.error ||
                "Failed to convert quotation to booking."
            );
        } finally {
            setConvertLoadingId("");
        }
    };

    const handleCreateRevision = async (quotation) => {
        if (!window.confirm(`Create a new draft based on ${quotation.quotationNo}? The original offer will remain available.`)) return;
        try {
            setRevisionLoadingId(quotation._id);
            setError("");
            const response = await api.post(`/quotations/${quotation._id}/revisions`);
            navigate(`/quotations?edit=${response.data.quotation._id}`);
        } catch (err) {
            setError(err.response?.data?.message || "Failed to create a revised draft.");
        } finally {
            setRevisionLoadingId("");
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
    const handleExportCsv = async () => {
        try {
            setExportLoading(true);
            setError("");

            const params = {
                page: 1,
                limit: 10000,
            };

            if (keyword) {
                params.keyword = keyword;
            }

            if (status) {
                params.status = status;
            }

            if (currency) {
                params.currency = currency;
            }
            if (validity) params.validity = validity;

            const response = await api.get("/quotations", { params });
            const exportQuotations = response.data.quotations || [];

            const rows = exportQuotations.map((quotation) => ({
                "Quotation No": quotation.quotationNo || "",
                "Client Name": quotation.clientName || "",
                Country: quotation.country || "",
                "Tour Title": quotation.tourTitle || "",
                "Travel Start Date": formatCalendarDate(quotation.travelStartDate),
                "Travel End Date": formatCalendarDate(quotation.travelEndDate),
                Travelers: quotation.travelers || 0,
                "Duration Days": quotation.durationDays || 0,
                "Vehicle Type": quotation.vehicleType || "",
                "Vehicle Total": quotation.totals?.vehicleTotal || 0,
                "Hotel Total": quotation.totals?.hotelTotal || 0,
                "Activities Total": quotation.totals?.activitiesTotal || 0,
                "Entrance Fees Total": quotation.totals?.entranceFeesTotal || 0,
                Subtotal: quotation.totals?.subtotal || 0,
                Discount: quotation.totals?.discount || 0,
                "Grand Total": quotation.totals?.grandTotal || 0,
                "Advance Payment": quotation.totals?.advancePayment || 0,
                "Balance Payment": quotation.totals?.balancePayment || 0,
                Currency: quotation.currency || "",
                Status: quotation.status || "",
                "Revised From": quotation.revisionSourceNo || quotation.revisionOf?.quotationNo || "",
                "Valid Until": quotation.validUntil ? formatCalendarDate(quotation.validUntil) : "",
                Converted: quotation.booking ? "Yes" : "No",
                "Created Date": formatCalendarDate(quotation.createdAt),
            }));

            const today = todayCalendarDate();
            exportToCsv(rows, `dream-ceylon-quotations-${today}.csv`);
        } catch (err) {
            setError(
                err.response?.data?.message ||
                err.response?.data?.error ||
                "Failed to export quotations CSV."
            );
        } finally {
            setExportLoading(false);
        }
    };
    return (
        <div>
            <div className="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-4">

                <div>
                    <h3 className="fw-bold mb-1">Quotation History</h3>
                    <p className="text-muted mb-0">
                        View, filter, update, delete, download, and convert quotations to
                        bookings.
                    </p>
                </div>
                <div>
                    <div className="badge bg-success-subtle text-success px-3 py-2 rounded-pill">
                        {pagination.totalQuotations} quotations


                    </div>
                    <div className="mb-2 mt-2">
                        <PermissionGuard permission="report.export">
                            <button
                                className="btn btn-success"
                                onClick={handleExportCsv}
                                disabled={exportLoading}
                            >
                                <FaFileCsv className="me-2" />
                                {exportLoading ? "Exporting..." : "Export CSV"}
                            </button>
                        </PermissionGuard>
                    </div>
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
                                        if (e.target.value && e.target.value !== "Sent") setValidity("");
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

                            <div className="col-lg-3 col-md-4">
                                <label className="form-label" htmlFor="quotation-validity-filter">Offer validity</label>
                                <select id="quotation-validity-filter" className="form-select" value={validity} onChange={(e) => {
                                    setValidity(e.target.value);
                                    if (e.target.value) setStatus("Sent");
                                    setPage(1);
                                }}>
                                    {validityOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                                </select>
                            </div>

                            <div className="col-12 d-flex justify-content-end gap-2">
                                <button type="submit" className="btn btn-success">
                                    Search
                                </button>

                                <button
                                    type="button"
                                    className="btn btn-outline-secondary"
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
                        <div className="p-4 text-center text-muted">
                            Loading quotations...
                        </div>
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
                                    <th>Created / validity</th>
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
                                            {(quotation.revisionSourceNo || quotation.revisionOf?.quotationNo) &&
                                                <small className="d-block text-muted mt-1">Revised from {quotation.revisionSourceNo || quotation.revisionOf.quotationNo}</small>}

                                            {quotation.booking && (
                                                <div className="mt-1">
                            <span className="badge bg-success-subtle text-success">
                              Converted
                            </span>
                                                </div>
                                            )}
                                        </td>

                                        <td>
                                            <div className="fw-semibold">
                                                {quotation.clientName}
                                            </div>
                                            <small className="text-muted">
                                                {quotation.country}
                                            </small>
                                        </td>

                                        <td style={{ minWidth: "240px" }}>
                                            <div className="fw-semibold">
                                                {quotation.tourTitle}
                                            </div>
                                            <small className="text-muted">
                                                {quotation.durationDays} days ·{" "}
                                                {quotation.vehicleType}
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

                                            <PermissionGuard permission="quotation.update">
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
                                            </PermissionGuard>
                                        </td>

                                        <td>
                                            <div>{formatCalendarDate(quotation.createdAt)}</div>
                                            <small className="text-muted">
                                                Travel: {formatCalendarDate(quotation.travelStartDate)}
                                            </small>
                                            <div className="small mt-1">Valid until: {quotation.validUntil ? formatCalendarDate(quotation.validUntil) : "Not set"}</div>
                                            {quotation.status === "Sent" && quotation.validUntil &&
                                                (toCalendarDateInput(quotation.validUntil) < todayCalendarDate()
                                                    ? <span className="badge text-bg-danger mt-1">Validity passed · review rates</span>
                                                    : toCalendarDateInput(quotation.validUntil) <= toCalendarDateInput(new Date(Date.now() + 6 * 86400000))
                                                        ? <span className="badge text-bg-warning mt-1">Ends within 7 days</span> : null)}
                                        </td>

                                        <td>
                                            <div className="d-flex justify-content-end gap-2">
                                                <PermissionGuard all={["cost.view", "quotation.view", "booking.view"]}>
                                                    <button
                                                        className="btn btn-sm btn-outline-secondary"
                                                        onClick={() => navigate(`/cost-profit?type=quotation&id=${quotation._id}`)}
                                                        title="Estimated costs and profit"
                                                    >
                                                        <FaCoins />
                                                    </button>
                                                </PermissionGuard>
                                                <PermissionGuard permission="followUp.manage">
                                                    <button
                                                        className="btn btn-sm btn-outline-warning"
                                                        onClick={() => navigate(`/follow-ups?quotation=${quotation._id}`)}
                                                        title="Create follow-up"
                                                    >
                                                        <FaBell />
                                                    </button>
                                                </PermissionGuard>

                                                <PermissionGuard permission="pdf.generate">
                                                    <button
                                                        className="btn btn-sm btn-outline-success"
                                                        onClick={() => handleDownloadPdf(quotation)}
                                                        disabled={pdfLoadingId === quotation._id}
                                                        title="Download PDF"
                                                    >
                                                        <FaDownload />
                                                    </button>
                                                </PermissionGuard>

                                                <PermissionGuard permission="quotation.update">
                                                    <button
                                                        className="btn btn-sm btn-outline-primary"
                                                        onClick={() =>
                                                            navigate(`/quotations?edit=${quotation._id}`)
                                                        }
                                                        title="Edit quotation"
                                                    >
                                                        <FaEdit />
                                                    </button>
                                                </PermissionGuard>

                                                <PermissionGuard all={["quotation.view", "quotation.create"]}>
                                                    <button type="button" className="btn btn-sm btn-outline-primary"
                                                        onClick={() => handleCreateRevision(quotation)}
                                                        disabled={revisionLoadingId === quotation._id || Boolean(quotation.booking)}
                                                        title={quotation.booking ? "Converted quotation: update the booking" : "Create revised draft"}
                                                        aria-label={`Create revised draft from ${quotation.quotationNo}`}>
                                                        <FaCopy />
                                                    </button>
                                                </PermissionGuard>

                                                <PermissionGuard permission="quotation.convert">
                                                    <button
                                                        className="btn btn-sm btn-outline-dark"
                                                        onClick={() => handleConvertToBooking(quotation)}
                                                        disabled={
                                                            convertLoadingId === quotation._id ||
                                                            Boolean(quotation.booking)
                                                        }
                                                        title={
                                                            quotation.booking
                                                                ? "Already converted"
                                                                : "Convert to booking"
                                                        }
                                                    >
                                                        <FaCalendarCheck />
                                                    </button>
                                                </PermissionGuard>

                                                <PermissionGuard permission="quotation.delete">
                                                    <button
                                                        className="btn btn-sm btn-outline-danger"
                                                        onClick={() => handleDelete(quotation._id)}
                                                        disabled={deleteLoadingId === quotation._id}
                                                        title="Delete"
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
