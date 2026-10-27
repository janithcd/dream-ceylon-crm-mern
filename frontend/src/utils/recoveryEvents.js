export const RECOVERY_CHANGED_EVENT = "crm:recovery-changed";

export const notifyRecoveryChanged = () => {
    window.dispatchEvent(new Event(RECOVERY_CHANGED_EVENT));
};
