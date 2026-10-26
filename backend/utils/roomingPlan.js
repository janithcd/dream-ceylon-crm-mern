const parseRoomingAssignments = (assignments, travelerCount, rooms) => {
    if (!Array.isArray(assignments) || !Number.isInteger(travelerCount) || travelerCount < 1 ||
        assignments.length !== travelerCount || !Number.isInteger(rooms) || rooms < 1 || rooms > 20) {
        return { error: "Assign every named traveler to a room group or mark them as not staying." };
    }
    const counts = Array(rooms).fill(0);
    for (const entry of assignments) {
        if (entry === "not-staying") continue;
        if (typeof entry !== "string" || !/^[1-9]\d*$/u.test(entry) || Number(entry) > rooms || String(Number(entry)) !== entry) {
            return { error: "Choose a valid room group or Not staying for each traveler." };
        }
        counts[Number(entry) - 1] += 1;
    }
    if (counts.some((count) => count === 0)) {
        return { error: "Every reserved room group needs at least one traveler." };
    }
    return { assignments: [...assignments], includedCount: counts.reduce((sum, count) => sum + count, 0) };
};

const roomingPlanState = (booking, stay) => {
    const revision = stay.roomingRevision ?? 0;
    const plan = stay.roomingPlan;
    if (!plan) return { status: "none", revision, assignments: [] };
    const valid = parseRoomingAssignments(plan.assignments, booking.travelerNames?.length, stay.rooms);
    const current = !valid.error && plan.rosterVersion === (booking.travelerRosterVersion ?? 0) &&
        plan.roomCount === stay.rooms;
    return {
        status: current ? "current" : "stale",
        revision,
        assignments: current ? [...plan.assignments] : [],
        savedAt: plan.savedAt,
        savedByName: plan.savedByName || "",
    };
};

module.exports = { parseRoomingAssignments, roomingPlanState };
