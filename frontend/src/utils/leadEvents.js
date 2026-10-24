export const LEADS_CHANGED_EVENT = "crm:leads-changed";

export const notifyLeadsChanged = () => {
    window.dispatchEvent(new Event(LEADS_CHANGED_EVENT));
};
