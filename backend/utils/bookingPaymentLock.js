const { randomUUID } = require("node:crypto");
const Booking = require("../models/Booking");

const LEASE_MS = 60_000;
const WAIT_MS = 50;
const TIMEOUT_MS = 5_000;

const busyError = () => Object.assign(
    new Error("Another payment change is in progress. Refresh and try again."),
    { code: "PAYMENT_WRITE_BUSY" }
);

// The lock is stored on the booking, so separate Node processes share the same lease.
const acquireBookingPaymentLocks = async (bookingIds) => {
    const ids = [...new Set(bookingIds.filter(Boolean).map(String))].sort();
    const token = randomUUID();
    const held = [];
    const release = async () => {
        const results = await Promise.allSettled(held.reverse().map((id) => Booking.updateOne(
            { _id: id, paymentWriteToken: token },
            { $unset: { paymentWriteToken: "", paymentWriteExpiresAt: "" } },
            { timestamps: false }
        )));
        for (const result of results) {
            if (result.status === "rejected") console.error("Payment write lock release failed:", result.reason);
        }
    };

    try {
        for (const id of ids) {
            const deadline = Date.now() + TIMEOUT_MS;
            while (true) {
                const now = new Date();
                const locked = await Booking.findOneAndUpdate(
                    { _id: id, $or: [
                        { paymentWriteToken: null },
                        { paymentWriteExpiresAt: { $lte: now } },
                    ] },
                    { $set: { paymentWriteToken: token, paymentWriteExpiresAt: new Date(now.getTime() + LEASE_MS) } },
                    { projection: { _id: 1 }, timestamps: false }
                );
                if (locked) {
                    held.push(id);
                    break;
                }
                if (!(await Booking.exists({ _id: id }))) break;
                if (Date.now() >= deadline) throw busyError();
                await new Promise((resolve) => setTimeout(resolve, WAIT_MS));
            }
        }
        return release;
    } catch (error) {
        await release();
        throw error;
    }
};

module.exports = { acquireBookingPaymentLocks };
