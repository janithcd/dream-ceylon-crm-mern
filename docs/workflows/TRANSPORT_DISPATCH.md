# Transport Dispatch

[Feature guide](../../PROJECT_FEATURES.md) · [Bookings](BOOKINGS.md) · [Airport transfers](BOOKINGS.md#transport-and-airport-transfers)

Open **Transport Dispatch** from the side menu. It shows Requested and Confirmed transport arrangements on Pending, Confirmed and In Progress bookings. The default view covers the next seven Sri Lanka calendar days. Set **From** and **Through** to any range of 1–31 days, including future trips.

A tour drive appears if its service dates **overlap** the selected range; a drive that began before From and continues through it still appears. Each assignment appears once, not once per day. Cancelled legs and closed bookings are excluded.

- **All assignments** includes every active leg. **Requested** needs supplier confirmation.
- **Needs attention** includes requested legs, possible vehicle conflicts, and confirmed legs missing chauffeur name/phone, registration, pickup time or pickup location.
- **Vehicle conflicts** shows assignments with a registration already used by a Confirmed leg on overlapping dates, including another leg on the same booking. Requested legs using a vehicle with a confirmed reservation are flagged too. Expand a clash to see the other booking reference, route and dates. Completed or cancelled bookings and cancelled legs do not create clashes.
- Use **Missing driver**, **Registration review** and **Missing pickup** to isolate confirmed legs needing those details. Older registrations without a saved normalized key are flagged for review; re-save the registration in the Transport panel to include them in conflict checks.
- **Review transport** opens the booking Transport panel and focuses the exact assignment. Requested and confirmed legs show links to overlapping confirmed services there too. Save corrections, then refresh the board. Clash detection compares dates for normalized registration numbers; it does not compare pickup times or reserve a vehicle. Check the actual schedule and supplier before confirming a vehicle.
- Airport flight pickups and drop-offs can also be managed in **Airport Transfers**. This board includes transport without flight details.

The summary counts cover all assignments in the selected date range before the attention filter; the filtered total and 20-row pages reflect the selected filter. A clash is counted per affected assignment, so two overlapping confirmed legs count as two warnings. Service dates and times are shown in Sri Lanka. The board includes the guest name and chauffeur phone for authorized booking staff but excludes guest email/phone, private supplier notes, contacts, costs and payments. Access requires `booking.view`; edits in the Transport panel require `booking.update`.

`GET /api/bookings/transport-dispatch?from=YYYY-MM-DD&to=YYYY-MM-DD&filter=all|attention|requested|confirmed|conflicts|missingDriver|missingVehicle|missingPickup&page=1` requires authentication and `booking.view`, validates the date span and page, and returns `Cache-Control: no-store`. Without dates, it defaults to seven Sri Lanka calendar days. There is no migration: existing transport assignments are read directly.

CI runs the route tests and `smoke-transport-dispatch.js` with disposable MongoDB to verify date overlap, registration matching, privacy, permissions, missing details, pagination and updates.
