import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios";

const ForgotPassword = () => {
    const [email, setEmail] = useState("");
    const [code, setCode] = useState("");
    const [resetToken, setResetToken] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [step, setStep] = useState("email");
    const [cooldown, setCooldown] = useState(0);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!cooldown) return undefined;
        const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
        return () => clearTimeout(timer);
    }, [cooldown]);

    const sendCode = async (event) => {
        event?.preventDefault();
        setError("");
        setMessage("");
        setLoading(true);
        try {
            const response = await api.post("/auth/forgot-password", { email: email.trim() });
            setMessage(response.data.message);
            setStep("code");
            setCode("");
            setCooldown(60);
        } catch (err) {
            setError(err.response?.data?.message || "Could not request a code. Try again later.");
        } finally {
            setLoading(false);
        }
    };

    const verifyCode = async (event) => {
        event.preventDefault();
        setError("");
        setLoading(true);
        try {
            const response = await api.post("/auth/verify-reset-code", { email: email.trim(), code });
            setResetToken(response.data.resetToken);
            setStep("password");
            setMessage("");
        } catch (err) {
            setError(err.response?.data?.message || "Could not verify the code. Try again.");
        } finally {
            setLoading(false);
        }
    };

    const changePassword = async (event) => {
        event.preventDefault();
        setError("");
        if (password !== confirmPassword) {
            setError("Passwords do not match.");
            return;
        }
        setLoading(true);
        try {
            const response = await api.post("/auth/reset-password", {
                email: email.trim(), resetToken, password,
            });
            setPassword("");
            setConfirmPassword("");
            setResetToken("");
            setStep("complete");
            setMessage(response.data.message);
        } catch (err) {
            setError(err.response?.data?.message || "Could not change the password. Try again.");
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
                                    <h2 className="fw-bold mb-1">Reset your password</h2>
                                    <p className="text-muted mb-0">
                                        {step === "email" && "Enter the email registered to your CRM account."}
                                        {step === "code" && "Check your email for a six-digit code. It expires in 10 minutes."}
                                        {step === "password" && "Choose a new password for your account."}
                                        {step === "complete" && "Your password has been updated."}
                                    </p>
                                </div>

                                {error && <div className="alert alert-danger" role="alert">{error}</div>}
                                {message && <div className="alert alert-info" role="status">{message}</div>}

                                {step === "email" && (
                                    <form onSubmit={sendCode}>
                                        <label htmlFor="reset-email" className="form-label fw-semibold">Admin email</label>
                                        <input id="reset-email" className="form-control mb-3" type="email"
                                            value={email} onChange={(event) => setEmail(event.target.value)}
                                            autoComplete="username" required />
                                        <button className="btn btn-primary w-100 py-2" type="submit" disabled={loading}>
                                            {loading ? "Sending..." : "Send reset code"}
                                        </button>
                                    </form>
                                )}

                                {step === "code" && (
                                    <>
                                        <form onSubmit={verifyCode}>
                                            <label htmlFor="reset-code" className="form-label fw-semibold">Six-digit code</label>
                                            <input id="reset-code" className="form-control mb-3" type="text"
                                                inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}"
                                                maxLength={6} value={code}
                                                onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                                                required />
                                            <button className="btn btn-primary w-100 py-2" type="submit" disabled={loading || code.length !== 6}>
                                                {loading ? "Verifying..." : "Verify code"}
                                            </button>
                                        </form>
                                        <div className="d-flex justify-content-between mt-3">
                                            <button type="button" className="btn btn-link p-0" onClick={() => {
                                                setStep("email"); setCode(""); setMessage(""); setError("");
                                            }}>Use another email</button>
                                            <button type="button" className="btn btn-link p-0" onClick={() => sendCode()}
                                                disabled={loading || cooldown > 0}>
                                                {cooldown ? `Resend in ${cooldown}s` : "Resend code"}
                                            </button>
                                        </div>
                                    </>
                                )}

                                {step === "password" && (
                                    <form onSubmit={changePassword}>
                                        <label htmlFor="new-password" className="form-label fw-semibold">New password</label>
                                        <input id="new-password" className="form-control mb-3" type="password"
                                            minLength={12} maxLength={72} autoComplete="new-password"
                                            value={password} onChange={(event) => setPassword(event.target.value)} required />
                                        <label htmlFor="confirm-password" className="form-label fw-semibold">Confirm password</label>
                                        <input id="confirm-password" className="form-control mb-2" type="password"
                                            autoComplete="new-password" value={confirmPassword}
                                            onChange={(event) => setConfirmPassword(event.target.value)} required />
                                        <p className="text-muted small">Use at least 12 characters.</p>
                                        <button className="btn btn-primary w-100 py-2" type="submit" disabled={loading}>
                                            {loading ? "Updating..." : "Change password"}
                                        </button>
                                    </form>
                                )}

                                {step === "complete" && <Link to="/login" className="btn btn-primary w-100 py-2">Sign in</Link>}
                                {step !== "complete" && <p className="text-center mt-4 mb-0"><Link to="/login">Back to sign in</Link></p>}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ForgotPassword;
