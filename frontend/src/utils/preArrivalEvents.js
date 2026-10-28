export const PRE_ARRIVAL_CHANGED_EVENT = "crm:pre-arrival-changed";

export const notifyPreArrivalChanged = () => {
    window.dispatchEvent(new Event(PRE_ARRIVAL_CHANGED_EVENT));
};
