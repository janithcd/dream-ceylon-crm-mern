export const TRIP_SUPPORT_CHANGED_EVENT = "crm:trip-support-changed";

export const notifyTripSupportChanged = () => {
    window.dispatchEvent(new Event(TRIP_SUPPORT_CHANGED_EVENT));
};
