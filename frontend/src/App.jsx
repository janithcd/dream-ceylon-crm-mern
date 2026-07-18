import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./routes/ProtectedRoute";
import AdminLayout from "./layouts/AdminLayout";
import ClientTools from "./pages/ClientTools";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Destinations from "./pages/Destinations";
import Packages from "./pages/Packages";
import Inquiries from "./pages/Inquiries";
import Bookings from "./pages/Bookings";
import Vehicles from "./pages/Vehicles";
import Quotations from "./pages/Quotations";
import QuotationHistory from "./pages/QuotationHistory";
import BookingCalendar from "./pages/BookingCalendar";
import FollowUps from "./pages/FollowUps";
import Customers from "./pages/Customers";
import PaymentReports from "./pages/PaymentReports";
import Settings from "./pages/Settings";
import ActivityLogs from "./pages/ActivityLogs";
import Admins from "./pages/Admins";
import { PermissionProvider } from "./context/PermissionContext";
import PermissionRoute from "./components/PermissionRoute";
import AccessDenied from "./pages/AccessDenied";
import ChatConversationDetails from "./pages/ChatConversationDetails";
import ChatAnalytics from "./pages/ChatAnalytics";

import { ROUTE_PERMISSIONS } from "./config/routePermissions";

import ChatConversations from "./pages/ChatConversations";

const App = () => {
    return (
        <AuthProvider>
            <BrowserRouter>
                <Routes>
                    <Route path="/login" element={<Login />} />

                    <Route
                        element={
                            <ProtectedRoute>
                                <PermissionProvider>
                                    <AdminLayout />
                                </PermissionProvider>
                            </ProtectedRoute>
                        }
                    >
                        <Route
                            index
                            element={
                                <PermissionRoute permission={ROUTE_PERMISSIONS.dashboard}>
                                    <Dashboard />
                                </PermissionRoute>
                            }
                        />
                        <Route
                            path="destinations"
                            element={
                                <PermissionRoute permission={ROUTE_PERMISSIONS.destinations}>
                                    <Destinations />
                                </PermissionRoute>
                            }
                        />
                        <Route
                            path="packages"
                            element={
                                <PermissionRoute permission={ROUTE_PERMISSIONS.packages}>
                                    <Packages />
                                </PermissionRoute>
                            }
                        />
                        <Route
                            path="inquiries"
                            element={
                                <PermissionRoute permission={ROUTE_PERMISSIONS.inquiries}>
                                    <Inquiries />
                                </PermissionRoute>
                            }
                        />
                        <Route
                            path="chat-conversations"
                            element={
                                <ChatConversations />
                            }
                        />
                        <Route
                            path="chat-conversations/analytics"
                            element={
                                <ChatAnalytics />
                            }
                        />
                        <Route
                            path="chat-conversations/:id"
                            element={
                                <ChatConversationDetails />
                            }
                        />
                        <Route
                            path="customers"
                            element={
                                <PermissionRoute permission={ROUTE_PERMISSIONS.customers}>
                                    <Customers />
                                </PermissionRoute>
                            }
                        />
                        <Route
                            path="activity-logs"
                            element={
                                <PermissionRoute permission={ROUTE_PERMISSIONS.activityLogs}>
                                    <ActivityLogs />
                                </PermissionRoute>
                            }
                        />
                        <Route
                            path="admins"
                            element={
                                <PermissionRoute permission={ROUTE_PERMISSIONS.admins}>
                                    <Admins />
                                </PermissionRoute>
                            }
                        />
                        <Route
                            path="settings"
                            element={
                                <PermissionRoute permission={ROUTE_PERMISSIONS.settings}>
                                    <Settings />
                                </PermissionRoute>
                            }
                        />
                        <Route
                            path="bookings"
                            element={
                                <PermissionRoute permission={ROUTE_PERMISSIONS.bookings}>
                                    <Bookings />
                                </PermissionRoute>
                            }
                        />
                        <Route
                            path="booking-calendar"
                            element={
                                <PermissionRoute permission={ROUTE_PERMISSIONS.bookingCalendar}>
                                    <BookingCalendar />
                                </PermissionRoute>
                            }
                        />
                        <Route
                            path="payment-reports"
                            element={
                                <PermissionRoute permission={ROUTE_PERMISSIONS.paymentReports}>
                                    <PaymentReports />
                                </PermissionRoute>
                            }
                        />
                        <Route
                            path="follow-ups"
                            element={
                                <PermissionRoute permission={ROUTE_PERMISSIONS.followUps}>
                                    <FollowUps />
                                </PermissionRoute>
                            }
                        />
                        <Route
                            path="vehicles"
                            element={
                                <PermissionRoute permission={ROUTE_PERMISSIONS.vehicles}>
                                    <Vehicles />
                                </PermissionRoute>
                            }
                        />
                        <Route
                            path="client-tools"
                            element={
                                <PermissionRoute
                                    any={[
                                        "inquiry.update",
                                        "quotation.create",
                                        "pdf.generate",
                                    ]}
                                >
                                    <ClientTools />
                                </PermissionRoute>
                            }
                        />
                        <Route
                            path="quotations"
                            element={
                                <PermissionRoute permission={ROUTE_PERMISSIONS.quotations}>
                                    <Quotations />
                                </PermissionRoute>
                            }
                        />
                        <Route
                            path="quotation-history"
                            element={
                                <PermissionRoute permission={ROUTE_PERMISSIONS.quotations}>
                                    <QuotationHistory />
                                </PermissionRoute>
                            }
                        />
                        <Route path="access-denied" element={<AccessDenied />} />

                    </Route>

                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </BrowserRouter>
        </AuthProvider>
    );
};

export default App;