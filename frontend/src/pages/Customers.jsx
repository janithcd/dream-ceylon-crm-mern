import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    FaBell,
    FaCalendarCheck,
    FaClipboardList,
    FaFileInvoiceDollar,
    FaMoneyBillWave,
    FaSearch,
    FaUserCircle,
    FaUsers,
    FaWallet,
} from "react-icons/fa";
import api from "../api/axios";

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

const getBadgeClass = (status) => {
    switch (status) {
        case "New":
        case "Pending":
        case "Draft":
            return "text-bg-primary";
        case "Contacted":
        case "In Progress":
        case "Sent":
            return "text-bg-info";
        case "Follow Up":
        case "Partially Paid":
        case "High":
        case "Urgent":
            return "text-bg-warning";
        case "Converted":
        case "Accepted":
        case "Confirmed":
        case "Completed":
        case "Paid":
        case "Received":
            return "text-bg-success";
        case "Cancelled":
        case "Rejected":
        case "Expired":
        case "Refunded":
            return "text-bg-danger";
        default:
            return "text-bg-secondary";
    }
};

const SummaryCard = ({ title, value, subtitle, icon, variant = "success" }) => {
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

const SectionCard = ({ title, icon, children }) => {
    return (
        <div className="card border-0 shadow-sm rounded-4 mb-4">
            <div className="card-body p-4">
                <div className="d-flex align-items-center gap-2 mb-3">
                    <span className="text-success">{icon}</span>
                    <h5 className="fw-bold mb-0">{title}</h5>
                </div>

                {children}
            </div>
        </div>
    );
};

const Customers = () => {
    const navigate = useNavigate();

    const [searchInput, setSearchInput] = useState("");
    const [customers, setCustomers] = useState([]);
    const [profile, setProfile] = useState(null);

    const [searchLoading, setSearchLoading] = useState(false);
    const [profileLoading, setProfileLoading] = useState(false);

    const [error, setError] = useState("");

    const handleSearch = async (e) => {
        e.preventDefault();

        if (!searchInput.trim()) {
            setError("Please enter customer name, email, WhatsApp number, or country.");
            return;
        }

        try {
            setSearchLoading(true);
            setError("");
            setProfile(null);

            const response = await api.get("/customers/search", {
                params: {
                    keyword: searchInput.trim(),
                },
            });

            setCustomers(response.data.customers || []);
        } catch (err) {
            setError(
                err.response?.data?.message ||
                err.response?.data?.error ||
                "Failed to search customers."
            );
        } finally {
            setSearchLoading(false);
        }
    };

    const loadCustomerProfile = async (customer) => {
        try {
            setProfileLoading(true);
            setError("");

            const params = {};

            if (customer.email) {
                params.email = customer.email;
            } else if (customer.whatsappNumber) {
                params.whatsappNumber = customer.whatsappNumber;
            } else if (customer.customerName) {
                params.customerName = customer.customerName;
            } else {
                params.keyword = searchInput.trim();
            }

            const response = await api.get("/customers/profile", { params });

            setProfile(response.data || null);
            window.scrollTo({
                top: 0,
                behavior: "smooth",
            });
        } catch (err) {
            setError(
                err.response?.data?.message ||
                err.response?.data?.error ||
                "Failed to load customer profile."
            );
        } finally {
            setProfileLoading(false);
        }
    };

    const loadProfileByKeyword = async () => {
        if (!searchInput.trim()) {
            setError("Please enter a keyword first.");
            return;
        }

        await loadCustomerProfile({
            customerName: searchInput.trim(),
        });
    };

    return (
        <div>
            <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-4 gap-3">
                <div>
                    <h2 className="fw-bold mb-1">Customers</h2>
                    <p className="text-muted mb-0">
                        Search a customer and view complete CRM history in one place.
                    </p>
                </div>

                <button
                    className="btn btn-outline-success"
                    onClick={() => navigate("/follow-ups")}
                >
                    <FaBell className="me-2" />
                    Manage Follow-Ups
                </button>
            </div>

            {error && <div className="alert alert-danger">{error}</div>}

            <div className="card border-0 shadow-sm rounded-4 mb-4">
                <div className="card-body p-4">
                    <h5 className="fw-bold mb-3">Search Customer</h5>

                    <form onSubmit={handleSearch}>
                        <div className="row g-3">
                            <div className="col-12 col-lg-9">
                                <input
                                    type="text"
                                    className="form-control form-control-lg"
                                    placeholder="Search by name, email, WhatsApp number, country..."
                                    value={searchInput}
                                    onChange={(e) => setSearchInput(e.target.value)}
                                />
                            </div>

                            <div className="col-12 col-lg-3 d-grid">
                                <button
                                    className="btn btn-primary btn-lg"
                                    type="submit"
                                    disabled={searchLoading}
                                >
                                    <FaSearch className="me-2" />
                                    {searchLoading ? "Searching..." : "Search"}
                                </button>
                            </div>
                        </div>
                    </form>

                    <div className="mt-3">
                        <button
                            className="btn btn-sm btn-outline-secondary"
                            onClick={loadProfileByKeyword}
                            disabled={profileLoading}
                        >
                            Load full profile by keyword
                        </button>
                    </div>
                </div>
            </div>

            {profileLoading && (
                <div className="card border-0 shadow-sm rounded-4 mb-4">
                    <div className="card-body p-4 text-muted">
                        Loading customer profile...
                    </div>
                </div>
            )}

            {profile && (
                <>
                    <div className="card border-0 shadow-sm rounded-4 mb-4">
                        <div className="card-body p-4">
                            <div className="d-flex flex-column flex-lg-row justify-content-between gap-4">
                                <div className="d-flex gap-3">
                                    <div className="stat-icon">
                                        <FaUserCircle />
                                    </div>

                                    <div>
                                        <h3 className="fw-bold mb-1">
                                            {profile.customer?.customerName || "Customer"}
                                        </h3>

                                        <p className="text-muted mb-1">
                                            {profile.customer?.country || "Country not available"}
                                        </p>

                                        <p className="mb-0">
                                            <strong>Email:</strong>{" "}
                                            {profile.customer?.email || "-"}
                                            <br />
                                            <strong>WhatsApp:</strong>{" "}
                                            {profile.customer?.whatsappNumber || "-"}
                                        </p>
                                    </div>
                                </div>

                                <div className="d-flex flex-wrap gap-2 align-items-start">
                                    {profile.inquiries?.[0]?._id && (
                                        <>
                                            <button
                                                className="btn btn-outline-warning"
                                                onClick={() =>
                                                    navigate(
                                                        `/follow-ups?inquiry=${profile.inquiries[0]._id}`
                                                    )
                                                }
                                            >
                                                <FaBell className="me-2" />
                                                Follow-Up
                                            </button>

                                            <button
                                                className="btn btn-outline-success"
                                                onClick={() =>
                                                    navigate(
                                                        `/quotations?inquiry=${profile.inquiries[0]._id}`
                                                    )
                                                }
                                            >
                                                <FaFileInvoiceDollar className="me-2" />
                                                New Quotation
                                            </button>
                                        </>
                                    )}

                                    <button
                                        className="btn btn-outline-dark"
                                        onClick={() => navigate("/bookings")}
                                    >
                                        <FaCalendarCheck className="me-2" />
                                        Bookings
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="row g-4 mb-4">
                        <div className="col-xl-2 col-md-4 col-sm-6">
                            <SummaryCard
                                title="Inquiries"
                                value={profile.summary?.totalInquiries || 0}
                                subtitle="customer leads"
                                icon={<FaClipboardList />}
                                variant="primary"
                            />
                        </div>

                        <div className="col-xl-2 col-md-4 col-sm-6">
                            <SummaryCard
                                title="Quotations"
                                value={profile.summary?.totalQuotations || 0}
                                subtitle="sent quotes"
                                icon={<FaFileInvoiceDollar />}
                                variant="success"
                            />
                        </div>

                        <div className="col-xl-2 col-md-4 col-sm-6">
                            <SummaryCard
                                title="Bookings"
                                value={profile.summary?.totalBookings || 0}
                                subtitle="tour bookings"
                                icon={<FaCalendarCheck />}
                                variant="dark"
                            />
                        </div>

                        <div className="col-xl-2 col-md-4 col-sm-6">
                            <SummaryCard
                                title="Payments"
                                value={profile.summary?.totalPayments || 0}
                                subtitle="payment records"
                                icon={<FaWallet />}
                                variant="warning"
                            />
                        </div>

                        <div className="col-xl-2 col-md-4 col-sm-6">
                            <SummaryCard
                                title="Follow-Ups"
                                value={profile.summary?.totalFollowUps || 0}
                                subtitle={`${profile.summary?.pendingFollowUps || 0} pending`}
                                icon={<FaBell />}
                                variant="danger"
                            />
                        </div>

                        <div className="col-xl-2 col-md-4 col-sm-6">
                            <SummaryCard
                                title="Balance"
                                value={formatMoney(
                                    profile.summary?.totalBalanceAmount || 0,
                                    profile.summary?.currency || "USD"
                                )}
                                subtitle="remaining amount"
                                icon={<FaMoneyBillWave />}
                                variant="success"
                            />
                        </div>
                    </div>

                    <SectionCard title="Financial Summary" icon={<FaMoneyBillWave />}>
                        <div className="row g-3">
                            <div className="col-md-4">
                                <div className="border rounded-4 p-3">
                                    <p className="text-muted mb-1">Total Booking Value</p>
                                    <h5 className="fw-bold mb-0">
                                        {formatMoney(
                                            profile.summary?.totalBookingValue || 0,
                                            profile.summary?.currency || "USD"
                                        )}
                                    </h5>
                                </div>
                            </div>

                            <div className="col-md-4">
                                <div className="border rounded-4 p-3">
                                    <p className="text-muted mb-1">Total Paid</p>
                                    <h5 className="fw-bold text-success mb-0">
                                        {formatMoney(
                                            profile.summary?.totalPaidAmount || 0,
                                            profile.summary?.currency || "USD"
                                        )}
                                    </h5>
                                </div>
                            </div>

                            <div className="col-md-4">
                                <div className="border rounded-4 p-3">
                                    <p className="text-muted mb-1">Balance</p>
                                    <h5 className="fw-bold text-danger mb-0">
                                        {formatMoney(
                                            profile.summary?.totalBalanceAmount || 0,
                                            profile.summary?.currency || "USD"
                                        )}
                                    </h5>
                                </div>
                            </div>
                        </div>
                    </SectionCard>

                    <SectionCard title="Inquiries" icon={<FaClipboardList />}>
                        {!profile.inquiries || profile.inquiries.length === 0 ? (
                            <p className="text-muted mb-0">No inquiries found.</p>
                        ) : (
                            <div className="table-responsive">
                                <table className="table align-middle mb-0">
                                    <thead>
                                    <tr>
                                        <th>Customer</th>
                                        <th>Travel Date</th>
                                        <th>Package</th>
                                        <th>Priority</th>
                                        <th>Status</th>
                                        <th className="text-end">Actions</th>
                                    </tr>
                                    </thead>

                                    <tbody>
                                    {profile.inquiries.map((inquiry) => (
                                        <tr key={inquiry._id}>
                                            <td>
                                                <h6 className="mb-1">{inquiry.fullName}</h6>
                                                <small className="text-muted">
                                                    {inquiry.country}
                                                    <br />
                                                    {inquiry.whatsappNumber}
                                                </small>
                                            </td>

                                            <td>{formatDate(inquiry.travelDate)}</td>

                                            <td>
                                                {inquiry.interestedPackage?.title || "No package"}
                                            </td>

                                            <td>
                          <span
                              className={`badge ${getBadgeClass(
                                  inquiry.priority
                              )}`}
                          >
                            {inquiry.priority}
                          </span>
                                            </td>

                                            <td>
                          <span
                              className={`badge ${getBadgeClass(inquiry.status)}`}
                          >
                            {inquiry.status}
                          </span>
                                            </td>

                                            <td className="text-end">
                                                <div className="d-flex justify-content-end gap-2">
                                                    <button
                                                        className="btn btn-sm btn-outline-warning"
                                                        onClick={() =>
                                                            navigate(`/follow-ups?inquiry=${inquiry._id}`)
                                                        }
                                                    >
                                                        <FaBell />
                                                    </button>

                                                    <button
                                                        className="btn btn-sm btn-outline-success"
                                                        onClick={() =>
                                                            navigate(`/quotations?inquiry=${inquiry._id}`)
                                                        }
                                                    >
                                                        <FaFileInvoiceDollar />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </SectionCard>

                    <SectionCard title="Quotations" icon={<FaFileInvoiceDollar />}>
                        {!profile.quotations || profile.quotations.length === 0 ? (
                            <p className="text-muted mb-0">No quotations found.</p>
                        ) : (
                            <div className="table-responsive">
                                <table className="table align-middle mb-0">
                                    <thead>
                                    <tr>
                                        <th>Quotation</th>
                                        <th>Tour</th>
                                        <th>Total</th>
                                        <th>Status</th>
                                        <th>Date</th>
                                        <th className="text-end">Actions</th>
                                    </tr>
                                    </thead>

                                    <tbody>
                                    {profile.quotations.map((quotation) => (
                                        <tr key={quotation._id}>
                                            <td>
                                                <strong>{quotation.quotationNo}</strong>
                                                <br />
                                                <small className="text-muted">
                                                    {quotation.clientName}
                                                </small>
                                            </td>

                                            <td>{quotation.tourTitle}</td>

                                            <td>
                                                {formatMoney(
                                                    quotation.totals?.grandTotal,
                                                    quotation.currency
                                                )}
                                            </td>

                                            <td>
                          <span
                              className={`badge ${getBadgeClass(
                                  quotation.status
                              )}`}
                          >
                            {quotation.status}
                          </span>
                                            </td>

                                            <td>{formatDate(quotation.createdAt)}</td>

                                            <td className="text-end">
                                                <div className="d-flex justify-content-end gap-2">
                                                    <button
                                                        className="btn btn-sm btn-outline-warning"
                                                        onClick={() =>
                                                            navigate(
                                                                `/follow-ups?quotation=${quotation._id}`
                                                            )
                                                        }
                                                    >
                                                        <FaBell />
                                                    </button>

                                                    <button
                                                        className="btn btn-sm btn-outline-primary"
                                                        onClick={() =>
                                                            navigate(`/quotations?edit=${quotation._id}`)
                                                        }
                                                    >
                                                        Edit
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </SectionCard>

                    <SectionCard title="Bookings" icon={<FaCalendarCheck />}>
                        {!profile.bookings || profile.bookings.length === 0 ? (
                            <p className="text-muted mb-0">No bookings found.</p>
                        ) : (
                            <div className="table-responsive">
                                <table className="table align-middle mb-0">
                                    <thead>
                                    <tr>
                                        <th>Booking</th>
                                        <th>Travel Dates</th>
                                        <th>Vehicle</th>
                                        <th>Total</th>
                                        <th>Payment</th>
                                        <th>Status</th>
                                        <th className="text-end">Actions</th>
                                    </tr>
                                    </thead>

                                    <tbody>
                                    {profile.bookings.map((booking) => (
                                        <tr key={booking._id}>
                                            <td>
                                                <strong>{booking.bookingCode}</strong>
                                                <br />
                                                <small className="text-muted">
                                                    {booking.selectedPackage?.title || "No package"}
                                                </small>
                                            </td>

                                            <td>
                                                {formatDate(booking.travelStartDate)} -{" "}
                                                {formatDate(booking.travelEndDate)}
                                            </td>

                                            <td>{booking.vehicleType}</td>

                                            <td>
                                                {formatMoney(booking.totalPrice, booking.currency)}
                                            </td>

                                            <td>
                          <span
                              className={`badge ${getBadgeClass(
                                  booking.paymentStatus
                              )}`}
                          >
                            {booking.paymentStatus}
                          </span>
                                            </td>

                                            <td>
                          <span
                              className={`badge ${getBadgeClass(
                                  booking.bookingStatus
                              )}`}
                          >
                            {booking.bookingStatus}
                          </span>
                                            </td>

                                            <td className="text-end">
                                                <button
                                                    className="btn btn-sm btn-outline-warning"
                                                    onClick={() =>
                                                        navigate(`/follow-ups?booking=${booking._id}`)
                                                    }
                                                >
                                                    <FaBell />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </SectionCard>

                    <SectionCard title="Payments" icon={<FaWallet />}>
                        {!profile.payments || profile.payments.length === 0 ? (
                            <p className="text-muted mb-0">No payments found.</p>
                        ) : (
                            <div className="table-responsive">
                                <table className="table align-middle mb-0">
                                    <thead>
                                    <tr>
                                        <th>Payment No</th>
                                        <th>Booking</th>
                                        <th>Date</th>
                                        <th>Type</th>
                                        <th>Method</th>
                                        <th>Amount</th>
                                        <th>Status</th>
                                    </tr>
                                    </thead>

                                    <tbody>
                                    {profile.payments.map((payment) => (
                                        <tr key={payment._id}>
                                            <td>
                                                <strong>{payment.paymentNo}</strong>
                                                <br />
                                                <small className="text-muted">
                                                    {payment.referenceNumber || "-"}
                                                </small>
                                            </td>

                                            <td>{payment.booking?.bookingCode || "-"}</td>

                                            <td>{formatDate(payment.paymentDate)}</td>

                                            <td>{payment.paymentType}</td>

                                            <td>{payment.paymentMethod}</td>

                                            <td>
                                                {formatMoney(payment.amount, payment.currency)}
                                            </td>

                                            <td>
                          <span
                              className={`badge ${getBadgeClass(payment.status)}`}
                          >
                            {payment.status}
                          </span>
                                            </td>
                                        </tr>
                                    ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </SectionCard>

                    <SectionCard title="Follow-Ups" icon={<FaBell />}>
                        {!profile.followUps || profile.followUps.length === 0 ? (
                            <p className="text-muted mb-0">No follow-ups found.</p>
                        ) : (
                            <div className="table-responsive">
                                <table className="table align-middle mb-0">
                                    <thead>
                                    <tr>
                                        <th>Reminder</th>
                                        <th>Date</th>
                                        <th>Type</th>
                                        <th>Priority</th>
                                        <th>Status</th>
                                    </tr>
                                    </thead>

                                    <tbody>
                                    {profile.followUps.map((followUp) => (
                                        <tr key={followUp._id}>
                                            <td>
                                                <strong>{followUp.title}</strong>
                                                <br />
                                                <small className="text-muted">
                                                    {followUp.notes || "-"}
                                                </small>
                                            </td>

                                            <td>{formatDate(followUp.followUpDate)}</td>

                                            <td>{followUp.type}</td>

                                            <td>
                          <span
                              className={`badge ${getBadgeClass(
                                  followUp.priority
                              )}`}
                          >
                            {followUp.priority}
                          </span>
                                            </td>

                                            <td>
                          <span
                              className={`badge ${getBadgeClass(
                                  followUp.status
                              )}`}
                          >
                            {followUp.status}
                          </span>
                                            </td>
                                        </tr>
                                    ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </SectionCard>
                </>
            )}

            {!profile && customers.length > 0 && (
                <div className="card border-0 shadow-sm rounded-4">
                    <div className="card-body p-4">
                        <div className="d-flex align-items-center gap-2 mb-3">
                            <FaUsers className="text-success" />
                            <h5 className="fw-bold mb-0">Search Results</h5>
                        </div>

                        <div className="table-responsive">
                            <table className="table align-middle mb-0">
                                <thead>
                                <tr>
                                    <th>Customer</th>
                                    <th>Contact</th>
                                    <th>CRM Records</th>
                                    <th>Booking Value</th>
                                    <th>Balance</th>
                                    <th className="text-end">Action</th>
                                </tr>
                                </thead>

                                <tbody>
                                {customers.map((customer, index) => (
                                    <tr key={`${customer.email || customer.whatsappNumber}-${index}`}>
                                        <td>
                                            <h6 className="mb-1">{customer.customerName}</h6>
                                            <small className="text-muted">
                                                {customer.country || "-"}
                                            </small>
                                        </td>

                                        <td>
                                            <small>
                                                {customer.email || "-"}
                                                <br />
                                                {customer.whatsappNumber || "-"}
                                            </small>
                                        </td>

                                        <td>
                                            <small>
                                                Inquiries: {customer.counts?.inquiries || 0}
                                                <br />
                                                Quotations: {customer.counts?.quotations || 0}
                                                <br />
                                                Bookings: {customer.counts?.bookings || 0}
                                                <br />
                                                Follow-Ups: {customer.counts?.followUps || 0}
                                            </small>
                                        </td>

                                        <td>
                                            {formatMoney(
                                                customer.totals?.bookingValue || 0,
                                                "USD"
                                            )}
                                        </td>

                                        <td>
                                            {formatMoney(
                                                customer.totals?.balanceAmount || 0,
                                                "USD"
                                            )}
                                        </td>

                                        <td className="text-end">
                                            <button
                                                className="btn btn-sm btn-primary"
                                                onClick={() => loadCustomerProfile(customer)}
                                            >
                                                View Profile
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {!profile && customers.length === 0 && !searchLoading && (
                <div className="text-center py-5 border rounded-4 bg-white">
                    <FaUsers className="text-muted mb-3" size={36} />
                    <h5 className="fw-bold">Search for a customer</h5>
                    <p className="text-muted mb-0">
                        Customer profile results will appear here.
                    </p>
                </div>
            )}
        </div>
    );
};

export default Customers;