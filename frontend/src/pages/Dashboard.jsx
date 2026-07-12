import { useEffect, useMemo, useState } from "react";
import {
    FaBoxOpen,
    FaCalendarCheck,
    FaCar,
    FaChartLine,
    FaClipboardList,
    FaDollarSign,
    FaFileInvoiceDollar,
    FaGlobeAsia,
    FaMapMarkedAlt,
    FaUsers,
} from "react-icons/fa";
import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Legend,
    Line,
    LineChart,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import api from "../api/axios";

const COLORS = ["#0f766e", "#2563eb", "#f59e0b", "#16a34a", "#dc2626", "#7c3aed"];

const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
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

const StatCard = ({ title, value, subtitle, icon: Icon }) => {
    return (
        <div className="stat-card h-100">
            <div>
                <p className="text-muted mb-1">{title}</p>
                <h3 className="fw-bold mb-1">{value}</h3>
                {subtitle && <small className="text-muted">{subtitle}</small>}
            </div>

            <div className="stat-icon">
                <Icon />
            </div>
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

const Dashboard = () => {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const fetchStats = async () => {
        try {
            setLoading(true);
            setError("");

            const response = await api.get("/dashboard/stats");
            setStats(response.data);
        } catch (err) {
            setError(
                err.response?.data?.message ||
                err.response?.data?.error ||
                "Failed to load dashboard statistics."
            );
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStats();
    }, []);

    const quotationStatusData = useMemo(() => {
        if (!stats?.quotations) {
            return [];
        }

        return [
            { name: "Draft", value: stats.quotations.draft || 0 },
            { name: "Sent", value: stats.quotations.sent || 0 },
            { name: "Accepted", value: stats.quotations.accepted || 0 },
            { name: "Rejected", value: stats.quotations.rejected || 0 },
            { name: "Expired", value: stats.quotations.expired || 0 },
        ].filter((item) => item.value > 0);
    }, [stats]);

    const pipelineData = useMemo(() => {
        if (!stats) {
            return [];
        }

        return [
            {
                stage: "New Inquiries",
                count: stats.inquiries?.new || 0,
            },
            {
                stage: "Follow Up",
                count: stats.inquiries?.followUp || 0,
            },
            {
                stage: "Quotes Sent",
                count: stats.quotations?.sent || 0,
            },
            {
                stage: "Accepted Quotes",
                count: stats.quotations?.accepted || 0,
            },
            {
                stage: "Confirmed Bookings",
                count: stats.bookings?.confirmed || 0,
            },
        ];
    }, [stats]);

    const businessValueData = useMemo(() => {
        if (!stats) {
            return [];
        }

        return [
            {
                name: "Booking Revenue",
                value: stats.revenue?.totalRevenue || stats.revenue?.total || 0,
            },
            {
                name: "Total Quote Value",
                value:
                    stats.quotationValues?.totalQuotationValue ||
                    stats.quotationValues?.total ||
                    0,
            },
            {
                name: "Accepted Quote Value",
                value: stats.quotationValues?.acceptedQuotationValue || 0,
            },
            {
                name: "Pending Quote Value",
                value: stats.quotationValues?.pendingQuotationValue || 0,
            },
        ];
    }, [stats]);

    const monthlyData = useMemo(() => {
        if (!stats) {
            return [];
        }

        const map = new Map();

        const addMonthRow = (year, month) => {
            const key = `${year}-${String(month).padStart(2, "0")}`;

            if (!map.has(key)) {
                map.set(key, {
                    key,
                    month: `${monthNames[month - 1]} ${year}`,
                    bookings: 0,
                    quotations: 0,
                    bookingRevenue: 0,
                    quotationValue: 0,
                });
            }

            return map.get(key);
        };

        (stats.monthlyBookingStats || []).forEach((item) => {
            const year = item._id?.year;
            const month = item._id?.month;

            if (!year || !month) {
                return;
            }

            const row = addMonthRow(year, month);
            row.bookings = item.count || 0;
            row.bookingRevenue = item.revenue || 0;
        });

        (stats.monthlyQuotationStats || []).forEach((item) => {
            const year = item._id?.year;
            const month = item._id?.month;

            if (!year || !month) {
                return;
            }

            const row = addMonthRow(year, month);
            row.quotations = item.count || 0;
            row.quotationValue = item.value || 0;
        });

        return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
    }, [stats]);

    if (loading) {
        return (
            <div className="card border-0 shadow-sm rounded-4">
                <div className="card-body p-5 text-center text-muted">
                    Loading dashboard...
                </div>
            </div>
        );
    }

    if (error) {
        return <div className="alert alert-danger">{error}</div>;
    }

    return (
        <div>
            <div className="d-flex justify-content-between align-items-start flex-wrap gap-3 mb-4">
                <div>
                    <h3 className="fw-bold mb-1">Dashboard</h3>
                    <p className="text-muted mb-0">
                        Business overview, quotation pipeline, bookings, and revenue summary.
                    </p>
                </div>

                <button className="btn btn-outline-success" onClick={fetchStats}>
                    Refresh Dashboard
                </button>
            </div>

            <div className="row g-4 mb-4">
                <div className="col-xl-3 col-md-6">
                    <StatCard
                        title="Destinations"
                        value={stats?.destinations?.total || 0}
                        subtitle={`${stats?.destinations?.active || 0} active destinations`}
                        icon={FaMapMarkedAlt}
                    />
                </div>

                <div className="col-xl-3 col-md-6">
                    <StatCard
                        title="Tour Packages"
                        value={stats?.packages?.total || 0}
                        subtitle={`${stats?.packages?.active || 0} active packages`}
                        icon={FaGlobeAsia}
                    />
                </div>

                <div className="col-xl-3 col-md-6">
                    <StatCard
                        title="Inquiries"
                        value={stats?.inquiries?.total || 0}
                        subtitle={`${stats?.inquiries?.new || 0} new inquiries`}
                        icon={FaClipboardList}
                    />
                </div>

                <div className="col-xl-3 col-md-6">
                    <StatCard
                        title="Bookings"
                        value={stats?.bookings?.total || 0}
                        subtitle={`${stats?.bookings?.confirmed || 0} confirmed bookings`}
                        icon={FaCalendarCheck}
                    />
                </div>

                <div className="col-xl-3 col-md-6">
                    <StatCard
                        title="Vehicles"
                        value={stats?.vehicles?.total || 0}
                        subtitle={`${stats?.vehicles?.active || 0} active vehicles`}
                        icon={FaCar}
                    />
                </div>

                <div className="col-xl-3 col-md-6">
                    <StatCard
                        title="Total Quotations"
                        value={stats?.quotations?.total || 0}
                        subtitle={`${stats?.quotations?.converted || 0} converted to bookings`}
                        icon={FaFileInvoiceDollar}
                    />
                </div>

                <div className="col-xl-3 col-md-6">
                    <StatCard
                        title="Quotation Value"
                        value={formatMoney(
                            stats?.quotationValues?.totalQuotationValue ||
                            stats?.quotationValues?.total ||
                            0,
                            stats?.quotationValues?.currency || "USD"
                        )}
                        subtitle={`${stats?.quotations?.accepted || 0} accepted quotations`}
                        icon={FaChartLine}
                    />
                </div>

                <div className="col-xl-3 col-md-6">
                    <StatCard
                        title="Booking Revenue"
                        value={formatMoney(
                            stats?.revenue?.totalRevenue || stats?.revenue?.total || 0,
                            stats?.revenue?.currency || "USD"
                        )}
                        subtitle={formatMoney(
                            stats?.revenue?.totalAdvancePayments || 0,
                            stats?.revenue?.currency || "USD"
                        )}
                        icon={FaDollarSign}
                    />
                </div>
            </div>

            <div className="row g-4 mb-4">
                <div className="col-xl-6">
                    <ChartCard
                        title="Monthly bookings vs quotations"
                        subtitle="Shows how many bookings and quotations were created by month."
                    >
                        {monthlyData.length === 0 ? (
                            <EmptyChart />
                        ) : (
                            <div style={{ height: "320px" }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={monthlyData}>
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis dataKey="month" />
                                        <YAxis allowDecimals={false} />
                                        <Tooltip />
                                        <Legend />
                                        <Line
                                            type="monotone"
                                            dataKey="quotations"
                                            name="Quotations"
                                            stroke="#0f766e"
                                            strokeWidth={3}
                                            activeDot={{ r: 7 }}
                                        />
                                        <Line
                                            type="monotone"
                                            dataKey="bookings"
                                            name="Bookings"
                                            stroke="#2563eb"
                                            strokeWidth={3}
                                            activeDot={{ r: 7 }}
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </ChartCard>
                </div>

                <div className="col-xl-6">
                    <ChartCard
                        title="Inquiry to booking pipeline"
                        subtitle="Visualizes the current sales flow from inquiries to confirmed bookings."
                    >
                        <div style={{ height: "320px" }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={pipelineData}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="stage" />
                                    <YAxis allowDecimals={false} />
                                    <Tooltip />
                                    <Bar dataKey="count" name="Count" fill="#0f766e" radius={[8, 8, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </ChartCard>
                </div>

                <div className="col-xl-5">
                    <ChartCard
                        title="Quotation status breakdown"
                        subtitle="Current quotation status distribution."
                    >
                        {quotationStatusData.length === 0 ? (
                            <EmptyChart />
                        ) : (
                            <div style={{ height: "320px" }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={quotationStatusData}
                                            dataKey="value"
                                            nameKey="name"
                                            innerRadius={65}
                                            outerRadius={110}
                                            paddingAngle={4}
                                            label
                                        >
                                            {quotationStatusData.map((entry, index) => (
                                                <Cell
                                                    key={`cell-${entry.name}`}
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

                <div className="col-xl-7">
                    <ChartCard
                        title="Business value summary"
                        subtitle="Compares booking revenue and quotation value in USD."
                    >
                        <div style={{ height: "320px" }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={businessValueData}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="name" />
                                    <YAxis tickFormatter={formatShortMoney} />
                                    <Tooltip formatter={(value) => formatMoney(value, "USD")} />
                                    <Bar dataKey="value" name="Value" fill="#2563eb" radius={[8, 8, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </ChartCard>
                </div>
            </div>

            <div className="row g-4">
                <div className="col-xl-4">
                    <div className="card border-0 shadow-sm rounded-4 h-100">
                        <div className="card-body p-4">
                            <h5 className="fw-bold mb-3">Quotation Summary</h5>

                            <div className="d-flex justify-content-between border-bottom py-2">
                                <span className="text-muted">Draft</span>
                                <strong>{stats?.quotations?.draft || 0}</strong>
                            </div>

                            <div className="d-flex justify-content-between border-bottom py-2">
                                <span className="text-muted">Sent</span>
                                <strong>{stats?.quotations?.sent || 0}</strong>
                            </div>

                            <div className="d-flex justify-content-between border-bottom py-2">
                                <span className="text-muted">Accepted</span>
                                <strong className="text-success">
                                    {stats?.quotations?.accepted || 0}
                                </strong>
                            </div>

                            <div className="d-flex justify-content-between border-bottom py-2">
                                <span className="text-muted">Rejected</span>
                                <strong className="text-danger">
                                    {stats?.quotations?.rejected || 0}
                                </strong>
                            </div>

                            <div className="d-flex justify-content-between py-2">
                                <span className="text-muted">Converted</span>
                                <strong className="text-success">
                                    {stats?.quotations?.converted || 0}
                                </strong>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="col-xl-8">
                    <div className="card border-0 shadow-sm rounded-4 h-100">
                        <div className="card-body p-4">
                            <div className="d-flex justify-content-between align-items-center mb-3">
                                <h5 className="fw-bold mb-0">Recent Quotations</h5>
                                <FaBoxOpen className="text-success" />
                            </div>

                            {!stats?.recentQuotations || stats.recentQuotations.length === 0 ? (
                                <p className="text-muted mb-0">No recent quotations found.</p>
                            ) : (
                                <div className="table-responsive">
                                    <table className="table align-middle mb-0">
                                        <thead>
                                        <tr>
                                            <th>Quotation</th>
                                            <th>Client</th>
                                            <th>Total</th>
                                            <th>Status</th>
                                            <th>Date</th>
                                        </tr>
                                        </thead>

                                        <tbody>
                                        {stats.recentQuotations.map((quotation) => (
                                            <tr key={quotation._id}>
                                                <td>
                                                    <div className="fw-bold">{quotation.quotationNo}</div>
                                                    <small className="text-muted">
                                                        {quotation.tourTitle}
                                                    </small>
                                                </td>

                                                <td>
                                                    <div>{quotation.clientName}</div>
                                                    <small className="text-muted">
                                                        {quotation.country}
                                                    </small>
                                                </td>

                                                <td>
                                                    <strong className="text-success">
                                                        {formatMoney(
                                                            quotation.totals?.grandTotal,
                                                            quotation.currency
                                                        )}
                                                    </strong>
                                                </td>

                                                <td>
                            <span
                                className={`badge ${getStatusBadgeClass(
                                    quotation.status
                                )}`}
                            >
                              {quotation.status}
                            </span>
                                                </td>

                                                <td>{formatDate(quotation.createdAt)}</td>
                                            </tr>
                                        ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;