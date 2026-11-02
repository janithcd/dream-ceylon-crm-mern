const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const BookingPayment = require("../models/BookingPayment");
const ClientPaymentEmail = require("../models/ClientPaymentEmail");
const { acquireBookingPaymentLocks } = require("../utils/bookingPaymentLock");
const { buildGuestPaymentStatement } = require("../utils/guestPaymentStatement");
const { prepareClientPaymentEmail } = require("../utils/clientPaymentEmail");
const { createGuestPaymentStatementPdf } = require("./guestPaymentStatementPdfController");
const { createPaymentReceiptPdf } = require("./paymentReceiptPdfController");
const { getDocumentBrandConfig } = require("../utils/documentSettings");
const { createActivityLog } = require("../utils/createActivityLog");
const transactionalEmail = require("../utils/transactionalEmail");

// The payment lock keeps the ledger, recipient and both PDFs consistent while Zoho
// accepts the send. A short provider timeout is required to stay inside its lease.
const withPaymentSnapshot = async (paymentId, work) => {
    const lookup = await BookingPayment.findById(paymentId).select("booking").lean();
    if (!lookup) return { status: 404, message: "Payment not found." };
    let release;
    try {
        release = await acquireBookingPaymentLocks([lookup.booking]);
        const booking = await Booking.findById(lookup.booking).lean();
        if (!booking) return { status: 404, message: "Booking not found." };
        const payments = await BookingPayment.find({ booking: booking._id })
            .sort({ paymentDate: 1, _id: 1 }).limit(1001).lean();
        if (payments.length > 1000) {
            return { status: 413, message: "This booking has too many payment records to email a statement." };
        }
        const payment = payments.find((item) => String(item._id) === String(paymentId));
        if (!payment) return { status: 404, message: "Payment not found for this booking." };
        const result = buildGuestPaymentStatement(booking, payments);
        if (result.error) return { status: 409, message: result.error };
        return await work({ booking, payment, statement: result.value });
    } finally {
        if (release) await release();
    }
};

const respondError = (res, error) => {
    console.error("Client payment email failed:", error.message);
    return res.status(error.code === "PAYMENT_WRITE_BUSY" ? 409 : 500).json({
        message: error.code === "PAYMENT_WRITE_BUSY" ? error.message : "Could not prepare the client payment email.",
    });
};

const previewClientPaymentEmail = async (req, res) => {
    res.set("Cache-Control", "no-store");
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ message: "Invalid payment ID." });
    }
    try {
        const result = await withPaymentSnapshot(req.params.id, async (snapshot) => {
            const draft = prepareClientPaymentEmail({ ...snapshot, chargedAmount: req.body?.chargedAmount });
            if (draft.status) return draft;
            const delivery = await ClientPaymentEmail.findOne({ payment: snapshot.payment._id })
                .select("status sentAt").lean();
            return { ...draft,
                senderConfigured: transactionalEmail.isConfigured(),
                from: transactionalEmail.isConfigured() ? process.env.ZOHO_CPaaS_FROM : "",
                deliveryStatus: delivery?.status || null,
                sentAt: delivery?.sentAt || null,
            };
        });
        return res.status(result.status || 200).json(result.status ? { message: result.message } : result);
    } catch (error) { return respondError(res, error); }
};

const reserveDelivery = async (snapshot, draft, adminId) => {
    const fields = {
        booking: snapshot.booking._id, payment: snapshot.payment._id, recipient: draft.to,
        status: "Pending", providerRequestId: "", sentAt: null,
        paymentCents: draft.amountCents, chargeCents: draft.chargeCents,
        balanceCents: draft.balanceCents, sentBy: adminId || null,
    };
    try {
        await ClientPaymentEmail.create(fields);
        return true;
    } catch (error) {
        if (error.code !== 11000) throw error;
        // A provider-rejected attempt can be retried after correcting the setup.
        const retried = await ClientPaymentEmail.findOneAndUpdate(
            { payment: snapshot.payment._id, status: "Rejected" }, { $set: fields }, { new: true }
        );
        return Boolean(retried);
    }
};

