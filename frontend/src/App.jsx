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

const App = () => {
    return (
        <AuthProvider>
            <BrowserRouter>
                <Routes>
                    <Route path="/login" element={<Login />} />

                    <Route
                        path="/"
                        element={
                            <ProtectedRoute>
                                <AdminLayout />
                            </ProtectedRoute>
                        }
                    >
                        <Route index element={<Dashboard />} />
                        <Route path="destinations" element={<Destinations />} />
                        <Route path="packages" element={<Packages />} />
                        <Route path="inquiries" element={<Inquiries />} />
                        <Route path="customers" element={<Customers />} />
                        <Route path="settings" element={<Settings />} />
                        <Route path="bookings" element={<Bookings />} />
                        <Route path="bookings-calendar" element={<BookingCalendar />} />
                        <Route path="payment-reports" element={<PaymentReports />} />
                        <Route path="follow-ups" element={<FollowUps />} />
                        <Route path="vehicles" element={<Vehicles />} />
                        <Route path="client-tools" element={<ClientTools />} />
                        <Route path="quotations" element={<Quotations />} />
                        <Route path="quotation-history" element={<QuotationHistory />} />

                    </Route>

                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </BrowserRouter>
        </AuthProvider>
    );
};

export default App;