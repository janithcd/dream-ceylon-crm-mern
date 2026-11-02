const toNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

const calculateQuotationTotals = (body) => {
    const durationDays = Math.max(toNumber(body.durationDays), 0);
    const vehicleDays = Math.max(toNumber(body.vehicleDays || durationDays), 0);
    const vehicleDailyRate = Math.max(toNumber(body.vehicleDailyRate), 0);
    const vehicleTotal = vehicleDays * vehicleDailyRate;
    const hotelTotal = Math.max(toNumber(body.hotelCost), 0);
    const activitiesTotal = Math.max(toNumber(body.activitiesCost), 0);
    const entranceFeesTotal = Math.max(toNumber(body.entranceFeesCost), 0);
    const otherTotal = Math.max(toNumber(body.otherCost), 0);
    const subtotal = vehicleTotal + hotelTotal + activitiesTotal + entranceFeesTotal + otherTotal;
    const discount = Math.min(Math.max(toNumber(body.discount), 0), subtotal);
    const grandTotal = Math.max(subtotal - discount, 0);
    const advancePayment = Math.min(Math.max(toNumber(body.advancePayment), 0), grandTotal);

    return {
        durationDays, vehicleDays, vehicleDailyRate, vehicleTotal, hotelTotal,
        activitiesTotal, entranceFeesTotal, otherTotal, subtotal, discount, grandTotal,
        advancePayment, balancePayment: Math.max(grandTotal - advancePayment, 0),
    };
};

module.exports = { calculateQuotationTotals };