const sendClientPaymentEmail = async (req, res) => {
    res.set("Cache-Control", "no-store");
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ message: "Invalid payment ID." });
    }
    if (req.body?.confirmRecipient !== true || !/^[a-f0-9]{64}$/.test(req.body?.fingerprint || "")) {
        return res.status(400).json({ message: "Review the current email and confirm its recipient before sending." });
    }
    if (!transactionalEmail.isConfigured()) {
        return res.status(503).json({ message: "Zoho CPaaS sending is not configured. Download the PDFs and send through Zoho Mail." });
    }
    try {
        // Ensure the one-email-per-payment index exists before taking the short payment lock.
        await ClientPaymentEmail.init();
        const result = await withPaymentSnapshot(req.params.id, async (snapshot) => {
            const draft = prepareClientPaymentEmail({ ...snapshot, chargedAmount: req.body.chargedAmount });
            if (draft.status || !draft.ready) return { status: draft.status || 400, message: draft.message };
            if (draft.fingerprint !== req.body.fingerprint) {
                return { status: 409, message: "The booking, payment or email changed. Preview it again before sending." };
            }
            const brand = await getDocumentBrandConfig();
            const [receipt, statement] = await Promise.all([
                createPaymentReceiptPdf({ ...snapshot.payment, booking: snapshot.booking }, brand),
                createGuestPaymentStatementPdf(snapshot.statement, brand),
            ]);
            if (receipt.length + statement.length > 9 * 1024 * 1024) {
                return { status: 413, message: "The PDFs exceed the email attachment limit. Download and send them manually." };
            }
            const reserved = await reserveDelivery(snapshot, draft, req.admin?._id);
            if (!reserved) return { status: 409, message: "This payment email was already sent or its delivery needs review. Check the activity log and Zoho before retrying." };

            try {
                const providerRequestId = await transactionalEmail.sendClientPaymentDocuments({
                    to: draft.to, subject: draft.subject, textbody: draft.textbody,
                    attachments: [
                        { name: draft.attachments[0], bytes: receipt },
                        { name: draft.attachments[1], bytes: statement },
                    ],
                });
                await ClientPaymentEmail.updateOne({ payment: snapshot.payment._id, status: "Pending" },
                    { $set: { status: "Sent", providerRequestId: providerRequestId || "", sentAt: new Date() } });
                await createActivityLog({ req, action: "SEND", module: "Payment",
                    description: `Payment receipt and statement sent for ${snapshot.booking.bookingCode}`,
                    relatedRecordId: snapshot.payment._id, relatedModel: "BookingPayment",
                    referenceNo: snapshot.payment.paymentNo,
                    customerName: snapshot.booking.customer.fullName,
                    metadata: { bookingCode: snapshot.booking.bookingCode, recipient: draft.to,
                        paymentCents: draft.amountCents, chargeCents: draft.chargeCents,
                        balanceCents: draft.balanceCents, providerRequestId: providerRequestId || "" } });
                return { accepted: true, to: draft.to, providerRequestId };
            } catch (error) {
                const status = error.definitivelyRejected ? "Rejected" : "Unknown";
                await ClientPaymentEmail.updateOne({ payment: snapshot.payment._id, status: "Pending" },
                    { $set: { status } });
                await createActivityLog({ req, action: "SEND", module: "Payment", status: "Failed",
                    description: `Client payment email ${status.toLowerCase()} for ${snapshot.booking.bookingCode}`,
                    relatedRecordId: snapshot.payment._id, relatedModel: "BookingPayment",
                    referenceNo: snapshot.payment.paymentNo,
                    metadata: { recipient: draft.to, deliveryStatus: status, error: error.message } });
                return { status: error.definitivelyRejected ? 502 : 503,
                    message: status === "Unknown"
                        ? "Zoho delivery is uncertain. Check Zoho logs before attempting another email."
                        : `Zoho rejected the email: ${error.message}` };
            }
        });
        return res.status(result.status || 200).json(result.status ? { message: result.message } : result);
    } catch (error) { return respondError(res, error); }
};

module.exports = { previewClientPaymentEmail, sendClientPaymentEmail };
