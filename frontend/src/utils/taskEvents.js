export const TASKS_CHANGED_EVENT = "crm:tasks-changed";

export const notifyTasksChanged = () => {
    window.dispatchEvent(new Event(TASKS_CHANGED_EVENT));
};
