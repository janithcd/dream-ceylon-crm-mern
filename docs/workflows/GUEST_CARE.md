# Trip support and guest care

[Project overview](../../README.md) · [Feature index](../../PROJECT_FEATURES.md) · [API reference](../../API_DOCUMENTATION.md)

Record guest issues during a tour and follow up after it ends. Drafting a message and recording an actual contact are separate actions.

## Contents

- [Trip support](#trip-support)
- [Issue ownership and alerts](#issue-ownership-and-alerts)
- [Post-trip care](#post-trip-care)
- [Service recovery](#service-recovery)
- [Contact and feedback reminders](#contact-and-feedback-reminders)
- [History and ownership](#history-and-ownership)

## Trip support

**Trip Support** shows bookings underway today in Sri Lanka and bookings with open guest issues, even after a
trip ends or is cancelled. From this screen or any booking, staff can review a private issue history. During
an active trip, staff with `booking.update` can open an issue with category, priority, description and an
optional next follow-up date; later they can append updates, resolve it with a note, or reopen it. Issue
actions are explicit records and never send a message. The queue returns counts of urgent, overdue, due today
and unscheduled issues, not private titles or notes. Each issue keeps its 20 most recent history events and
each booking up to 30 issues; stale revisions are rejected. Bookings with an issue history cannot be deleted;
cancel them to preserve that record. `GET
/api/bookings/trip-support?filter=open|mine|unassigned|active|all&page=1` and `GET
/api/bookings/:id/trip-issues` require `booking.view`; `POST /api/bookings/:id/trip-issues` and `PATCH
/api/bookings/:id/trip-issues/:issueId` also require `booking.update`. Ordinary booking lists omit issue
details.

## Issue ownership and alerts

**Trip issue ownership:** a new issue defaults to its creator, or can be assigned to another active staff
member with booking edit access or left unassigned. Open issues can be reassigned with a version check;
resolved issues must be reopened first. The Trip Support queue has **My issues** and **Unassigned** filters (a
booking appears if any open issue matches), owner names, and counts of matching issues. Ownership is an
internal work record and sends no notification. Older issues without owners are unassigned. Owner changes are
included in the issue's recent history and booking activity without private issue text. The assignee choices
reuse `GET /api/bookings/preparation-assignees`; `PATCH /api/bookings/:id/trip-issues/:issueId/assignee`
requires `booking.view` and `booking.update`.

**Trip issue alerts and worklist:** the header shows urgent, overdue or due-today open issues assigned to the
signed-in staff member, plus all unassigned open issues. A count badge and a five-booking summary link
straight to each booking's private Trip Support issue history. The **Needs attention** worklist includes all
matching bookings, sorted by overdue, urgent, due-today and unassigned counts with 20 bookings per page. A
single issue can match several reasons but contributes only once to the total. Alerts refresh on window focus,
every five minutes and after issue changes. Responses include only booking codes and issue counts, without
guest details, titles, notes or history. `GET /api/bookings/trip-support/alerts` and `GET
/api/bookings/trip-support/attention?page=1` require `booking.view` and use Sri Lanka calendar days; neither
sends an external notification.

## Post-trip care

**Post-trip Care** covers tours that ended during the previous 90 days, starting the day after their Sri Lanka
end date. It separates trips to close out, completed trips awaiting guest contact, contacted guests awaiting
feedback, and recorded outcomes. Staff can prepare an editable thank-you WhatsApp draft, but must send it
themselves and explicitly record the actual contact. Feedback notes and optional 1–5 ratings stay on the
booking; a declined guest cannot be sent a new draft. A revision check prevents silent overwrites, and booking
history records the action without private notes. The queue is read-only for `booking.view`; drafting and
updates also require `booking.update`. Responses are not cached. No automated review message is sent.

## Service recovery

**Service recovery** turns feedback rated 1–3 into an open recovery in Post-trip Care. Staff can set a
follow-up date, log an actual guest contact with a channel, record a resolution, or reopen it. A private,
bounded action history remains on the booking; the queue shows only rating, status and next follow-up date,
with missing or overdue reminders visible. Open recoveries remain in the queue even after the standard 90-day
care window, and resolved recoveries have a separate view. Correcting a rating before any recovery action can
remove an open recovery; after an action, keep the rating and record corrections in the recovery history.
Plans never send messages, and contacts are counted only when explicitly logged. `GET
/api/bookings/post-trip-care?filter=recovery|recovery-closed` requires `booking.view`; `PATCH
/api/bookings/:id/post-trip-care` recovery actions require `booking.update`, enforce the same revision check,
and keep private notes out of booking activity logs.

## Contact and feedback reminders

**Guest care reminders** show completed tours in the 90-day care window that still need their first recorded
guest contact, alongside open low-rating recoveries that are overdue, due today, or missing a follow-up date.
The header badge counts both groups; contact reminders list the oldest trips first. Each link opens the
private care record directly, even when it is beyond the first queue page. Alerts refresh after a care change,
when the app regains focus, and every five minutes. `GET /api/bookings/post-trip-care/alerts` requires
`booking.view`; it returns only booking codes, trip end dates, recovery follow-up dates and counts, without
guest details or private feedback. Dates use Sri Lanka calendar days. Drafting a message does not record
contact, and no guest message is sent automatically.

**Feedback reminders** let staff set or clear a follow-up date while recording real guest contact, or later
from an already-contacted care record. The date must fall between today and the end of the trip's 90-day care
window in Sri Lanka. The **Feedback due** queue and Guest Care header show scheduled reminders due today or
overdue, with direct links to the care record. Scheduling never records another contact or sends a message;
recording feedback or a decline clears the reminder. `PATCH /api/bookings/:id/post-trip-care` accepts
`nextFeedbackFollowUpDate` as `YYYY-MM-DD` or `null` for `contacted` and `schedule-feedback` actions with the
existing revision check. Alerts expose only booking codes and dates, without private notes.

## History and ownership

**Guest care history** keeps the latest 30 recorded contacts, feedback reminder changes, feedback entries and
declines in each private care record, including the staff member, Sri Lanka time, channel, optional private
note and relevant rating or reminder date. This preserves earlier notes when staff contact a guest again or
correct feedback. Existing bookings retain their saved latest contact and outcome; detailed history starts
with new actions. Recovery actions keep their separate history. The care detail endpoint returns the history
to staff with `booking.view`; care queues, header alerts, and broad booking summaries exclude it. Booking
activity logs still omit private notes. Recording a reminder never counts as a guest contact or sends a
message.

**Guest care ownership** gives each completed trip one responsible staff member for first contact, feedback
follow-up, and recovery. Assign an active staff member with booking edit access, claim the record, or leave it
unassigned from the private care window. Older bookings start unassigned. The queue offers **Mine +
unassigned**, **My care**, **Unassigned**, and **All staff** owner views across its existing status filters,
and displays the owner. Header reminders show only your assigned and unassigned work so another staff member's
assigned guest is not added to your badge. The assignee choices reuse `GET
/api/bookings/preparation-assignees`. `PATCH /api/bookings/:id/post-trip-care/assignee` requires
`booking.view` and `booking.update`, accepts `{ "assignedTo": "__me__" | adminId | null, "expectedRevision": 0
}`, rejects stale writes and inactive or view-only owners, and logs the owner change without private care
notes. Owner changes do not log a guest contact or send a message. Open recoveries can be reassigned after the
normal 90-day care window.
