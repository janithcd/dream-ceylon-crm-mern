import { useEffect, useState } from "react";
import { FaClipboardCheck, FaEdit, FaPlus, FaTrash } from "react-icons/fa";
import api from "../api/axios";
import { usePermissions } from "../context/PermissionContext";
import { formatCalendarDate, toCalendarDateInput, todayCalendarDate } from "../utils/calendarDate";

const suggestedTasks = [
    "Confirm accommodation",
    "Arrange vehicle and chauffeur",
    "Confirm guide",
    "Send final itinerary to client",
];
const assigneeId = (value) => (typeof value === "object" ? value?._id || "" : value || "");

const BookingPreparationModal = ({ booking, onClose, onChanged }) => {
    const { hasPermission } = usePermissions();
    const canUpdate = hasPermission("booking.update");
    const [tasks, setTasks] = useState(booking.preparationTasks || []);
    const [title, setTitle] = useState("");
    const [newAssigneeId, setNewAssigneeId] = useState("");
    const [newDueDate, setNewDueDate] = useState("");
    const [assignees, setAssignees] = useState([]);
    const [editingTaskId, setEditingTaskId] = useState("");
    const [editAssigneeId, setEditAssigneeId] = useState("");
    const [editDueDate, setEditDueDate] = useState("");
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    useEffect(() => {
        let active = true;

        api.get(`/bookings/${booking._id}`)
            .then((response) => {
                if (active) setTasks(response.data.preparationTasks || []);
            })
            .catch((err) => {
                if (active) setError(err.response?.data?.message || "Failed to load the checklist.");
            })
            .finally(() => {
                if (active) setLoading(false);
            });

        if (canUpdate) {
            api.get("/bookings/preparation-assignees")
                .then((response) => {
                    if (active) setAssignees(response.data.admins || []);
                })
                .catch(() => {
                    if (active) setError("Could not load available assignees. Please try reopening the checklist.");
                });
        }

        return () => { active = false; };
    }, [booking._id, canUpdate]);

    const completeCount = tasks.filter((task) => task.completedAt).length;

    const addTask = async (event) => {
        event.preventDefault();
        if (!title.trim() || busy) return;

        try {
            setBusy(true);
            setError("");
            setSuccess("");
            const response = await api.post(`/bookings/${booking._id}/preparation-tasks`, {
                title: title.trim(), assignedTo: newAssigneeId || null, dueDate: newDueDate || null,
            });
            setTasks(response.data.tasks || []);
            setTitle("");
            setNewAssigneeId("");
            setNewDueDate("");
            setSuccess("Task added.");
            onChanged();
        } catch (err) {
            setError(err.response?.data?.message || "Failed to add task.");
        } finally {
            setBusy(false);
        }
    };

    const startEditing = (task) => {
        setEditingTaskId(task._id);
        setEditAssigneeId(assigneeId(task.assignedTo));
        setEditDueDate(toCalendarDateInput(task.dueDate));
        setError("");
        setSuccess("");
    };

    const saveTaskDetails = async (event, task) => {
        event.preventDefault();
        if (busy) return;
        try {
            setBusy(true);
            setError("");
            setSuccess("");
            const details = { dueDate: editDueDate || null };
            if (editAssigneeId !== assigneeId(task.assignedTo)) {
                details.assignedTo = editAssigneeId || null;
            }
            const response = await api.put(`/bookings/${booking._id}/preparation-tasks/${task._id}`, details);
            setTasks(response.data.tasks || []);
            setEditingTaskId("");
            setSuccess("Task details saved.");
            onChanged();
        } catch (err) {
            setError(err.response?.data?.message || "Failed to save task details.");
        } finally {
            setBusy(false);
        }
    };

    const setCompleted = async (task, completed) => {
        if (busy) return;
        try {
            setBusy(true);
            setError("");
            setSuccess("");
            const response = await api.patch(`/bookings/${booking._id}/preparation-tasks/${task._id}`, { completed });
            setTasks(response.data.tasks || []);
            onChanged();
        } catch (err) {
            setError(err.response?.data?.message || "Failed to update task.");
        } finally {
            setBusy(false);
        }
    };

    const removeTask = async (task) => {
        if (busy || !window.confirm(`Remove "${task.title}" from this checklist?`)) return;
        try {
            setBusy(true);
            setError("");
            setSuccess("");
            const response = await api.delete(`/bookings/${booking._id}/preparation-tasks/${task._id}`);
            setTasks(response.data.tasks || []);
            onChanged();
        } catch (err) {
            setError(err.response?.data?.message || "Failed to remove task.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <>
            <div className="modal fade show d-block" tabIndex="-1" role="dialog" aria-modal="true" aria-labelledby="preparation-title">
                <div className="modal-dialog modal-dialog-centered modal-lg">
                    <div className="modal-content">
                        <div className="modal-header">
                            <div>
                                <h5 id="preparation-title" className="modal-title"><FaClipboardCheck className="me-2" />Booking preparation</h5>
                                <small className="text-muted">{booking.bookingCode} · {booking.customer?.fullName}</small>
                            </div>
                            <button type="button" className="btn-close" aria-label="Close" onClick={onClose} />
                        </div>

                        <div className="modal-body">
                            <p className="text-muted small mb-3">Assign an owner and due date to each arrangement as needed. Completing tasks does not change booking or payment status.</p>
                            {error && <div className="alert alert-danger" role="alert">{error}</div>}
                            {success && <div className="alert alert-success" role="status">{success}</div>}

                            <h6 className="fw-bold mb-3">{completeCount} of {tasks.length} tasks completed</h6>
                            {loading ? (
                                <p className="text-muted">Loading checklist...</p>
                            ) : tasks.length === 0 ? (
                                <div className="border rounded-3 p-3 text-muted mb-3">No tasks yet. Add only the arrangements needed for this booking.</div>
                            ) : (
                                <div className="list-group mb-4">
                                    {tasks.map((task) => (
                                        <div key={task._id} className="list-group-item">
                                            <div className="d-flex align-items-start justify-content-between gap-3">
                                                <label className="d-flex align-items-start gap-3 flex-grow-1 mb-0">
                                                    <input
                                                        type="checkbox"
                                                        className="form-check-input mt-1"
                                                        checked={Boolean(task.completedAt)}
                                                        onChange={() => setCompleted(task, !task.completedAt)}
                                                        disabled={!canUpdate || busy}
                                                    />
                                                    <span>
                                                        <span className={task.completedAt ? "text-decoration-line-through text-muted" : ""}>{task.title}</span>
                                                        <span className="d-block text-muted small mt-1">
                                                            Owner: {task.assignedTo?.name || "Unassigned"}
                                                            {task.assignedTo?.status === "Inactive" && " (inactive)"}
                                                            {task.dueDate && ` · Due ${formatCalendarDate(task.dueDate)}`}
                                                            {!task.completedAt && task.dueDate && toCalendarDateInput(task.dueDate) < todayCalendarDate() && (
                                                                <span className="badge text-bg-danger ms-2">Overdue</span>
                                                            )}
                                                        </span>
                                                    </span>
                                                </label>
                                                {canUpdate && (
                                                    <div className="d-flex gap-2">
                                                        <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => startEditing(task)} disabled={busy} aria-label={`Edit ${task.title}`}>
                                                            <FaEdit />
                                                        </button>
                                                        <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => removeTask(task)} disabled={busy} aria-label={`Remove ${task.title}`}>
                                                            <FaTrash />
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                            {canUpdate && editingTaskId === task._id && (
                                                <form className="row g-2 mt-2" onSubmit={(event) => saveTaskDetails(event, task)}>
                                                    <div className="col-md-6">
                                                        <label className="form-label small" htmlFor={`task-owner-${task._id}`}>Task owner</label>
                                                        <select id={`task-owner-${task._id}`} className="form-select" value={editAssigneeId} onChange={(event) => setEditAssigneeId(event.target.value)} disabled={busy}>
                                                            <option value="">Unassigned</option>
                                                            {assigneeId(task.assignedTo) && !assignees.some((admin) => admin._id === assigneeId(task.assignedTo)) && (
                                                                <option value={assigneeId(task.assignedTo)} disabled>{task.assignedTo?.name || "Former admin"} (inactive)</option>
                                                            )}
                                                            {assignees.map((admin) => <option key={admin._id} value={admin._id}>{admin.name} · {admin.role}</option>)}
                                                        </select>
                                                    </div>
                                                    <div className="col-md-6">
                                                        <label className="form-label small" htmlFor={`task-date-${task._id}`}>Due date</label>
                                                        <input id={`task-date-${task._id}`} type="date" className="form-control" value={editDueDate} onChange={(event) => setEditDueDate(event.target.value)} disabled={busy} />
                                                    </div>
                                                    <div className="col-12 d-flex gap-2">
                                                        <button type="submit" className="btn btn-sm btn-primary" disabled={busy}>Save task</button>
                                                        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setEditingTaskId("")} disabled={busy}>Cancel</button>
                                                    </div>
                                                </form>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {canUpdate && !loading && (
                                <form onSubmit={addTask}>
                                    <label className="form-label fw-semibold" htmlFor="preparation-task-title">Add a task</label>
                                    <div>
                                        <input
                                            id="preparation-task-title"
                                            className="form-control"
                                            value={title}
                                            onChange={(event) => setTitle(event.target.value)}
                                            maxLength={120}
                                            required
                                            placeholder="e.g. Confirm Sigiriya hotel"
                                        />
                                    </div>
                                    <div className="row g-2 mt-1">
                                        <div className="col-md-6">
                                            <label className="form-label small" htmlFor="new-task-owner">Task owner (optional)</label>
                                            <select id="new-task-owner" className="form-select" value={newAssigneeId} onChange={(event) => setNewAssigneeId(event.target.value)} disabled={busy}>
                                                <option value="">Unassigned</option>
                                                {assignees.map((admin) => <option key={admin._id} value={admin._id}>{admin.name} · {admin.role}</option>)}
                                            </select>
                                        </div>
                                        <div className="col-md-6">
                                            <label className="form-label small" htmlFor="new-task-date">Due date (optional)</label>
                                            <input id="new-task-date" type="date" className="form-control" value={newDueDate} onChange={(event) => setNewDueDate(event.target.value)} disabled={busy} />
                                        </div>
                                    </div>
                                    <button type="submit" className="btn btn-primary mt-3" disabled={busy || tasks.length >= 30}>
                                        <FaPlus className="me-2" />Add task
                                    </button>
                                    <div className="d-flex flex-wrap gap-2 mt-3">
                                        {suggestedTasks.filter((suggestion) => !tasks.some((task) => task.title.toLowerCase() === suggestion.toLowerCase())).map((suggestion) => (
                                            <button key={suggestion} type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setTitle(suggestion)} disabled={busy || tasks.length >= 30}>
                                                {suggestion}
                                            </button>
                                        ))}
                                    </div>
                                    {tasks.length >= 30 && <small className="text-muted d-block mt-2">Maximum of 30 tasks per booking.</small>}
                                </form>
                            )}
                        </div>

                        <div className="modal-footer">
                            <button type="button" className="btn btn-outline-secondary" onClick={onClose}>Close</button>
                        </div>
                    </div>
                </div>
            </div>
            <div className="modal-backdrop fade show" />
        </>
    );
};

export default BookingPreparationModal;
