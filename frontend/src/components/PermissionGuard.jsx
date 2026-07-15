import { usePermissions } from "../context/PermissionContext";

const PermissionGuard = ({
    permission,
    any = [],
    all = [],
    fallback = null,
    children,
}) => {
    const {
        loading,
        hasPermission,
        hasAnyPermission,
        hasAllPermissions,
    } = usePermissions();

    if (loading) {
        return fallback;
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

    return allowed ? children : fallback;
};

export default PermissionGuard;
