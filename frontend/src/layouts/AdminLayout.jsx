import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
    FaBell,
    FaCalendarAlt,
    FaCalendarCheck,
    FaCar,
    FaChartLine,
    FaCog,
    FaEnvelopeOpenText,
    FaFileInvoiceDollar,
    FaGlobeAsia,
    FaHistory,
    FaMapMarkedAlt,
    FaMoneyBillWave,
    FaRoute,
    FaSignOutAlt,
    FaUsers,
    FaUsersCog,
} from "react-icons/fa";

import { useAuth } from "../context/AuthContext";
import PermissionGuard from "../components/PermissionGuard";
import { ROUTE_PERMISSIONS } from "../config/routePermissions";

const AdminLayout = () => {
    const { admin, logout } = useAuth();
    const navigate = useNavigate();

    const handleLogout = () => {
        logout();

        navigate("/login", {
            replace: true,
        });
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
                    <PermissionGuard
                        permission={ROUTE_PERMISSIONS.dashboard}
                    >
                        <NavLink to="/" end>
                            <FaChartLine />
                            Dashboard
                        </NavLink>
                    </PermissionGuard>

                    <PermissionGuard
                        permission={ROUTE_PERMISSIONS.destinations}
                    >
                        <NavLink to="/destinations">
                            <FaMapMarkedAlt />
                            Destinations
                        </NavLink>
                    </PermissionGuard>

                    <PermissionGuard
                        permission={ROUTE_PERMISSIONS.packages}
                    >
                        <NavLink to="/packages">
                            <FaRoute />
                            Packages
                        </NavLink>
                    </PermissionGuard>

                    <PermissionGuard
                        permission={ROUTE_PERMISSIONS.inquiries}
                    >
                        <NavLink to="/inquiries">
                            <FaEnvelopeOpenText />
                            Inquiries
                        </NavLink>
                    </PermissionGuard>

                    <PermissionGuard
                        permission={ROUTE_PERMISSIONS.customers}
                    >
                        <NavLink to="/customers">
                            <FaUsers />
                            Customers
                        </NavLink>
                    </PermissionGuard>

                    <PermissionGuard
                        permission={ROUTE_PERMISSIONS.bookings}
                    >
                        <NavLink to="/bookings">
                            <FaCalendarCheck />
                            Bookings
                        </NavLink>
                    </PermissionGuard>

                    <PermissionGuard
                        permission={ROUTE_PERMISSIONS.bookingCalendar}
                    >
                        <NavLink to="/booking-calendar">
                            <FaCalendarAlt />
                            Booking Calendar
                        </NavLink>
                    </PermissionGuard>

                    <PermissionGuard
                        permission={ROUTE_PERMISSIONS.paymentReports}
                    >
                        <NavLink to="/payment-reports">
                            <FaMoneyBillWave />
                            Payment Reports
                        </NavLink>
                    </PermissionGuard>

                    <PermissionGuard
                        permission={ROUTE_PERMISSIONS.followUps}
                    >
                        <NavLink to="/follow-ups">
                            <FaBell />
                            Follow-Ups
                        </NavLink>
                    </PermissionGuard>

                    <PermissionGuard
                        permission={ROUTE_PERMISSIONS.vehicles}
                    >
                        <NavLink to="/vehicles">
                            <FaCar />
                            Vehicles
                        </NavLink>
                    </PermissionGuard>

                    <PermissionGuard
                        permission={ROUTE_PERMISSIONS.quotations}
                    >
                        <NavLink to="/quotations">
                            <FaFileInvoiceDollar />
                            Quotations
                        </NavLink>
                    </PermissionGuard>

                    <PermissionGuard
                        permission={ROUTE_PERMISSIONS.quotations}
                    >
                        <NavLink to="/quotation-history">
                            <FaHistory />
                            Quotation History
                        </NavLink>
                    </PermissionGuard>

                    <PermissionGuard
                        any={[
                            "inquiry.update",
                            "quotation.create",
                            "pdf.generate",
                        ]}
                    >
                        <NavLink to="/client-tools">
                            <FaGlobeAsia />
                            Client Tools
                        </NavLink>
                    </PermissionGuard>

                    <PermissionGuard
                        permission={ROUTE_PERMISSIONS.activityLogs}
                    >
                        <NavLink to="/activity-logs">
                            <FaHistory />
                            Activity Logs
                        </NavLink>
                    </PermissionGuard>

                    <PermissionGuard
                        permission={ROUTE_PERMISSIONS.admins}
                    >
                        <NavLink to="/admins">
                            <FaUsersCog />
                            Admin Management
                        </NavLink>
                    </PermissionGuard>

                    <PermissionGuard
                        permission={ROUTE_PERMISSIONS.settings}
                    >
                        <NavLink to="/settings">
                            <FaCog />
                            Settings
                        </NavLink>
                    </PermissionGuard>
                </nav>
            </aside>

            <main className="main-content">
                <header className="topbar">
                    <div>
                        <h6 className="mb-0">Admin Panel</h6>

                        <small className="text-muted">
                            Welcome back, {admin?.name || "Admin"}
                            {admin?.role ? ` · ${admin.role}` : ""}
                        </small>
                    </div>

                    <button
                        type="button"
                        className="btn btn-outline-danger btn-sm"
                        onClick={handleLogout}
                    >
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