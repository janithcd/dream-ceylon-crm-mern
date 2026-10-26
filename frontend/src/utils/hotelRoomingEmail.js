export const buildHotelRoomingEmail = (details, assignments) => {
    if (!details || !Array.isArray(details.travelerNames) || !Array.isArray(assignments) ||
        assignments.length !== details.travelerNames.length || !Number.isInteger(details.rooms) || details.rooms < 1) {
        return { error: "Reload the saved hotel and traveler details." };
    }
    const groups = Array.from({ length: details.rooms }, () => []);
    assignments.forEach((room, index) => {
        if (room === "not-staying") return;
        const number = Number(room);
        if (!Number.isInteger(number) || String(number) !== String(room) || number < 1 || number > details.rooms) return;
        groups[number - 1].push(details.travelerNames[index]);
    });
    if (assignments.some((room) => room !== "not-staying" && !/^[1-9]\d*$/u.test(String(room))) ||
        groups.some((names) => names.length === 0) ||
        groups.reduce((sum, names) => sum + names.length, 0) + assignments.filter((room) => room === "not-staying").length !== assignments.length) {
        return { error: "Choose a room group or Not staying for every traveler, and place someone in each reserved room group." };
    }

    const lines = [
        `Dear ${details.hotelName} reservations team,`,
        "",
        `Please update our confirmed reservation with the guest rooming list below and confirm that the grouping is recorded. These group labels describe who shares a room; they are not hotel room numbers.`,
        "",
        `Our reference: ${details.bookingCode || "To be provided"}`,
        `Hotel confirmation reference: ${details.hotelReference || "Not recorded"}`,
        `Check-in: ${details.checkIn}`,
        `Check-out: ${details.checkOut}`,
        `Reserved rooms: ${details.rooms}`,
        `Recorded room type: ${details.roomType || "To be confirmed"}`,
        `Meal plan: ${details.mealPlan || "To be confirmed"}`,
        "",
        ...groups.flatMap((names, index) => [`Room group ${index + 1}:`, ...names.map((name) => `- ${name}`), ""]),
        "Please confirm the rooming list or let us know if any details need correcting. Thank you.",
        "",
        "Kind regards,",
        details.companyName,
    ];
    if (details.companyEmail) lines.push(details.companyEmail);

    return { value: {
        recipient: details.recipient,
        subject: `Rooming list | ${details.bookingCode || "Booking"} | ${details.hotelName}`.slice(0, 160),
        body: lines.join("\n"),
    } };
};
