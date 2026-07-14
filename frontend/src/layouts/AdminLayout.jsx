import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
    FaCalendarCheck,
    FaCar,
    FaChartLine,
    FaEnvelopeOpenText,
    FaGlobeAsia,
    FaMapMarkedAlt,
    FaRoute,
    FaSignOutAlt,
    FaCalendarAlt,
    FaHistory,
    FaBell,
    FaUsers,
    FaMoneyBillWave,
    FaCog,

} from "react-icons/fa";
import { useAuth } from "../context/AuthContext";
import { FaFileInvoiceDollar } from "react-icons/fa";

const AdminLayout = () => {
    const { admin, logout } = useAuth();
    const navigate = useNavigate();

    const handleLogout = () => {
        logout();
        navigate("/login");
    };

    return (
        <div className="admin-layout">
            <aside className="sidebar">
                <div className="sidebar-brand">
                    <div className="brand-circle small">DCJ</div>
                    <div>
                        <h5 className="mb-0">Dream Ceylon</h5>
                        <small>CRM Admin</small>
                    </div>
                </div>

                <nav className="sidebar-nav">
                    <NavLink to="/" end>
                        <FaChartLine /> Dashboard
                    </NavLink>

                    <NavLink to="/destinations">
                        <FaMapMarkedAlt /> Destinations
                    </NavLink>

                    <NavLink to="/packages">
                        <FaRoute /> Packages
                    </NavLink>

                    <NavLink to="/inquiries">
                        <FaEnvelopeOpenText /> Inquiries
                    </NavLink>
                    <NavLink to="/customers">
                        <FaUsers />
                        Customers
                    </NavLink>
                    <NavLink to="/bookings">
                        <FaCalendarCheck /> Bookings
                    </NavLink>
                    <NavLink to="/bookings-calendar">
                        <FaCalendarAlt />
                        Booking Calendar
                    </NavLink>
                    <NavLink to="/payment-reports">
                        <FaMoneyBillWave />
                        Payment Reports
                    </NavLink>
                    <NavLink to="/follow-ups">
                        <FaBell />
                        Follow-Ups
                    </NavLink>
                    <NavLink to="/vehicles">
                        <FaCar /> Vehicles
                    </NavLink>
                    <NavLink to="/quotations">
                        <FaFileInvoiceDollar />
                        Quotations
                    </NavLink>
                    <NavLink to="/quotation-history">
                        <FaHistory />
                        Quotation History
                    </NavLink>
                    <NavLink to="/client-tools">
                        <FaGlobeAsia /> Client Tools
                    </NavLink>
                    <NavLink to="/activity-logs">
                        <FaHistory />
                        Activity Logs
                    </NavLink>
                    <NavLink to="/settings">
                        <FaCog />
                        Settings
                    </NavLink>
                </nav>
            </aside>

            <main className="main-content">
                <header className="topbar">
                    <div>
                        <h6 className="mb-0">Admin Panel</h6>
                        <small className="text-muted">
                            Welcome back, {admin?.name || "Admin"}
                        </small>
                    </div>

                    <button className="btn btn-outline-danger btn-sm" onClick={handleLogout}>
                        <FaSignOutAlt className="me-1" />
                        Logout
                    </button>
                </header>

                <section className="content-area">
                    <Outlet />
                </section>
            </main>
        </div>
    );
};

export default AdminLayout;