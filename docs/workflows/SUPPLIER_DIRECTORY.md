# Supplier directory

Open **Supplier Directory** in the sidebar to keep a private, reusable list of hotels, guides,
safari jeep providers, transport partners, activity operators and other suppliers. Search by name,
location or contact, filter by category or status, and edit the contact person, business email,
phone, WhatsApp number and internal booking/payment terms. The directory does not store bank accounts
or guest-facing information. Do not put supplier prices in customer documents.

Open a supplier's **Rates** to record a rate quoted by that supplier. Each rate has a room or service name,
unit (room per night, day, trip, person, and so on), amount and currency, inclusive validity dates,
source reference and internal conditions. Hotel rates also require meal plan and guests per room.
Rates are private reference information: no rate is copied into a quotation, booking or cost automatically.
Check the supplier's offer for the exact stay dates, occupancy, taxes and exclusions before pricing a trip.
The **Current**, **Upcoming** and **Expired** filters use the Sri Lanka calendar day. Deactivate old
rates instead of deleting them. Changes create a revision and keep the previous amount and source in
the rate's history. Two active rates for the same supplier, service, unit, meal plan, occupancy and
currency cannot cover overlapping dates in normal edits; choose a different variant or deactivate
the outdated offer first. Once rate history exists, the supplier's category cannot be changed; create a
separate supplier for a different service category.

**Active** suppliers appear in booking hotel selection; **Inactive** suppliers remain searchable in
the directory for history and can be reactivated. Deactivation does not remove existing booking
stays or change their saved contact details. A hotel stay can use **Find a hotel in Supplier Directory**
to copy the current name, location and email into that booking's form. Review them and save the
stay separately. Later supplier edits will not silently change already saved bookings or outgoing
email drafts.

All logged-in roles may view suppliers. Manager, Sales and Finance may add or update them; Viewer
is read only. Supplier create/edit/status changes are logged without copying private terms or
contact information into the activity log. Similar names in different locations are allowed;
the same category, normalized name and location cannot be created twice.

The private API is `GET /api/suppliers` with `keyword`, `category`, `status`, `page` and `limit`
(max 50), `POST /api/suppliers`, and `PUT /api/suppliers/:id` with `expectedVersion` for conflict
protection. Rates use `GET /api/suppliers/:id/rates` with `status`, `timing`, `page` and `limit`
(max 50), `POST /api/suppliers/:id/rates` and `PUT /api/suppliers/:id/rates/:rateId` with
`expectedVersion`. There is no deletion route. Existing hotel stays are not imported automatically.
