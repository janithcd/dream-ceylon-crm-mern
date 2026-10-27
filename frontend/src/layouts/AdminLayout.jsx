import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
    FaBell,
    FaBan,
    FaCalendarAlt,
    FaCalendarCheck,
    FaCar,
    FaChartLine,
    FaChartBar,
    FaClipboardCheck,
    FaCog,
    FaCoins,
    FaEnvelopeOpenText,
    FaFileInvoiceDollar,
    FaGlobeAsia,
    FaHotel,
    FaLifeRing,
    FaHeart,
    FaHistory,
    FaMapMarkedAlt,
    FaMoneyBillWave,
    FaRoute,
    FaPlane,
    FaTasks,
    FaClipboardList,
    FaSignOutAlt,
    FaUsers,
    FaUsersCog,
    FaRobot,
    FaWallet,
} from "react-icons/fa";

import { useAuth } from "../context/AuthContext";
import PermissionGuard from "../components/PermissionGuard";
import TaskAlert from "../components/TaskAlert";
import LeadAlert from "../components/LeadAlert";
import SupplierAlert from "../components/SupplierAlert";
import PaymentAlert from "../components/PaymentAlert";
import SupplierPayableAlert from "../components/SupplierPayableAlert";
import TripSupportAlert from "../components/TripSupportAlert";
import RecoveryAlert from "../components/RecoveryAlert";
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
                    <PermissionGuard permission={ROUTE_PERMISSIONS.inquiries}>
                        <NavLink to="/lead-triage">
                            <FaClipboardCheck />
                            New Lead Queue
                        </NavLink>
                    </PermissionGuard>
                    <PermissionGuard permission={ROUTE_PERMISSIONS.inquiries}>
                        <NavLink to="/lead-insights">
                            <FaChartBar />
                            Lead Insights
                        </NavLink>
                    </PermissionGuard>
                    <PermissionGuard
                        permission={
                            ROUTE_PERMISSIONS.inquiries
                        }
                    >
                        <NavLink to="/chat-conversations">
                            <FaRobot />
                            AI Conversations
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

                    <PermissionGuard permission={ROUTE_PERMISSIONS.bookings}>
                        <NavLink to="/departure-readiness">
                            <FaClipboardCheck />
                            Departure Readiness
                        </NavLink>
                    </PermissionGuard>

                    <PermissionGuard permission={ROUTE_PERMISSIONS.bookings}>
                        <NavLink to="/post-trip-care">
                            <FaHeart />
                            Post-trip Care
                        </NavLink>
                    </PermissionGuard>

                    <PermissionGuard permission={ROUTE_PERMISSIONS.bookings}>
                        <NavLink to="/trip-support">
                            <FaLifeRing />
                            Trip Support
                        </NavLink>
                    </PermissionGuard>

                    <PermissionGuard permission={ROUTE_PERMISSIONS.myTasks}>
                        <NavLink to="/my-tasks">
                            <FaTasks />
                            My Tasks
                        </NavLink>
                    </PermissionGuard>

                    <PermissionGuard permission={ROUTE_PERMISSIONS.teamTasks}>
                        <NavLink to="/team-tasks">
                            <FaClipboardList />
                            Team Tasks
                        </NavLink>
                    </PermissionGuard>

                    <PermissionGuard permission={ROUTE_PERMISSIONS.airportTransfers}>
                        <NavLink to="/airport-transfers">
                            <FaPlane />
                            Airport Transfers
                        </NavLink>
                    </PermissionGuard>

                    <PermissionGuard permission={ROUTE_PERMISSIONS.supplierConfirmations}>
                        <NavLink to="/supplier-confirmations">
                            <FaClipboardCheck />
                            Supplier Confirmations
                        </NavLink>
                    </PermissionGuard>

                    <PermissionGuard permission={ROUTE_PERMISSIONS.hotelDeadlines}>
                        <NavLink to="/hotel-cancellation-deadlines">
                            <FaHotel />
                            Hotel Deadlines
                        </NavLink>
                    </PermissionGuard>

                    <PermissionGuard permission={ROUTE_PERMISSIONS.bookings}>
                        <NavLink to="/cancellation-review">
                            <FaBan />
                            Cancellation Review
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

                    <PermissionGuard all={[ROUTE_PERMISSIONS.bookings, ROUTE_PERMISSIONS.payments]}>
                        <NavLink to="/outstanding-balances">
                            <FaWallet />
                            Outstanding Balances
                        </NavLink>
                    </PermissionGuard>

                    <PermissionGuard all={[ROUTE_PERMISSIONS.costProfit, ROUTE_PERMISSIONS.quotations, ROUTE_PERMISSIONS.bookings]}>
                        <NavLink to="/cost-profit">
                            <FaCoins />
                            Cost &amp; Profit
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

                    <div className="d-flex align-items-center flex-wrap gap-3">
                        <PermissionGuard permission={ROUTE_PERMISSIONS.bookings}>
                            <TripSupportAlert />
                        </PermissionGuard>
                        <PermissionGuard permission={ROUTE_PERMISSIONS.bookings}>
                            <RecoveryAlert />
                        </PermissionGuard>
                        <PermissionGuard all={[ROUTE_PERMISSIONS.inquiries, "inquiry.update"]}>
                            <LeadAlert />
                        </PermissionGuard>
                        <PermissionGuard all={[ROUTE_PERMISSIONS.bookings, ROUTE_PERMISSIONS.payments]}>
                            <PaymentAlert />
                        </PermissionGuard>
                        <PermissionGuard all={[ROUTE_PERMISSIONS.costProfit, ROUTE_PERMISSIONS.quotations, ROUTE_PERMISSIONS.bookings]}>
                            <SupplierPayableAlert />
                        </PermissionGuard>
                        <PermissionGuard permission={ROUTE_PERMISSIONS.supplierConfirmations}>
                            <SupplierAlert />
                        </PermissionGuard>
                        <PermissionGuard permission={ROUTE_PERMISSIONS.myTasks}>
                            <TaskAlert />
                        </PermissionGuard>
                        <button
                            type="button"
                            className="btn btn-outline-danger btn-sm"
                            onClick={handleLogout}
                        >
                            <FaSignOutAlt className="me-1" />
                            Logout
                        </button>
                    </div>
                </header>

                <section className="content-area">
                    <Outlet />
                </section>
            </main>
        </div>
    );
};

export default AdminLayout;
