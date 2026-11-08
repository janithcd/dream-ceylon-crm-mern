const { parseCalendarDate } = require("./paymentDueDate");
const { STATUSES, today } = require("./excursions");
const parseExcursionSchedule = (query = {}, now = new Date()) => {
    const from = query.from ?? today(now);
    const start = parseCalendarDate(from, "Start date");
    if (start.error || !start.value) return { error: "Choose a valid start date." };
    const to = query.to ?? new Date(start.value.getTime() + 6 * 86400000).toISOString().slice(0, 10);
    const end = parseCalendarDate(to, "End date");
    if (end.error || !end.value || end.value < start.value || end.value - start.value > 30 * 86400000) return { error: "Choose an activity date range of 1–31 days." };
    const status = query.status ?? "active", attention = query.attention ?? "all", page = query.page ?? "1";
    if (!["active", "all", ...STATUSES].includes(status) || !["all", "followup", "missing", "cancellation"].includes(attention) ||
        typeof page !== "string" || !/^[1-9]\d*$/.test(page) || Number(page) > 1000) return { error: "Choose valid schedule filters and page 1–1000." };
    return { value: { from, to, start: start.value, end: end.value, status, attention, page: Number(page), today: new Date(today(now)) } };
};
const buildExcursionSchedule = ({ start, end, status, attention, page, today: currentDay }) => {
    const match = { date: { $gte: start, $lte: end }, ...(status === "all" ? {} : {
        status: status === "active" ? { $nin: ["Cancelled", "Completed"] } : status }) };
    return [
        { $match: { excursions: { $elemMatch: match } } },
        { $project: { bookingCode: 1, bookingStatus: 1, excursions: 1 } },
        { $unwind: "$excursions" },
        { $match: Object.fromEntries(Object.entries(match).map(([k, v]) => [`excursions.${k}`, v])) },
        { $project: { _id: "$excursions._id", bookingId: "$_id", bookingCode: 1, bookingStatus: 1,
            title: "$excursions.title", type: "$excursions.type", date: "$excursions.date", startTime: "$excursions.startTime",
            participants: "$excursions.participants", supplierName: "$excursions.supplierName", supplierPhone: "$excursions.supplierPhone",
            meetingPoint: "$excursions.meetingPoint", status: "$excursions.status", followUpDate: "$excursions.followUpDate",
        } },
        { $addFields: {
            followUpDue: { $and: [{ $in: ["$status", ["Planned", "Requested", "Cancellation requested"]] },
                { $ne: ["$followUpDate", null] }, { $lte: ["$followUpDate", currentDay] }] },
            missingDetails: { $or: [{ $eq: ["$supplierName", ""] }, { $eq: ["$startTime", ""] }, { $eq: ["$meetingPoint", ""] }] },
        } },
        ...(attention === "followup" ? [{ $match: { followUpDue: true } }] : attention === "missing" ? [{ $match: { missingDetails: true } }] :
            attention === "cancellation" ? [{ $match: { $or: [{ status: "Cancellation requested" }, { bookingStatus: "Cancelled", status: { $nin: ["Cancelled", "Completed"] } }] } }] : []),
        { $facet: {
            count: [{ $count: "total" }],
            summary: [{ $group: { _id: null,
                requested: { $sum: { $cond: [{ $eq: ["$status", "Requested"] }, 1, 0] } },
                confirmed: { $sum: { $cond: [{ $eq: ["$status", "Confirmed"] }, 1, 0] } },
                followUpDue: { $sum: { $cond: ["$followUpDue", 1, 0] } },
            } }],
            items: [{ $sort: { date: 1, startTime: 1, bookingCode: 1, _id: 1 } }, { $skip: (page - 1) * 25 }, { $limit: 25 }],
        } },
    ];
};
module.exports = { parseExcursionSchedule, buildExcursionSchedule };
