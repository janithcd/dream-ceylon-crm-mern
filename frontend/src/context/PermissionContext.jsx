import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from "react";

import api from "../api/axios";

const PermissionContext = createContext(null);

const normalizeRole = (value) =>
    String(value || "")
        .trim()
        .toLowerCase();

const normalizePermissionList = (value) => {
    if (!Array.isArray(value)) {
        return [];
    }

    return [
        ...new Set(
            value
                .map((permission) => String(permission || "").trim())
                .filter(Boolean)
        ),
    ];
};

export const PermissionProvider = ({ children }) => {
    const [admin, setAdmin] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const loadAdminProfile = useCallback(async () => {
        try {
            setLoading(true);
            setError("");

            const response = await api.get("/auth/profile");
            const profile = response.data?.admin || response.data || null;

            setAdmin(profile);
            return profile;
        } catch (requestError) {
            setAdmin(null);
            setError(
                requestError.response?.data?.message ||
                    "Failed to load the logged-in administrator."
            );
            return null;
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadAdminProfile();
    }, [loadAdminProfile]);

    const permissions = useMemo(
        () => normalizePermissionList(admin?.permissions),
        [admin]
    );

    const isSuperAdmin = useMemo(() => {
        const role = normalizeRole(admin?.role);

        return (
            role === "super admin" ||
            role === "superadmin" ||
            role === "admin"
        );
    }, [admin]);

    const hasPermission = useCallback(
        (permission) => {
            if (!permission) {
                return true;
            }

            if (isSuperAdmin) {
                return true;
            }

            return permissions.includes(permission);
        },
        [isSuperAdmin, permissions]
    );

    const hasAnyPermission = useCallback(
        (requiredPermissions = []) => {
            const list = Array.isArray(requiredPermissions)
                ? requiredPermissions
                : [requiredPermissions];

            if (list.length === 0) {
                return true;
            }

            if (isSuperAdmin) {
                return true;
            }

            return list.some((permission) =>
                permissions.includes(permission)
            );
        },
        [isSuperAdmin, permissions]
    );

    const hasAllPermissions = useCallback(
        (requiredPermissions = []) => {
            const list = Array.isArray(requiredPermissions)
                ? requiredPermissions
                : [requiredPermissions];

            if (list.length === 0) {
                return true;
            }

            if (isSuperAdmin) {
                return true;
            }

            return list.every((permission) =>
                permissions.includes(permission)
            );
        },
        [isSuperAdmin, permissions]
    );

    const value = useMemo(
        () => ({
            admin,
            loading,
            error,
            permissions,
            isSuperAdmin,
            hasPermission,
            hasAnyPermission,
            hasAllPermissions,
            refreshPermissions: loadAdminProfile,
        }),
        [
            admin,
            loading,
            error,
            permissions,
            isSuperAdmin,
            hasPermission,
            hasAnyPermission,
            hasAllPermissions,
            loadAdminProfile,
        ]
    );

    return (
        <PermissionContext.Provider value={value}>
            {children}
        </PermissionContext.Provider>
    );
};

export const usePermissions = () => {
    const context = useContext(PermissionContext);

    if (!context) {
        throw new Error(
            "usePermissions must be used inside PermissionProvider."
        );
    }

    return context;
};
