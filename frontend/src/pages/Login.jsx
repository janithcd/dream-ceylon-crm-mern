import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FaLock, FaEnvelope } from "react-icons/fa";
import { useAuth } from "../context/AuthContext";

const Login = () => {
    const navigate = useNavigate();
    const { login } = useAuth();

    const [formData, setFormData] = useState({
        email: "admin@dreamceylon.com",
        password: "DreamCeylon123",
    });

    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const handleChange = (e) => {
        setFormData((prev) => ({
            ...prev,
            [e.target.name]: e.target.value,
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        setError("");
        setLoading(true);

        try {
            await login(formData.email, formData.password);
            navigate("/");
        } catch (err) {
            setError(
                err.response?.data?.message || "Login failed. Please try again."
            );
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-page min-vh-100 d-flex align-items-center justify-content-center">
            <div className="container">
                <div className="row justify-content-center">
                    <div className="col-12 col-md-8 col-lg-5">
                        <div className="card shadow-lg border-0 rounded-4">
                            <div className="card-body p-4 p-md-5">
                                <div className="text-center mb-4">
                                    <div className="brand-circle mx-auto mb-3">DCJ</div>
                                    <h2 className="fw-bold mb-1">Dream Ceylon CRM</h2>
                                    <p className="text-muted mb-0">
                                        Sign in to manage your DMC operations
                                    </p>
                                </div>

                                {error && (
                                    <div className="alert alert-danger" role="alert">
                                        {error}
                                    </div>
                                )}

                                <form onSubmit={handleSubmit}>
                                    <div className="mb-3">
                                        <label className="form-label fw-semibold">Email</label>
                                        <div className="input-group">
                      <span className="input-group-text">
                        <FaEnvelope />
                      </span>
                                            <input
                                                type="email"
                                                name="email"
                                                className="form-control"
                                                value={formData.email}
                                                onChange={handleChange}
                                                placeholder="admin@dreamceylon.com"
                                                required
                                            />
                                        </div>
                                    </div>

                                    <div className="mb-4">
                                        <label className="form-label fw-semibold">Password</label>
                                        <div className="input-group">
                      <span className="input-group-text">
                        <FaLock />
                      </span>
                                            <input
                                                type="password"
                                                name="password"
                                                className="form-control"
                                                value={formData.password}
                                                onChange={handleChange}
                                                placeholder="Enter password"
                                                required
                                            />
                                        </div>
                                    </div>

                                    <button
                                        type="submit"
                                        className="btn btn-primary w-100 py-2 fw-semibold"
                                        disabled={loading}
                                    >
                                        {loading ? "Signing in..." : "Login"}
                                    </button>
                                </form>

                                <p className="text-center text-muted small mt-4 mb-0">
                                    MERN Stack Travel Agency CRM
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Login;