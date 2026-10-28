export const HANDOVER_CHANGED_EVENT = "crm:handover-changed";

export const notifyHandoverChanged = () => {
    window.dispatchEvent(new Event(HANDOVER_CHANGED_EVENT));
};
