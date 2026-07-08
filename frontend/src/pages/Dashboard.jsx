import { useEffect, useState } from "react";
import api from "../api/axios";
import {
    FaMapMarkedAlt,
    FaRoute,
    FaEnvelopeOpenText,
    FaCalendarCheck,
    FaCar,
    FaDollarSign,
} from "react-icons/fa";

const Dashboard = () => {
    const [stats, setStats] = useState(null);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(true);

    const fetchStats = async () => {
        try {
            const response = await api.get("/dashboard/stats");
            setStats(response.data);
        } catch (err) {
            setError(err.response?.data?.message || "Failed to load dashboard data");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStats();
    }, []);

    if (loading) {
        return <p className="text-muted">Loading dashboard...</p>;
    }

    if (error) {
        return <div className="alert alert-danger">{error}</div>;
    }

    return (
        <div>
            <div className="d-flex justify-content-between align-items-center mb-4">
                <div>
                    <h2 className="fw-bold mb-1">Dashboard</h2>
                    <p className="text-muted mb-0">
                        Overview of Dream Ceylon Journeys CRM
                    </p>
                </div>
            </div>

            <div className="row g-3">
                <StatCard
                    title="Destinations"
                    value={stats?.destinations?.total || 0}
                    subtitle={`${stats?.destinations?.active || 0} active`}
                    icon={<FaMapMarkedAlt />}
                />

                <StatCard
                    title="Packages"
                    value={stats?.packages?.total || 0}
                    subtitle={`${stats?.packages?.active || 0} active`}
                    icon={<FaRoute />}
                />

                <StatCard
                    title="Vehicles"
                    value={stats?.vehicles?.total || 0}
                    subtitle={`${stats?.vehicles?.active || 0} active`}
                    icon={<FaCar />}
                />

                <StatCard
                    title="Inquiries"
                    value={stats?.inquiries?.total || 0}
                    subtitle={`${stats?.inquiries?.new || 0} new inquiries`}
                    icon={<FaEnvelopeOpenText />}
                />

                <StatCard
                    title="Bookings"
                    value={stats?.bookings?.total || 0}
                    subtitle={`${stats?.bookings?.confirmed || 0} confirmed`}
                    icon={<FaCalendarCheck />}
                />

                <StatCard
                    title="Revenue"
                    value={`$${stats?.revenue?.totalRevenue || 0}`}
                    subtitle={`Advance: $${stats?.revenue?.totalAdvancePayments || 0}`}
                    icon={<FaDollarSign />}
                />
            </div>

            <div className="row g-3 mt-4">
                <div className="col-12 col-lg-6">
                    <div className="card border-0 shadow-sm rounded-4">
                        <div className="card-body">
                            <h5 className="fw-bold mb-3">Recent Inquiries</h5>

                            {stats?.recentInquiries?.length === 0 ? (
                                <p className="text-muted mb-0">No recent inquiries found.</p>
                            ) : (
                                stats?.recentInquiries?.map((item) => (
                                    <div className="border-bottom py-2" key={item._id}>
                                        <h6 className="mb-1">{item.fullName}</h6>
                                        <small className="text-muted">
                                            {item.country} · {item.status} · {item.priority}
                                        </small>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                <div className="col-12 col-lg-6">
                    <div className="card border-0 shadow-sm rounded-4">
                        <div className="card-body">
                            <h5 className="fw-bold mb-3">Recent Bookings</h5>

                            {stats?.recentBookings?.length === 0 ? (
                                <p className="text-muted mb-0">No recent bookings found.</p>
                            ) : (
                                stats?.recentBookings?.map((item) => (
                                    <div className="border-bottom py-2" key={item._id}>
                                        <h6 className="mb-1">{item.bookingCode}</h6>
                                        <small className="text-muted">
                                            {item.customer?.fullName} · {item.bookingStatus} ·{" "}
                                            {item.paymentStatus}
                                        </small>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const StatCard = ({ title, value, subtitle, icon }) => {
    return (
        <div className="col-12 col-md-6 col-xl-4">
            <div className="stat-card">
                <div>
                    <p className="text-muted mb-1">{title}</p>
                    <h3 className="fw-bold mb-1">{value}</h3>
                    <small className="text-muted">{subtitle}</small>
                </div>
                <div className="stat-icon">{icon}</div>
            </div>
        </div>
    );
};

export default Dashboard;