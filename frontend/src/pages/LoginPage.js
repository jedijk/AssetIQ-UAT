import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Loader2, Shield, Activity, BarChart3 } from "lucide-react";

// Industrial background image
const BACKGROUND_IMAGE = "https://customer-assets.emergentagent.com/job_682831cd-c439-4614-becb-4ef9d40f147d/artifacts/a6gi0iug_27149310e1925cc6e07ada4653176e7f361ba5e96a825c22e1e22a3df59bf5a7.png";

const LoginPage = () => {
  const { login } = useAuth();
  const { t } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // Get the redirect destination from state (set by ProtectedRoute)
  const from = location.state?.from || "/";

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      await login(email, password);
      toast.success(t("chat.welcomeMessage").split("!")[0] + "!");
      // Navigate to the intended destination after successful login
      navigate(from, { replace: true });
    } catch (error) {
      const message = error.response?.data?.detail || "Login failed. Please try again.";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page-container">
      {/* Left side - Background Image with Overlay */}
      <div className="login-image-section">
        <img 
          src={BACKGROUND_IMAGE} 
          alt="Industrial Plant" 
          className="login-bg-image"
        />
        <div className="login-image-overlay" />
        <div className="login-image-content">
          <div className="login-brand">
            <img 
              src="/logo.png" 
              alt="AssetIQ" 
              className="w-14 h-14 rounded-xl shadow-lg"
            />
            <h1 className="login-brand-title">AssetIQ</h1>
          </div>
          <div className="login-tagline">
            <h2>Reliability Intelligence Platform</h2>
            <p>Capture threats, prioritize risks, and maintain equipment with AI-powered insights</p>
          </div>
          <div className="login-features">
            <div className="login-feature">
              <Shield className="w-5 h-5" />
              <span>Risk Prioritization</span>
            </div>
            <div className="login-feature">
              <Activity className="w-5 h-5" />
              <span>FMEA Analysis</span>
            </div>
            <div className="login-feature">
              <BarChart3 className="w-5 h-5" />
              <span>Real-time Analytics</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right side - Login Form */}
      <div className="login-form-section">
        <div className="login-form-wrapper animate-fade-in">
          {/* Mobile Logo (hidden on desktop) */}
          <div className="login-mobile-logo">
            <img 
              src="/logo.png" 
              alt="AssetIQ" 
              className="w-10 h-10 rounded-lg"
            />
            <span className="text-xl font-bold text-slate-900">AssetIQ</span>
          </div>

          <h1 className="auth-title" data-testid="login-title">{t("auth.loginTitle")}</h1>
          <p className="auth-subtitle">{t("auth.loginSubtitle")}</p>

          <form onSubmit={handleSubmit} className="space-y-5" data-testid="login-form">
            <div className="space-y-2">
              <Label htmlFor="email">{t("auth.email")}</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-11"
                data-testid="login-email-input"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">{t("auth.password")}</Label>
              <Input
                id="password"
                type="password"
                placeholder={t("auth.password")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-11"
                data-testid="login-password-input"
              />
              <div className="flex justify-end">
                <Link 
                  to="/forgot-password" 
                  className="text-sm text-blue-600 hover:underline"
                  data-testid="forgot-password-link"
                >
                  {t("auth.forgotPassword") || "Forgot password?"}
                </Link>
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-11 bg-blue-600 hover:bg-blue-700"
              data-testid="login-submit-button"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {t("common.loading")}
                </>
              ) : (
                t("auth.signIn")
              )}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            {t("auth.noAccount")}{" "}
            <Link 
              to="/register" 
              className="text-blue-600 font-medium hover:underline"
              data-testid="register-link"
            >
              {t("auth.signUp")}
            </Link>
          </p>
        </div>
      </div>

      <style>{`
        .login-page-container {
          display: flex;
          min-height: 100vh;
          min-height: 100dvh;
        }

        /* Left Image Section */
        .login-image-section {
          display: none;
          position: relative;
          width: 55%;
          overflow: hidden;
        }

        @media (min-width: 1024px) {
          .login-image-section {
            display: block;
          }
        }

        .login-bg-image {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .login-image-overlay {
          position: absolute;
          inset: 0;
          background: linear-gradient(
            135deg,
            rgba(15, 23, 42, 0.85) 0%,
            rgba(30, 64, 175, 0.75) 50%,
            rgba(15, 23, 42, 0.9) 100%
          );
        }

        .login-image-content {
          position: relative;
          z-index: 10;
          height: 100%;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 48px;
          color: white;
        }

        .login-brand {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .login-brand-title {
          font-size: 28px;
          font-weight: 700;
          color: white;
          letter-spacing: -0.02em;
        }

        .login-tagline {
          max-width: 480px;
        }

        .login-tagline h2 {
          font-size: 42px;
          font-weight: 700;
          line-height: 1.2;
          margin-bottom: 16px;
          letter-spacing: -0.02em;
        }

        .login-tagline p {
          font-size: 18px;
          color: rgba(255, 255, 255, 0.8);
          line-height: 1.6;
        }

        .login-features {
          display: flex;
          gap: 32px;
        }

        .login-feature {
          display: flex;
          align-items: center;
          gap: 10px;
          color: rgba(255, 255, 255, 0.9);
          font-size: 14px;
          font-weight: 500;
          background: rgba(255, 255, 255, 0.1);
          padding: 10px 16px;
          border-radius: 8px;
          backdrop-filter: blur(8px);
        }

        /* Right Form Section */
        .login-form-section {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          background: #f8fafc;
        }

        @media (min-width: 1024px) {
          .login-form-section {
            width: 45%;
            flex: none;
          }
        }

        .login-form-wrapper {
          width: 100%;
          max-width: 400px;
          background: white;
          padding: 40px;
          border-radius: 20px;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1);
          border: 1px solid #e2e8f0;
        }

        .login-mobile-logo {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 32px;
        }

        @media (min-width: 1024px) {
          .login-mobile-logo {
            display: none;
          }
        }

        /* Mobile full background */
        @media (max-width: 1023px) {
          .login-page-container {
            background-image: url('${BACKGROUND_IMAGE}');
            background-size: cover;
            background-position: center;
            position: relative;
          }

          .login-page-container::before {
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

          .login-form-section {
            position: relative;
            z-index: 10;
            background: transparent;
          }

          .login-form-wrapper {
            background: rgba(255, 255, 255, 0.97);
            backdrop-filter: blur(12px);
          }
        }
      `}</style>
    </div>
  );
};

export default LoginPage;
