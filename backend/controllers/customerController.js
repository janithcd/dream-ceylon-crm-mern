const Inquiry = require("../models/Inquiry");
const Quotation = require("../models/Quotation");
const Booking = require("../models/Booking");
const BookingPayment = require("../models/BookingPayment");
const FollowUp = require("../models/FollowUp");

const safeText = (value) => {
    if (value === null || value === undefined) {
        return "";
    }

    return String(value).trim();
};

const escapeRegex = (value) => {
    return safeText(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

const buildRegex = (value) => {
    return {
        $regex: escapeRegex(value),
        $options: "i",
    };
};

const normalizePhone = (value) => {
    return safeText(value).replace(/\D/g, "");
};

const getPhoneSearchTerms = (value) => {
    const raw = safeText(value);
    const digits = normalizePhone(value);

    const terms = [];

    if (raw) {
        terms.push(raw);
    }

    if (digits) {
        terms.push(digits);
    }

    if (digits.length >= 7) {
        terms.push(digits.slice(-7));
    }

    return [...new Set(terms)];
};

const getIdValue = (value) => {
    if (!value) {
        return null;
    }

    if (typeof value === "string") {
        return value;
    }

    return value._id || value;
};

const uniqueById = (items) => {
    const map = new Map();

    items.forEach((item) => {
        if (item?._id) {
            map.set(String(item._id), item);
        }
    });

    return Array.from(map.values());
};

const buildCustomerConditions = (
    criteria,
    { nameFields = [], emailFields = [], phoneFields = [], extraKeywordFields = [] }
) => {
    const conditions = [];

    if (criteria.keyword) {
        const fields = [
            ...nameFields,
            ...emailFields,
            ...phoneFields,
            ...extraKeywordFields,
        ];

        fields.forEach((field) => {
            conditions.push({
                [field]: buildRegex(criteria.keyword),
            });
        });
    }

    if (criteria.customerName) {
        nameFields.forEach((field) => {
            conditions.push({
                [field]: buildRegex(criteria.customerName),
            });
        });
    }

    if (criteria.email) {
        emailFields.forEach((field) => {
            conditions.push({
                [field]: buildRegex(criteria.email),
            });
        });
    }

    if (criteria.whatsappNumber) {
        const phoneTerms = getPhoneSearchTerms(criteria.whatsappNumber);

        phoneFields.forEach((field) => {
            phoneTerms.forEach((term) => {
                conditions.push({
                    [field]: buildRegex(term),
                });
            });
        });
    }

    return conditions;
};

const buildQueryFromConditions = (conditions) => {
    if (!conditions || conditions.length === 0) {
        return {
            _id: null,
        };
    }

    return {
        $or: conditions,
    };
};

const addCustomerToMap = (customerMap, data) => {
    const name = safeText(data.name);
    const email = safeText(data.email).toLowerCase();
    const phone = safeText(data.phone);
    const normalizedPhone = normalizePhone(phone);
    const country = safeText(data.country);

    let key = "";

    if (email) {
        key = `email:${email}`;
    } else if (normalizedPhone) {
        key = `phone:${normalizedPhone}`;
    } else if (name) {
        key = `name:${name.toLowerCase()}`;
    }

    if (!key) {
        return;
    }

    if (!customerMap.has(key)) {
        customerMap.set(key, {
            customerName: name || "Unknown Customer",
            email: email || "",
            whatsappNumber: phone || "",
            country: country || "",
            counts: {
                inquiries: 0,
                quotations: 0,
                bookings: 0,
                payments: 0,
                followUps: 0,
            },
            totals: {
                bookingValue: 0,
                paidAmount: 0,
                balanceAmount: 0,
            },
            latestActivity: data.createdAt || null,
        });
    }

    const customer = customerMap.get(key);

    if (!customer.customerName && name) {
        customer.customerName = name;
    }

    if (!customer.email && email) {
        customer.email = email;
    }

    if (!customer.whatsappNumber && phone) {
        customer.whatsappNumber = phone;
    }

    if (!customer.country && country) {
        customer.country = country;
    }

    if (data.type && customer.counts[data.type] !== undefined) {
        customer.counts[data.type] += 1;
    }

    if (data.bookingValue) {
        customer.totals.bookingValue += Number(data.bookingValue) || 0;
    }

    if (data.paidAmount) {
        customer.totals.paidAmount += Number(data.paidAmount) || 0;
    }

    customer.totals.balanceAmount =
        customer.totals.bookingValue - customer.totals.paidAmount;

    if (data.createdAt) {
        const currentDate = customer.latestActivity
            ? new Date(customer.latestActivity)
            : null;

        const newDate = new Date(data.createdAt);

        if (!currentDate || newDate > currentDate) {
            customer.latestActivity = data.createdAt;
        }
    }
};

// @desc    Search customers from inquiries, quotations, bookings, and follow-ups
// @route   GET /api/customers/search?keyword=subham
// @access  Private
const searchCustomers = async (req, res) => {
    try {
        const { keyword = "", limit = 20 } = req.query;

        if (!safeText(keyword)) {
            return res.status(400).json({
                message: "Search keyword is required",
            });
        }

        const criteria = {
            keyword: safeText(keyword),
        };

        const inquiryConditions = buildCustomerConditions(criteria, {
            nameFields: ["fullName"],
            emailFields: ["email"],
            phoneFields: ["whatsappNumber"],
            extraKeywordFields: ["country", "message"],
        });

        const quotationConditions = buildCustomerConditions(criteria, {
            nameFields: ["clientName"],
            extraKeywordFields: ["country", "tourTitle", "quotationNo"],
        });

        const bookingConditions = buildCustomerConditions(criteria, {
            nameFields: ["customer.fullName"],
            emailFields: ["customer.email"],
            phoneFields: ["customer.whatsappNumber"],
            extraKeywordFields: ["customer.country", "bookingCode", "vehicleType"],
        });

        const followUpConditions = buildCustomerConditions(criteria, {
            nameFields: ["customerName"],
            emailFields: ["customerContact"],
            phoneFields: ["customerContact"],
            extraKeywordFields: ["title", "notes", "type"],
        });

        const [inquiries, quotations, bookings, followUps] = await Promise.all([
            Inquiry.find(buildQueryFromConditions(inquiryConditions))
                .populate("interestedPackage", "title durationDays")
                .sort({ createdAt: -1 })
                .limit(100),

            Quotation.find(buildQueryFromConditions(quotationConditions))
                .populate("inquiry", "fullName email whatsappNumber country")
                .sort({ createdAt: -1 })
                .limit(100),

            Booking.find(buildQueryFromConditions(bookingConditions))
                .populate("selectedPackage", "title durationDays")
                .sort({ createdAt: -1 })
                .limit(100),

            FollowUp.find(buildQueryFromConditions(followUpConditions))
                .sort({ createdAt: -1 })
                .limit(100),
        ]);

        const customerMap = new Map();

        inquiries.forEach((inquiry) => {
            addCustomerToMap(customerMap, {
                name: inquiry.fullName,
                email: inquiry.email,
                phone: inquiry.whatsappNumber,
                country: inquiry.country,
                type: "inquiries",
                createdAt: inquiry.createdAt,
            });
        });

        quotations.forEach((quotation) => {
            addCustomerToMap(customerMap, {
                name: quotation.clientName || quotation.inquiry?.fullName,
                email: quotation.inquiry?.email,
                phone: quotation.inquiry?.whatsappNumber,
                country: quotation.country || quotation.inquiry?.country,
                type: "quotations",
                createdAt: quotation.createdAt,
            });
        });

        bookings.forEach((booking) => {
            addCustomerToMap(customerMap, {
                name: booking.customer?.fullName,
                email: booking.customer?.email,
                phone: booking.customer?.whatsappNumber,
                country: booking.customer?.country,
                type: "bookings",
                bookingValue: booking.totalPrice,
                paidAmount: booking.advancePayment,
                createdAt: booking.createdAt,
            });
        });

        followUps.forEach((followUp) => {
            addCustomerToMap(customerMap, {
                name: followUp.customerName,
                email: followUp.customerContact?.includes("@")
                    ? followUp.customerContact
                    : "",
                phone: followUp.customerContact,
                country: "",
                type: "followUps",
                createdAt: followUp.createdAt,
            });
        });

        const customers = Array.from(customerMap.values())
            .sort((a, b) => {
                const dateA = a.latestActivity ? new Date(a.latestActivity) : new Date(0);
                const dateB = b.latestActivity ? new Date(b.latestActivity) : new Date(0);

                return dateB - dateA;
            })
            .slice(0, Number(limit));

        res.status(200).json({
            customers,
            totalCustomers: customers.length,
        });
    } catch (error) {
        res.status(500).json({
            message: "Failed to search customers",
            error: error.message,
        });
    }
};

// @desc    Get full customer profile
// @route   GET /api/customers/profile?email=test@email.com
// @route   GET /api/customers/profile?whatsappNumber=0771234567
// @route   GET /api/customers/profile?customerName=Subham
// @access  Private
const getCustomerProfile = async (req, res) => {
    try {
        const {
            keyword = "",
            email = "",
            whatsappNumber = "",
            customerName = "",
        } = req.query;

        const criteria = {
            keyword: safeText(keyword),
            email: safeText(email),
            whatsappNumber: safeText(whatsappNumber),
            customerName: safeText(customerName),
        };

        if (
            !criteria.keyword &&
            !criteria.email &&
            !criteria.whatsappNumber &&
            !criteria.customerName
        ) {
            return res.status(400).json({
                message:
                    "Please provide keyword, email, whatsappNumber, or customerName",
            });
        }

        const inquiryConditions = buildCustomerConditions(criteria, {
            nameFields: ["fullName"],
            emailFields: ["email"],
            phoneFields: ["whatsappNumber"],
            extraKeywordFields: ["country", "message"],
        });

        const inquiries = await Inquiry.find(buildQueryFromConditions(inquiryConditions))
            .populate("interestedPackage", "title durationDays category priceFrom")
            .sort({ createdAt: -1 });

        const inquiryIds = inquiries.map((item) => item._id);

        const quotationConditions = buildCustomerConditions(criteria, {
            nameFields: ["clientName"],
            extraKeywordFields: ["country", "tourTitle", "quotationNo"],
        });

        if (inquiryIds.length > 0) {
            quotationConditions.push({
                inquiry: {
                    $in: inquiryIds,
                },
            });
        }

        const quotations = await Quotation.find(
            buildQueryFromConditions(quotationConditions)
        )
            .populate("inquiry", "fullName email whatsappNumber country")
            .populate("booking", "bookingCode bookingStatus paymentStatus")
            .sort({ createdAt: -1 });

        const quotationBookingIds = quotations
            .map((quotation) => getIdValue(quotation.booking))
            .filter(Boolean);

        const bookingConditions = buildCustomerConditions(criteria, {
            nameFields: ["customer.fullName"],
            emailFields: ["customer.email"],
            phoneFields: ["customer.whatsappNumber"],
            extraKeywordFields: ["customer.country", "bookingCode", "vehicleType"],
        });

        if (inquiryIds.length > 0) {
            bookingConditions.push({
                inquiry: {
                    $in: inquiryIds,
                },
            });
        }

        if (quotationBookingIds.length > 0) {
            bookingConditions.push({
                _id: {
                    $in: quotationBookingIds,
                },
            });
        }

        const bookings = await Booking.find(buildQueryFromConditions(bookingConditions))
            .populate("inquiry", "fullName email whatsappNumber country")
            .populate("selectedPackage", "title durationDays category priceFrom")
            .sort({ createdAt: -1 });

        const uniqueBookings = uniqueById(bookings);
        const bookingIds = uniqueBookings.map((item) => item._id);

        const payments =
            bookingIds.length > 0
                ? await BookingPayment.find({
                    booking: {
                        $in: bookingIds,
                    },
                })
                    .populate(
                        "booking",
                        "bookingCode customer totalPrice advancePayment currency paymentStatus bookingStatus"
                    )
                    .sort({ paymentDate: -1 })
                : [];

        const quotationIds = quotations.map((item) => item._id);

        const followUpConditions = buildCustomerConditions(criteria, {
            nameFields: ["customerName"],
            emailFields: ["customerContact"],
            phoneFields: ["customerContact"],
            extraKeywordFields: ["title", "notes", "type"],
        });

        if (inquiryIds.length > 0) {
            followUpConditions.push({
                inquiry: {
                    $in: inquiryIds,
                },
            });
        }

        if (quotationIds.length > 0) {
            followUpConditions.push({
                quotation: {
                    $in: quotationIds,
                },
            });
        }

        if (bookingIds.length > 0) {
            followUpConditions.push({
                booking: {
                    $in: bookingIds,
                },
            });
        }

        const followUps = await FollowUp.find(
            buildQueryFromConditions(followUpConditions)
        )
            .populate("inquiry", "fullName email whatsappNumber country status")
            .populate("quotation", "quotationNo clientName tourTitle status totals")
            .populate(
                "booking",
                "bookingCode customer travelStartDate travelEndDate paymentStatus bookingStatus"
            )
            .sort({ followUpDate: 1 });

        const firstInquiry = inquiries[0];
        const firstQuotation = quotations[0];
        const firstBooking = uniqueBookings[0];

        const customer = {
            customerName:
                firstBooking?.customer?.fullName ||
                firstQuotation?.clientName ||
                firstInquiry?.fullName ||
                criteria.customerName ||
                criteria.keyword ||
                "Customer",

            email:
                firstBooking?.customer?.email ||
                firstQuotation?.inquiry?.email ||
                firstInquiry?.email ||
                criteria.email ||
                "",

            whatsappNumber:
                firstBooking?.customer?.whatsappNumber ||
                firstQuotation?.inquiry?.whatsappNumber ||
                firstInquiry?.whatsappNumber ||
                criteria.whatsappNumber ||
                "",

            country:
                firstBooking?.customer?.country ||
                firstQuotation?.country ||
                firstQuotation?.inquiry?.country ||
                firstInquiry?.country ||
                "",
        };

        const totalBookingValue = uniqueBookings.reduce((total, booking) => {
            return total + (Number(booking.totalPrice) || 0);
        }, 0);

        const totalReceivedPayments = payments
            .filter((payment) => payment.status === "Received")
            .reduce((total, payment) => total + (Number(payment.amount) || 0), 0);

        const totalRefundedPayments = payments
            .filter((payment) => payment.status === "Refunded")
            .reduce((total, payment) => total + (Number(payment.amount) || 0), 0);

        const totalPaidAmount = totalReceivedPayments - totalRefundedPayments;
        const totalBalanceAmount = totalBookingValue - totalPaidAmount;

        const summary = {
            totalInquiries: inquiries.length,
            totalQuotations: quotations.length,
            totalBookings: uniqueBookings.length,
            totalPayments: payments.length,
            totalFollowUps: followUps.length,
            pendingFollowUps: followUps.filter((item) => item.status === "Pending")
                .length,
            completedFollowUps: followUps.filter(
                (item) => item.status === "Completed"
            ).length,
            totalBookingValue,
            totalReceivedPayments,
            totalRefundedPayments,
            totalPaidAmount,
            totalBalanceAmount,
            currency: uniqueBookings[0]?.currency || quotations[0]?.currency || "USD",
        };

        res.status(200).json({
            customer,
            summary,
            inquiries,
            quotations,
            bookings: uniqueBookings,
            payments,
            followUps,
        });
    } catch (error) {
        res.status(500).json({
            message: "Failed to load customer profile",
            error: error.message,
        });
    }
};

module.exports = {
    searchCustomers,
    getCustomerProfile,
};