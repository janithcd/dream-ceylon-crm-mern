import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { PermissionProvider } from "./context/PermissionContext";
import PermissionRoute from "./components/PermissionRoute";
import PageLoading from "./components/PageLoading";
import PageErrorBoundary from "./components/PageErrorBoundary";
import ProtectedRoute from "./routes/ProtectedRoute";
import AdminLayout from "./layouts/AdminLayout";
import { ROUTE_PERMISSIONS } from "./config/routePermissions";

const ClientTools = lazy(() => import("./pages/ClientTools"));
const Login = lazy(() => import("./pages/Login"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Destinations = lazy(() => import("./pages/Destinations"));
const Packages = lazy(() => import("./pages/Packages"));
const Inquiries = lazy(() => import("./pages/Inquiries"));
const LeadInsights = lazy(() => import("./pages/LeadInsights"));
const LeadTriage = lazy(() => import("./pages/LeadTriage"));
const Bookings = lazy(() => import("./pages/Bookings"));
const TeamHandovers = lazy(() => import("./pages/TeamHandovers"));
const MyTasks = lazy(() => import("./pages/MyTasks"));
const TeamTasks = lazy(() => import("./pages/TeamTasks"));
const SupplierConfirmations = lazy(() => import("./pages/SupplierConfirmations"));
const HotelCancellationDeadlines = lazy(() => import("./pages/HotelCancellationDeadlines"));
const CancellationReview = lazy(() => import("./pages/CancellationReview"));
const AirportTransfers = lazy(() => import("./pages/AirportTransfers"));
const DepartureReadiness = lazy(() => import("./pages/DepartureReadiness"));
const PostTripCare = lazy(() => import("./pages/PostTripCare"));
const TripSupport = lazy(() => import("./pages/TripSupport"));
const Vehicles = lazy(() => import("./pages/Vehicles"));
const Quotations = lazy(() => import("./pages/Quotations"));
const QuotationHistory = lazy(() => import("./pages/QuotationHistory"));
const BookingCalendar = lazy(() => import("./pages/BookingCalendar"));
const FollowUps = lazy(() => import("./pages/FollowUps"));
const Customers = lazy(() => import("./pages/Customers"));
const PaymentReports = lazy(() => import("./pages/PaymentReports"));
const OutstandingBalances = lazy(() => import("./pages/OutstandingBalances"));
const CostProfit = lazy(() => import("./pages/CostProfit"));
const Settings = lazy(() => import("./pages/Settings"));
const ActivityLogs = lazy(() => import("./pages/ActivityLogs"));
const Admins = lazy(() => import("./pages/Admins"));
const AccessDenied = lazy(() => import("./pages/AccessDenied"));
const ChatConversationDetails = lazy(() => import("./pages/ChatConversationDetails"));
const ChatAnalytics = lazy(() => import("./pages/ChatAnalytics"));
const ChatConversations = lazy(() => import("./pages/ChatConversations"));

const App = () => {
    return (
        <AuthProvider>
            <BrowserRouter>
                <PageErrorBoundary>
                <Suspense fallback={<PageLoading />}>
                <Routes>
                    <Route path="/login" element={<Login />} />
                    <Route path="/forgot-password" element={<ForgotPassword />} />

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
                        <Route path="lead-insights" element={
                            <PermissionRoute permission={ROUTE_PERMISSIONS.inquiries}>
                                <LeadInsights />
                            </PermissionRoute>
                        } />
                        <Route path="lead-triage" element={
                            <PermissionRoute permission={ROUTE_PERMISSIONS.inquiries}>
                                <LeadTriage />
                            </PermissionRoute>
                        } />
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
                        <Route path="team-handovers" element={
                            <PermissionRoute permission={ROUTE_PERMISSIONS.bookings}>
                                <TeamHandovers />
                            </PermissionRoute>
                        } />
                        <Route
                            path="my-tasks"
                            element={
                                <PermissionRoute permission={ROUTE_PERMISSIONS.myTasks}>
                                    <MyTasks />
                                </PermissionRoute>
                            }
                        />
                        <Route
                            path="team-tasks"
                            element={
                                <PermissionRoute permission={ROUTE_PERMISSIONS.teamTasks}>
                                    <TeamTasks />
                                </PermissionRoute>
                            }
                        />
                        <Route
                            path="airport-transfers"
                            element={
                                <PermissionRoute permission={ROUTE_PERMISSIONS.airportTransfers}>
                                    <AirportTransfers />
                                </PermissionRoute>
                            }
                        />
                        <Route path="departure-readiness" element={
                            <PermissionRoute permission={ROUTE_PERMISSIONS.bookings}>
                                <DepartureReadiness />
                            </PermissionRoute>
                        } />
                        <Route path="post-trip-care" element={
                            <PermissionRoute permission={ROUTE_PERMISSIONS.bookings}>
                                <PostTripCare />
                            </PermissionRoute>
                        } />
                        <Route path="trip-support" element={
                            <PermissionRoute permission={ROUTE_PERMISSIONS.bookings}>
                                <TripSupport />
                            </PermissionRoute>
                        } />
                        <Route
                            path="supplier-confirmations"
                            element={
                                <PermissionRoute permission={ROUTE_PERMISSIONS.supplierConfirmations}>
                                    <SupplierConfirmations />
                                </PermissionRoute>
                            }
                        />
                        <Route path="hotel-cancellation-deadlines" element={
                            <PermissionRoute permission={ROUTE_PERMISSIONS.hotelDeadlines}>
                                <HotelCancellationDeadlines />
                            </PermissionRoute>
                        } />
                        <Route path="cancellation-review" element={
                            <PermissionRoute permission={ROUTE_PERMISSIONS.bookings}>
                                <CancellationReview />
                            </PermissionRoute>
                        } />
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
                            path="outstanding-balances"
                            element={
                                <PermissionRoute all={[ROUTE_PERMISSIONS.bookings, ROUTE_PERMISSIONS.payments]}>
                                    <OutstandingBalances />
                                </PermissionRoute>
                            }
                        />
                        <Route
                            path="cost-profit"
                            element={
                                <PermissionRoute all={[ROUTE_PERMISSIONS.costProfit, ROUTE_PERMISSIONS.quotations, ROUTE_PERMISSIONS.bookings]}>
                                    <CostProfit />
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
                </Suspense>
                </PageErrorBoundary>
            </BrowserRouter>
        </AuthProvider>
    );
};

export default App;
