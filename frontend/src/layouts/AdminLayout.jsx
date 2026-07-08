import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
    FaChartLine,
    FaMapMarkedAlt,
    FaRoute,
    FaEnvelopeOpenText,
    FaCalendarCheck,
    FaCar,
    FaSignOutAlt,
} from "react-icons/fa";
import { useAuth } from "../context/AuthContext";

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

                    <NavLink to="/bookings">
                        <FaCalendarCheck /> Bookings
                    </NavLink>

                    <NavLink to="/vehicles">
                        <FaCar /> Vehicles
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