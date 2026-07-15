import { Navigate, useLocation } from "react-router-dom";

import { usePermissions } from "../context/PermissionContext";

const LoadingScreen = () => {
    return (
        <div
            className="d-flex justify-content-center align-items-center"
            style={{ minHeight: "55vh" }}
        >
            <div className="text-center">
                <div
                    className="spinner-border text-success mb-3"
                    role="status"
                />
                <p className="text-muted mb-0">
                    Checking your access permissions...
                </p>
            </div>
        </div>
    );
};

const PermissionRoute = ({
    permission,
    any = [],
    all = [],
    children,
}) => {
    const location = useLocation();

    const {
        loading,
        hasPermission,
        hasAnyPermission,
        hasAllPermissions,
    } = usePermissions();

    if (loading) {
        return <LoadingScreen />;
    }

    let allowed = true;

    if (permission) {
        allowed = hasPermission(permission);
    }

    if (allowed && Array.isArray(any) && any.length > 0) {
        allowed = hasAnyPermission(any);
    }

    if (allowed && Array.isArray(all) && all.length > 0) {
        allowed = hasAllPermissions(all);
    }

    if (!allowed) {
        return (
            <Navigate
                to="/access-denied"
                replace
                state={{ from: location.pathname }}
            />
        );
    }

    return children;
};

export default PermissionRoute;
