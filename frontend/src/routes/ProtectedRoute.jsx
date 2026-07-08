import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const ProtectedRoute = ({ children }) => {
    const { admin, loading } = useAuth();

    if (loading) {
        return (
            <div className="min-vh-100 d-flex align-items-center justify-content-center">
                <p className="text-muted">Loading...</p>
            </div>
        );
    }

    if (!admin) {
        return <Navigate to="/login" replace />;
    }

    return children;
};

export default ProtectedRoute;