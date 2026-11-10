# Transport Dispatch

[Feature guide](../../PROJECT_FEATURES.md) · [Bookings](BOOKINGS.md) · [Airport transfers](BOOKINGS.md#transport-and-airport-transfers)

Open **Transport Dispatch** from the side menu. It shows Requested and Confirmed transport arrangements on Pending, Confirmed and In Progress bookings. The default view covers the next seven Sri Lanka calendar days. Set **From** and **Through** to any range of 1–31 days, including future trips.

A tour drive appears if its service dates **overlap** the selected range; a drive that began before From and continues through it still appears. Each assignment appears once, not once per day. Cancelled legs and closed bookings are excluded.

- **All assignments** includes every active leg. **Requested** needs supplier confirmation.
- **Needs attention** includes requested legs and confirmed legs missing chauffeur name/phone, registration, pickup time or pickup location.
- Use **Missing driver**, **Missing registration** and **Missing pickup** to isolate confirmed legs needing those details.
- **Review transport** opens the existing booking Transport panel and focuses the exact assignment. Save corrections there, then refresh the board. The Transport panel also checks possible registration overlaps; the dispatch badge alone does not certify vehicle availability.
- Airport flight pickups and drop-offs can also be managed in **Airport Transfers**. This board includes transport without flight details.

The summary counts cover all assignments in the selected date range before the attention filter; the filtered total and 20-row pages reflect the selected filter. Service dates and times are shown in Sri Lanka. The board includes the guest name and chauffeur phone for authorized booking staff but excludes guest email/phone, private supplier notes, contacts, costs and payments. Access requires `booking.view`; edits in the Transport panel require `booking.update`.

`GET /api/bookings/transport-dispatch?from=YYYY-MM-DD&to=YYYY-MM-DD&filter=all|attention|requested|confirmed|missingDriver|missingVehicle|missingPickup&page=1` requires authentication and `booking.view`, validates the date span and page, and returns `Cache-Control: no-store`. Without dates, it defaults to seven Sri Lanka calendar days. There is no migration: existing transport assignments are read directly.

CI runs the route tests and `smoke-transport-dispatch.js` with disposable MongoDB to verify date overlap, privacy, permissions, missing details, pagination and updates.
