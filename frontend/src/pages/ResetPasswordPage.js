import { useState, useEffect } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { useLanguage } from "../contexts/LanguageContext";
import { authAPI } from "../lib/api";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Loader2, ArrowLeft, Lock, CheckCircle, AlertCircle, Eye, EyeOff } from "lucide-react";

// Industrial background image
const BACKGROUND_IMAGE = "https://customer-assets.emergentagent.com/job_682831cd-c439-4614-becb-4ef9d40f147d/artifacts/a6gi0iug_27149310e1925cc6e07ada4653176e7f361ba5e96a825c22e1e22a3df59bf5a7.png";

const ResetPasswordPage = () => {
  const { t } = useLanguage();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token");
  
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [tokenEmail, setTokenEmail] = useState("");
  const [resetComplete, setResetComplete] = useState(false);

  // Verify token on mount
  useEffect(() => {
    const verifyToken = async () => {
      if (!token) {
        setVerifying(false);
        return;
      }

      try {
        const result = await authAPI.verifyResetToken(token);
        setTokenValid(true);
        setTokenEmail(result.email);
      } catch (error) {
        setTokenValid(false);
      } finally {
        setVerifying(false);
      }
    };

    verifyToken();
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (password !== confirmPassword) {
      toast.error("Passwords don't match");
      return;
    }
    
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    setLoading(true);

    try {
      await authAPI.resetPassword(token, password);
      setResetComplete(true);
      toast.success("Password reset successfully!");
    } catch (error) {
      const message = error.response?.data?.detail || "Failed to reset password. Please try again.";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  // Password strength indicator
  const getPasswordStrength = () => {
    if (!password) return { strength: 0, label: "", color: "" };
    let strength = 0;
    if (password.length >= 6) strength++;
    if (password.length >= 8) strength++;
    if (/[A-Z]/.test(password)) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[^A-Za-z0-9]/.test(password)) strength++;
    
    if (strength <= 2) return { strength: 33, label: "Weak", color: "#ef4444" };
    if (strength <= 3) return { strength: 66, label: "Medium", color: "#f59e0b" };
    return { strength: 100, label: "Strong", color: "#10b981" };
  };

  const passwordStrength = getPasswordStrength();

  return (
    <div className="reset-password-container">
      {/* Left side - Background Image */}
      <div className="reset-image-section">
        <img 
          src={BACKGROUND_IMAGE} 
          alt="Industrial Plant" 
          className="reset-bg-image"
        />
        <div className="reset-image-overlay" />
        <div className="reset-image-content">
          <div className="reset-brand">
            <img 
              src="/logo.png" 
              alt="AssetIQ" 
              className="w-14 h-14 rounded-xl shadow-lg"
            />
            <h1 className="reset-brand-title">AssetIQ</h1>
          </div>
          <div className="reset-tagline">
            <h2>Create New Password</h2>
            <p>Choose a strong password to keep your account secure.</p>
          </div>
        </div>
      </div>

      {/* Right side - Form */}
      <div className="reset-form-section">
        <div className="reset-form-wrapper animate-fade-in">
          {/* Mobile Logo */}
          <div className="reset-mobile-logo">
            <img 
              src="/logo.png" 
              alt="AssetIQ" 
              className="w-10 h-10 rounded-lg"
            />
            <span className="text-xl font-bold text-slate-900">AssetIQ</span>
          </div>

          {verifying ? (
            <div className="verifying-state">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto" />
              <p className="mt-4 text-slate-600">Verifying your reset link...</p>
            </div>
          ) : !token || !tokenValid ? (
            <div className="invalid-token-state">
              <div className="error-icon-wrapper">
                <AlertCircle className="w-12 h-12 text-red-500" />
              </div>
              <h1 className="reset-title">Invalid Reset Link</h1>
              <p className="reset-subtitle">
                This password reset link is invalid or has expired. Please request a new one.
              </p>
              <Link to="/forgot-password">
                <Button className="w-full h-11 bg-blue-600 hover:bg-blue-700 mt-4">
                  Request New Link
                </Button>
              </Link>
            </div>
          ) : resetComplete ? (
            <div className="reset-complete-state">
              <div className="success-icon-wrapper">
                <CheckCircle className="w-12 h-12 text-green-500" />
              </div>
              <h1 className="reset-title">Password Reset Complete</h1>
              <p className="reset-subtitle">
                Your password has been successfully reset. You can now log in with your new password.
              </p>
              <Button 
                onClick={() => navigate("/login")}
                className="w-full h-11 bg-blue-600 hover:bg-blue-700 mt-4"
              >
                Go to Login
              </Button>
            </div>
          ) : (
            <>
              <Link 
                to="/login" 
                className="reset-back-link"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back to login</span>
              </Link>

              <div className="reset-icon-wrapper">
                <Lock className="w-8 h-8 text-blue-600" />
              </div>
              
              <h1 className="reset-title" data-testid="reset-password-title">
                Set New Password
              </h1>
              <p className="reset-subtitle">
                Enter a new password for <strong>{tokenEmail}</strong>
              </p>

              <form onSubmit={handleSubmit} className="space-y-5" data-testid="reset-password-form">
                <div className="space-y-2">
                  <Label htmlFor="password">New Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter new password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={6}
                      className="h-11 pr-10"
                      data-testid="reset-password-input"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                  
                  {/* Password strength indicator */}
                  {password && (
                    <div className="password-strength">
                      <div className="strength-bar">
                        <div 
                          className="strength-fill" 
                          style={{ 
                            width: `${passwordStrength.strength}%`,
                            backgroundColor: passwordStrength.color
                          }}
                        />
                      </div>
                      <span className="strength-label" style={{ color: passwordStrength.color }}>
                        {passwordStrength.label}
                      </span>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm Password</Label>
                  <Input
                    id="confirmPassword"
                    type={showPassword ? "text" : "password"}
                    placeholder="Confirm new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={6}
                    className="h-11"
                    data-testid="reset-confirm-password-input"
                  />
                  {confirmPassword && password !== confirmPassword && (
                    <p className="text-sm text-red-500">Passwords don't match</p>
                  )}
                </div>

                <Button
                  type="submit"
                  disabled={loading || password !== confirmPassword || password.length < 6}
                  className="w-full h-11 bg-blue-600 hover:bg-blue-700"
                  data-testid="reset-submit-button"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Resetting...
                    </>
                  ) : (
                    "Reset Password"
                  )}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>

      <style>{`
        .reset-password-container {
          display: flex;
          min-height: 100vh;
          min-height: 100dvh;
        }

        /* Left Image Section */
        .reset-image-section {
          display: none;
          position: relative;
          width: 55%;
          overflow: hidden;
        }

        @media (min-width: 1024px) {
          .reset-image-section {
            display: block;
          }
        }

        .reset-bg-image {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .reset-image-overlay {
          position: absolute;
          inset: 0;
          background: linear-gradient(
            135deg,
            rgba(15, 23, 42, 0.85) 0%,
            rgba(30, 64, 175, 0.75) 50%,
            rgba(15, 23, 42, 0.9) 100%
          );
        }

        .reset-image-content {
          position: relative;
          z-index: 10;
          height: 100%;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 48px;
          color: white;
        }

        .reset-brand {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .reset-brand-title {
          font-size: 28px;
          font-weight: 700;
          color: white;
          letter-spacing: -0.02em;
        }

        .reset-tagline {
          max-width: 480px;
          margin-bottom: 48px;
        }

        .reset-tagline h2 {
          font-size: 42px;
          font-weight: 700;
          line-height: 1.2;
          margin-bottom: 16px;
          letter-spacing: -0.02em;
        }

        .reset-tagline p {
          font-size: 18px;
          color: rgba(255, 255, 255, 0.8);
          line-height: 1.6;
        }

        /* Right Form Section */
        .reset-form-section {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          background: #f8fafc;
        }

        @media (min-width: 1024px) {
          .reset-form-section {
            width: 45%;
            flex: none;
          }
        }

        .reset-form-wrapper {
          width: 100%;
          max-width: 400px;
          background: white;
          padding: 40px;
          border-radius: 20px;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1);
          border: 1px solid #e2e8f0;
        }

        .reset-mobile-logo {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 24px;
        }

        @media (min-width: 1024px) {
          .reset-mobile-logo {
            display: none;
          }
        }

        .reset-back-link {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          color: #64748b;
          font-size: 14px;
          font-weight: 500;
          margin-bottom: 24px;
          transition: color 0.2s;
        }

        .reset-back-link:hover {
          color: #3b82f6;
        }

        .reset-icon-wrapper {
          width: 56px;
          height: 56px;
          background: #eff6ff;
          border-radius: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 24px;
        }

        .reset-title {
          font-size: 24px;
          font-weight: 700;
          color: #1e293b;
          margin-bottom: 8px;
        }

        .reset-subtitle {
          font-size: 15px;
          color: #64748b;
          line-height: 1.6;
          margin-bottom: 24px;
        }

        .verifying-state,
        .invalid-token-state,
        .reset-complete-state {
          text-align: center;
          padding: 20px 0;
        }

        .error-icon-wrapper {
          width: 72px;
          height: 72px;
          background: #fef2f2;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 24px;
        }

        .success-icon-wrapper {
          width: 72px;
          height: 72px;
          background: #ecfdf5;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 24px;
        }

        /* Password Strength */
        .password-strength {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-top: 8px;
        }

        .strength-bar {
          flex: 1;
          height: 4px;
          background: #e2e8f0;
          border-radius: 2px;
          overflow: hidden;
        }

        .strength-fill {
          height: 100%;
          transition: width 0.3s, background-color 0.3s;
        }

        .strength-label {
          font-size: 12px;
          font-weight: 600;
          min-width: 50px;
        }

        /* Mobile full background */
        @media (max-width: 1023px) {
          .reset-password-container {
            background-image: url('${BACKGROUND_IMAGE}');
            background-size: cover;
            background-position: center;
            position: relative;
          }

          .reset-password-container::before {
            content: '';
            position: absolute;
            inset: 0;
            background: linear-gradient(
              135deg,
              rgba(15, 23, 42, 0.9) 0%,
              rgba(30, 64, 175, 0.85) 50%,
              rgba(15, 23, 42, 0.95) 100%
            );
          }

          .reset-form-section {
            position: relative;
            z-index: 10;
            background: transparent;
          }

          .reset-form-wrapper {
            background: rgba(255, 255, 255, 0.97);
            backdrop-filter: blur(12px);
          }
        }
      `}</style>
    </div>
  );
};

export default ResetPasswordPage;
