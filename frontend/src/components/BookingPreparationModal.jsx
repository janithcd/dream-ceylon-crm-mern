import { useEffect, useState } from "react";
import { FaClipboardCheck, FaPlus, FaTrash } from "react-icons/fa";
import api from "../api/axios";
import { usePermissions } from "../context/PermissionContext";

const suggestedTasks = [
    "Confirm accommodation",
    "Arrange vehicle and chauffeur",
    "Confirm guide",
    "Send final itinerary to client",
];

const BookingPreparationModal = ({ booking, onClose, onChanged }) => {
    const { hasPermission } = usePermissions();
    const canUpdate = hasPermission("booking.update");
    const [tasks, setTasks] = useState(booking.preparationTasks || []);
    const [title, setTitle] = useState("");
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

        return () => { active = false; };
    }, [booking._id]);

    const completeCount = tasks.filter((task) => task.completedAt).length;

    const addTask = async (event) => {
        event.preventDefault();
        if (!title.trim() || busy) return;

        try {
            setBusy(true);
            setError("");
            setSuccess("");
            const response = await api.post(`/bookings/${booking._id}/preparation-tasks`, { title: title.trim() });
            setTasks(response.data.tasks || []);
            setTitle("");
            setSuccess("Task added.");
            onChanged();
        } catch (err) {
            setError(err.response?.data?.message || "Failed to add task.");
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
                            <p className="text-muted small mb-3">Track arrangements for this booking. This checklist does not change the booking or payment status.</p>
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
                                        <div key={task._id} className="list-group-item d-flex align-items-center justify-content-between gap-3">
                                            <label className="d-flex align-items-center gap-3 flex-grow-1 mb-0">
                                                <input
                                                    type="checkbox"
                                                    className="form-check-input mt-0"
                                                    checked={Boolean(task.completedAt)}
                                                    onChange={() => setCompleted(task, !task.completedAt)}
                                                    disabled={!canUpdate || busy}
                                                />
                                                <span className={task.completedAt ? "text-decoration-line-through text-muted" : ""}>{task.title}</span>
                                            </label>
                                            {canUpdate && (
                                                <button
                                                    type="button"
                                                    className="btn btn-sm btn-outline-danger"
                                                    onClick={() => removeTask(task)}
                                                    disabled={busy}
                                                    aria-label={`Remove ${task.title}`}
                                                >
                                                    <FaTrash />
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {canUpdate && !loading && (
                                <form onSubmit={addTask}>
                                    <label className="form-label fw-semibold" htmlFor="preparation-task-title">Add a task</label>
                                    <div className="input-group">
                                        <input
                                            id="preparation-task-title"
                                            className="form-control"
                                            value={title}
                                            onChange={(event) => setTitle(event.target.value)}
                                            maxLength={120}
                                            required
                                            placeholder="e.g. Confirm Sigiriya hotel"
                                        />
                                        <button type="submit" className="btn btn-primary" disabled={busy || tasks.length >= 30}>
                                            <FaPlus className="me-2" />Add
                                        </button>
                                    </div>
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
