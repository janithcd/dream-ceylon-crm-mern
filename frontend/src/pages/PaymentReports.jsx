import { useEffect, useMemo, useState } from "react";
import {
    FaDownload,
    FaFileCsv,
    FaFilter,
    FaMoneyBillWave,
    FaReceipt,
    FaRedo,
    FaSearch,
    FaUndo,
    FaWallet,
} from "react-icons/fa";
import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Legend,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import api from "../api/axios";
import { exportToCsv } from "../utils/csvExport";

const COLORS = ["#0f766e", "#2563eb", "#f59e0b", "#dc2626", "#7c3aed"];

const statusOptions = ["Received", "Refunded", "Cancelled"];

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

const currencyOptions = ["USD", "LKR", "EUR", "GBP"];

const initialFilters = {
    keyword: "",
    status: "",
    paymentType: "",
    paymentMethod: "",
    currency: "",
    dateFrom: "",
    dateTo: "",
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

const formatShortMoney = (amount) => {
    const number = Number(amount);

    if (!Number.isFinite(number)) {
        return "0";
    }

    if (number >= 1000000) {
        return `${(number / 1000000).toFixed(1)}M`;
    }

    if (number >= 1000) {
        return `${(number / 1000).toFixed(1)}K`;
    }

    return number.toFixed(0);
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

const StatCard = ({ title, value, subtitle, icon, variant = "success" }) => {
    return (
        <div className="stat-card h-100">
            <div>
                <p className="text-muted mb-1">{title}</p>
                <h3 className={`fw-bold mb-1 text-${variant}`}>{value}</h3>
                {subtitle && <small className="text-muted">{subtitle}</small>}
            </div>

            <div className="stat-icon">{icon}</div>
        </div>
    );
};

const ChartCard = ({ title, subtitle, children }) => {
    return (
        <div className="card border-0 shadow-sm rounded-4 h-100">
            <div className="card-body p-4">
                <div className="mb-3">
                    <h5 className="fw-bold mb-1">{title}</h5>
                    {subtitle && <p className="text-muted small mb-0">{subtitle}</p>}
                </div>

                {children}
            </div>
        </div>
    );
};

const EmptyChart = ({ message = "No chart data available yet." }) => {
    return (
        <div
            className="d-flex align-items-center justify-content-center text-muted"
            style={{ height: "300px" }}
        >
            {message}
        </div>
    );
};

const PaymentReports = () => {
    const [report, setReport] = useState(null);
    const [filters, setFilters] = useState(initialFilters);
    const [activeFilters, setActiveFilters] = useState(initialFilters);

    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);
    const [receiptLoadingId, setReceiptLoadingId] = useState("");
    const [exportLoading, setExportLoading] = useState(false);

    const [error, setError] = useState("");

    const summary = report?.summary || {};
    const payments = report?.payments || [];
    const monthlyStats = report?.monthlyStats || [];
    const methodStats = report?.methodStats || [];
    const statusStats = report?.statusStats || [];

    const chartCurrency = summary.currency || "USD";

    const paymentStatusChartData = useMemo(() => {
        return statusStats
            .map((item) => ({
                name: item.name,
                value: item.count || 0,
            }))
            .filter((item) => item.value > 0);
    }, [statusStats]);

    const methodChartData = useMemo(() => {
        return methodStats
            .map((item) => ({
                name: item.name,
                value: item.net || 0,
            }))
            .filter((item) => item.value !== 0);
    }, [methodStats]);

    const fetchReport = async () => {
        try {
            setLoading(true);
            setError("");

            const params = {
                page,
                limit: 10,
            };

            Object.entries(activeFilters).forEach(([key, value]) => {
                if (value) {
                    params[key] = value;
                }
            });

            const response = await api.get("/finance/reports/payments", { params });

            setReport(response.data);
        } catch (err) {
            setError(
                err.response?.data?.message ||
                err.response?.data?.error ||
                "Failed to load payment report."
            );
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchReport();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page, activeFilters]);

    const handleFilterChange = (e) => {
        const { name, value } = e.target;

        setFilters((prev) => ({
            ...prev,
            [name]: value,
        }));
    };

    const handleApplyFilters = (e) => {
        e.preventDefault();
        setPage(1);
        setActiveFilters(filters);
    };

    const handleResetFilters = () => {
        setFilters(initialFilters);
        setActiveFilters(initialFilters);
        setPage(1);
    };

    const handleDownloadPaymentReceipt = async (payment) => {
        try {
            setReceiptLoadingId(payment._id);
            setError("");

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
            let message = "Failed to download payment receipt.";

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

    const handleExportCsv = async () => {
        try {
            setExportLoading(true);
            setError("");

            const params = {
                page: 1,
                limit: 10000,
            };

            Object.entries(activeFilters).forEach(([key, value]) => {
                if (value) {
                    params[key] = value;
                }
            });

            const response = await api.get("/finance/reports/payments", { params });

            const exportPayments = response.data.payments || [];

            const rows = exportPayments.map((payment) => ({
                "Payment No": payment.paymentNo || "",
                "Booking Code": payment.booking?.bookingCode || "",
                "Client Name": payment.booking?.customer?.fullName || "",
                Country: payment.booking?.customer?.country || "",
                "Payment Date": formatDate(payment.paymentDate),
                "Payment Type": payment.paymentType || "",
                "Payment Method": payment.paymentMethod || "",
                "Reference Number": payment.referenceNumber || "",
                Amount: payment.amount || 0,
                Currency: payment.currency || "",
                Status: payment.status || "",
                Notes: payment.notes || "",
            }));

            const today = new Date().toISOString().split("T")[0];

            exportToCsv(rows, `dream-ceylon-payment-report-${today}.csv`);
        } catch (err) {
            setError(
                err.response?.data?.message ||
                err.response?.data?.error ||
                "Failed to export payment report CSV."
            );
        } finally {
            setExportLoading(false);
        }
    };

    return (
        <div>
            <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-4 gap-3">
                <div>
                    <h2 className="fw-bold mb-1">Payment Reports</h2>
                    <p className="text-muted mb-0">
                        Track received payments, refunds, net income, and payment method
                        performance.
                    </p>
                </div>

                <div className="d-flex gap-2">
                    <button
                        className="btn btn-outline-success"
                        onClick={fetchReport}
                        disabled={loading}
                    >
                        <FaRedo className="me-2" />
                        Refresh
                    </button>

                    <button
                        className="btn btn-success"
                        onClick={handleExportCsv}
                        disabled={exportLoading}
                    >
                        <FaFileCsv className="me-2" />
                        {exportLoading ? "Exporting..." : "Export CSV"}
                    </button>
                </div>
            </div>

            {error && <div className="alert alert-danger">{error}</div>}

            <div className="row g-4 mb-4">
                <div className="col-xl-3 col-md-6">
                    <StatCard
                        title="Total Received"
                        value={formatMoney(summary.totalReceived || 0, chartCurrency)}
                        subtitle={`${summary.receivedCount || 0} received payments`}
                        icon={<FaMoneyBillWave />}
                        variant="success"
                    />
                </div>

                <div className="col-xl-3 col-md-6">
                    <StatCard
                        title="Total Refunded"
                        value={formatMoney(summary.totalRefunded || 0, chartCurrency)}
                        subtitle={`${summary.refundedCount || 0} refunded payments`}
                        icon={<FaUndo />}
                        variant="info"
                    />
                </div>

                <div className="col-xl-3 col-md-6">
                    <StatCard
                        title="Net Income"
                        value={formatMoney(summary.netIncome || 0, chartCurrency)}
                        subtitle="received minus refunds"
                        icon={<FaWallet />}
                        variant="primary"
                    />
                </div>

                <div className="col-xl-3 col-md-6">
                    <StatCard
                        title="Cancelled"
                        value={formatMoney(summary.totalCancelled || 0, chartCurrency)}
                        subtitle={`${summary.cancelledCount || 0} cancelled payments`}
                        icon={<FaReceipt />}
                        variant="danger"
                    />
                </div>
            </div>

            <div className="card border-0 shadow-sm rounded-4 mb-4">
                <div className="card-body p-4">
                    <div className="d-flex align-items-center gap-2 mb-3">
                        <FaFilter className="text-success" />
                        <h5 className="fw-bold mb-0">Search & Filters</h5>
                    </div>

                    <form onSubmit={handleApplyFilters}>
                        <div className="row g-3">
                            <div className="col-12 col-lg-4">
                                <label className="form-label fw-semibold">Search</label>
                                <div className="input-group">
                                    <input
                                        type="text"
                                        name="keyword"
                                        className="form-control"
                                        placeholder="Payment no, booking code, client, reference..."
                                        value={filters.keyword}
                                        onChange={handleFilterChange}
                                    />
                                    <button className="btn btn-primary" type="submit">
                                        <FaSearch />
                                    </button>
                                </div>
                            </div>

                            <div className="col-12 col-md-4 col-lg-2">
                                <label className="form-label fw-semibold">Status</label>
                                <select
                                    name="status"
                                    className="form-select"
                                    value={filters.status}
                                    onChange={handleFilterChange}
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
                                <label className="form-label fw-semibold">Type</label>
                                <select
                                    name="paymentType"
                                    className="form-select"
                                    value={filters.paymentType}
                                    onChange={handleFilterChange}
                                >
                                    <option value="">All Types</option>
                                    {paymentTypeOptions.map((item) => (
                                        <option key={item} value={item}>
                                            {item}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="col-12 col-md-4 col-lg-2">
                                <label className="form-label fw-semibold">Method</label>
                                <select
                                    name="paymentMethod"
                                    className="form-select"
                                    value={filters.paymentMethod}
                                    onChange={handleFilterChange}
                                >
                                    <option value="">All Methods</option>
                                    {paymentMethodOptions.map((item) => (
                                        <option key={item} value={item}>
                                            {item}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="col-12 col-md-4 col-lg-2">
                                <label className="form-label fw-semibold">Currency</label>
                                <select
                                    name="currency"
                                    className="form-select"
                                    value={filters.currency}
                                    onChange={handleFilterChange}
                                >
                                    <option value="">All Currency</option>
                                    {currencyOptions.map((item) => (
                                        <option key={item} value={item}>
                                            {item}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="col-12 col-md-4 col-lg-2">
                                <label className="form-label fw-semibold">From</label>
                                <input
                                    type="date"
                                    name="dateFrom"
                                    className="form-control"
                                    value={filters.dateFrom}
                                    onChange={handleFilterChange}
                                />
                            </div>

                            <div className="col-12 col-md-4 col-lg-2">
                                <label className="form-label fw-semibold">To</label>
                                <input
                                    type="date"
                                    name="dateTo"
                                    className="form-control"
                                    value={filters.dateTo}
                                    onChange={handleFilterChange}
                                />
                            </div>

                            <div className="col-12 col-lg-8 d-flex align-items-end gap-2">
                                <button className="btn btn-primary" type="submit">
                                    Apply Filters
                                </button>

                                <button
                                    className="btn btn-outline-secondary"
                                    type="button"
                                    onClick={handleResetFilters}
                                >
                                    Reset
                                </button>
                            </div>
                        </div>
                    </form>
                </div>
            </div>

            <div className="row g-4 mb-4">
                <div className="col-xl-7">
                    <ChartCard
                        title="Monthly Net Income"
                        subtitle="Received payments minus refunded payments by month."
                    >
                        {monthlyStats.length === 0 ? (
                            <EmptyChart />
                        ) : (
                            <div style={{ height: "320px" }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={monthlyStats}>
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis dataKey="label" />
                                        <YAxis tickFormatter={formatShortMoney} />
                                        <Tooltip
                                            formatter={(value) => formatMoney(value, chartCurrency)}
                                        />
                                        <Legend />
                                        <Bar
                                            dataKey="received"
                                            name="Received"
                                            fill="#0f766e"
                                            radius={[8, 8, 0, 0]}
                                        />
                                        <Bar
                                            dataKey="refunded"
                                            name="Refunded"
                                            fill="#dc2626"
                                            radius={[8, 8, 0, 0]}
                                        />
                                        <Bar
                                            dataKey="net"
                                            name="Net Income"
                                            fill="#2563eb"
                                            radius={[8, 8, 0, 0]}
                                        />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </ChartCard>
                </div>

                <div className="col-xl-5">
                    <ChartCard
                        title="Payment Status Breakdown"
                        subtitle="Payment count by current status."
                    >
                        {paymentStatusChartData.length === 0 ? (
                            <EmptyChart />
                        ) : (
                            <div style={{ height: "320px" }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={paymentStatusChartData}
                                            dataKey="value"
                                            nameKey="name"
                                            innerRadius={65}
                                            outerRadius={110}
                                            paddingAngle={4}
                                            label
                                        >
                                            {paymentStatusChartData.map((entry, index) => (
                                                <Cell
                                                    key={`status-${entry.name}`}
                                                    fill={COLORS[index % COLORS.length]}
                                                />
                                            ))}
                                        </Pie>
                                        <Tooltip />
                                        <Legend />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </ChartCard>
                </div>

                <div className="col-12">
                    <ChartCard
                        title="Payment Method Net Income"
                        subtitle="Shows which payment methods generate the most net income."
                    >
                        {methodChartData.length === 0 ? (
                            <EmptyChart />
                        ) : (
                            <div style={{ height: "320px" }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={methodChartData}>
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis dataKey="name" />
                                        <YAxis tickFormatter={formatShortMoney} />
                                        <Tooltip
                                            formatter={(value) => formatMoney(value, chartCurrency)}
                                        />
                                        <Bar
                                            dataKey="value"
                                            name="Net Income"
                                            fill="#0f766e"
                                            radius={[8, 8, 0, 0]}
                                        />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </ChartCard>
                </div>
            </div>

            <div className="card border-0 shadow-sm rounded-4">
                <div className="card-body p-4">
                    <div className="d-flex justify-content-between align-items-center flex-wrap gap-3 mb-3">
                        <div>
                            <h5 className="fw-bold mb-1">Payment Records</h5>
                            <p className="text-muted small mb-0">
                                Total: {report?.totalPayments || 0} payments
                            </p>
                        </div>

                        {loading && <small className="text-muted">Loading...</small>}
                    </div>

                    {!loading && payments.length === 0 ? (
                        <div className="text-center py-5 border rounded-4">
                            <FaReceipt className="text-muted mb-3" size={32} />
                            <h6 className="fw-bold">No payments found</h6>
                            <p className="text-muted mb-0">
                                Try changing filters or add payments from the bookings page.
                            </p>
                        </div>
                    ) : (
                        <div className="table-responsive">
                            <table className="table align-middle">
                                <thead>
                                <tr>
                                    <th>Payment</th>
                                    <th>Booking</th>
                                    <th>Client</th>
                                    <th>Date</th>
                                    <th>Type</th>
                                    <th>Method</th>
                                    <th>Amount</th>
                                    <th>Status</th>
                                    <th className="text-end">Receipt</th>
                                </tr>
                                </thead>

                                <tbody>
                                {payments.map((payment) => (
                                    <tr key={payment._id}>
                                        <td>
                                            <strong>{payment.paymentNo}</strong>
                                            <br />
                                            <small className="text-muted">
                                                Ref: {payment.referenceNumber || "-"}
                                            </small>
                                        </td>

                                        <td>
                                            <strong>{payment.booking?.bookingCode || "-"}</strong>
                                            <br />
                                            <small className="text-muted">
                                                {payment.booking?.bookingStatus || "-"}
                                            </small>
                                        </td>

                                        <td>
                                            <strong>
                                                {payment.booking?.customer?.fullName || "-"}
                                            </strong>
                                            <br />
                                            <small className="text-muted">
                                                {payment.booking?.customer?.country || "-"}
                                            </small>
                                        </td>

                                        <td>{formatDate(payment.paymentDate)}</td>

                                        <td>{payment.paymentType}</td>

                                        <td>{payment.paymentMethod}</td>

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
                                            <button
                                                className="btn btn-sm btn-outline-success"
                                                onClick={() => handleDownloadPaymentReceipt(payment)}
                                                disabled={receiptLoadingId === payment._id}
                                                title="Download payment receipt"
                                            >
                                                <FaDownload />
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
                            Page {page} of {report?.totalPages || 1}
                        </small>

                        <button
                            className="btn btn-outline-secondary btn-sm"
                            disabled={page >= (report?.totalPages || 1)}
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

export default PaymentReports;