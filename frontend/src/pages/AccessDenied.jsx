import { useLocation, useNavigate } from "react-router-dom";
import {
    FaArrowLeft,
    FaHome,
    FaLock,
} from "react-icons/fa";

import { usePermissions } from "../context/PermissionContext";

const AccessDenied = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { admin } = usePermissions();

    const blockedPath = location.state?.from || "";

    return (
        <div
            className="d-flex align-items-center justify-content-center"
            style={{ minHeight: "70vh" }}
        >
            <div
                className="card border-0 shadow-sm rounded-4 text-center"
                style={{ width: "100%", maxWidth: "620px" }}
            >
                <div className="card-body p-5">
                    <div
                        className="d-inline-flex align-items-center justify-content-center rounded-circle bg-danger-subtle text-danger mb-4"
                        style={{
                            width: "82px",
                            height: "82px",
                            fontSize: "2rem",
                        }}
                    >
                        <FaLock />
                    </div>

                    <h2 className="fw-bold mb-2">Access Denied</h2>

                    <p className="text-muted mb-2">
                        Your account does not have permission to open this
                        section of Dream Ceylon CRM.
                    </p>

                    {blockedPath && (
                        <p className="small text-muted mb-3">
                            Restricted page: <code>{blockedPath}</code>
                        </p>
                    )}

                    <div className="alert alert-light border mb-4">
                        Signed in as{" "}
                        <strong>
                            {admin?.name || admin?.email || "Administrator"}
                        </strong>
                        <br />
                        <small className="text-muted">
                            Role: {admin?.role || "Unknown"}
                        </small>
                    </div>

                    <div className="d-flex flex-column flex-sm-row justify-content-center gap-2">
                        <button
                            type="button"
                            className="btn btn-outline-secondary"
                            onClick={() => navigate(-1)}
                        >
                            <FaArrowLeft className="me-2" />
                            Go Back
                        </button>

                        <button
                            type="button"
                            className="btn btn-success"
                            onClick={() => navigate("/", { replace: true })}
                        >
                            <FaHome className="me-2" />
                            Open Dashboard
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AccessDenied;
