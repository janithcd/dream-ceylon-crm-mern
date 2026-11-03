# Supplier directory

Open **Supplier Directory** in the sidebar to keep a private, reusable list of hotels, guides,
safari jeep providers, transport partners, activity operators and other suppliers. Search by name,
location or contact, filter by category or status, and edit the contact person, business email,
phone, WhatsApp number and internal booking/payment terms. The directory does not store bank accounts,
rates or guest-facing information. Do not put supplier prices in customer documents.

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
protection. There is no deletion route. Existing hotel stays are not imported automatically.
