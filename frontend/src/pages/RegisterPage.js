import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Loader2, Shield, Activity, BarChart3, CheckCircle2, Clock } from "lucide-react";

// Background video - served from public folder (static asset)
const BACKGROUND_VIDEO = "/background.mp4";

// Styles for register page (shared between form and success states)
const REGISTER_STYLES = `
  .register-page-container {
    display: flex;
    min-height: 100vh;
    min-height: 100dvh;
  }

  /* Left Image Section */
  .register-image-section {
    display: none;
    position: relative;
    width: 55%;
    overflow: hidden;
  }

  @media (min-width: 1024px) {
    .register-image-section {
      display: block;
    }
  }

  .register-bg-video {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .register-image-overlay {
    position: absolute;
    inset: 0;
    background: linear-gradient(
      135deg,
      rgba(15, 23, 42, 0.85) 0%,
      rgba(30, 64, 175, 0.75) 50%,
      rgba(15, 23, 42, 0.9) 100%
    );
  }

  .register-image-content {
    position: relative;
    z-index: 10;
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 48px;
    color: white;
  }

  .register-brand {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .register-brand-title {
    font-size: 28px;
    font-weight: 700;
    color: white;
    letter-spacing: -0.02em;
  }

  .register-tagline {
    max-width: 480px;
  }

  .register-tagline h2 {
    font-size: 42px;
    font-weight: 700;
    line-height: 1.2;
    margin-bottom: 16px;
    letter-spacing: -0.02em;
  }

  .register-tagline p {
    font-size: 18px;
    color: rgba(255, 255, 255, 0.8);
    line-height: 1.6;
  }

  .register-features {
    display: flex;
    gap: 24px;
  }

  .register-feature {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    background: rgba(255, 255, 255, 0.1);
    backdrop-filter: blur(8px);
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
  }

  /* Right Form Section */
  .register-form-section {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: #f8fafc;
  }

  @media (min-width: 1024px) {
    .register-form-section {
      width: 45%;
      padding: 48px;
    }
  }

  .register-form-wrapper {
    width: 100%;
    max-width: 400px;
    padding: 32px;
    background: white;
    border-radius: 16px;
    box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
  }

  @media (min-width: 640px) {
    .register-form-wrapper {
      padding: 40px;
    }
  }

  /* Mobile video background - hidden on desktop, visible on mobile */
  .register-mobile-video {
    display: none;
  }

  @media (max-width: 1023px) {
    .register-page-container {
      position: relative;
      overflow: hidden;
    }

    .register-mobile-video {
      display: block;
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      z-index: 0;
    }

    .register-page-container::before {
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(
        135deg,
        rgba(15, 23, 42, 0.9) 0%,
        rgba(30, 64, 175, 0.85) 50%,
        rgba(15, 23, 42, 0.95) 100%
      );
      z-index: 1;
    }

    .register-form-section {
      position: relative;
      z-index: 10;
      background: transparent;
    }

    .register-form-wrapper {
      background: rgba(255, 255, 255, 0.97);
      backdrop-filter: blur(12px);
    }
  }
`;

const RegisterPage = () => {
  const { register } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [registrationComplete, setRegistrationComplete] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    
    setLoading(true);

    try {
      const result = await register(name, email, password);
      // Show pending approval state instead of auto-login
      if (result?.status === "pending_approval") {
        setRegistrationComplete(true);
      } else {
        // Fallback for existing behavior (if any)
        toast.success("Account created successfully!");
        navigate("/login");
      }
    } catch (error) {
      const message = error.response?.data?.detail || "Registration failed. Please try again.";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  // Show success screen after registration
  if (registrationComplete) {
    return (
      <div className="register-page-container">
        {/* Mobile Video Background - positioned at container level */}
        <video 
          src={BACKGROUND_VIDEO}
          autoPlay
          loop
          muted
          playsInline
          className="register-mobile-video"
        />
        
        {/* Left side - Background Video with Overlay */}
        <div className="register-image-section">
          <video 
            src={BACKGROUND_VIDEO}
            autoPlay
            loop
            muted
            playsInline
            className="register-bg-video"
          />
          <div className="register-image-overlay" />
          <div className="register-image-content">
            <div className="register-brand">
              <img 
                src="/logo.png" 
                alt="AssetIQ" 
                className="w-14 h-14 rounded-xl shadow-lg"
              />
              <h1 className="register-brand-title">AssetIQ</h1>
            </div>
            <div className="register-tagline">
              <h2>Welcome Aboard!</h2>
              <p>Your account has been created successfully. You're one step away from accessing powerful asset management intelligence.</p>
            </div>
            <div className="register-features">
              <div className="register-feature">
                <Shield className="w-5 h-5" />
                <span>Asset Management</span>
              </div>
              <div className="register-feature">
                <Activity className="w-5 h-5" />
                <span>Reliability Management</span>
              </div>
              <div className="register-feature">
                <BarChart3 className="w-5 h-5" />
                <span>Workforce Management</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right side - Success Message */}
        <div className="register-form-section">
          <div className="register-form-wrapper">
            <div className="text-center space-y-6">
              <div className="mx-auto w-20 h-20 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-10 h-10 text-green-600" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-slate-900 mb-2">Registration Successful!</h2>
                <p className="text-slate-600">Your account has been created.</p>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-left">
                <div className="flex items-start gap-3">
                  <Clock className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-amber-800">Approval Required</p>
                    <p className="text-sm text-amber-700 mt-1">
                      Your account is pending approval by an administrator. You'll receive an email once your account has been approved.
                    </p>
                  </div>
                </div>
              </div>
              <Button 
                onClick={() => navigate("/login")}
                className="w-full h-11"
                data-testid="go-to-login-btn"
              >
                Go to Login
              </Button>
            </div>
          </div>
        </div>
        <style>{REGISTER_STYLES}</style>
      </div>
    );
  }

  return (
    <div className="register-page-container">
      {/* Mobile Video Background - positioned at container level */}
      <video 
        src={BACKGROUND_VIDEO}
        autoPlay
        loop
        muted
        playsInline
        className="register-mobile-video"
      />
      
      {/* Left side - Background Video with Overlay */}
      <div className="register-image-section">
        <video 
          src={BACKGROUND_VIDEO}
          autoPlay
          loop
          muted
          playsInline
          className="register-bg-video"
        />
        <div className="register-image-overlay" />
        <div className="register-image-content">
          <div className="register-brand">
            <img 
              src="/logo.png" 
              alt="AssetIQ" 
              className="w-14 h-14 rounded-xl shadow-lg"
            />
            <h1 className="register-brand-title">AssetIQ</h1>
          </div>
          <div className="register-tagline">
            <h2><span style={{whiteSpace: 'nowrap'}}>Asset Management Intelligence</span><br/>Platform</h2>
            <p>Unify asset, reliability, and workforce management in one intelligent platform. Turn data into action with AI-driven insights.</p>
          </div>
          <div className="register-features">
            <div className="register-feature">
              <Shield className="w-5 h-5" />
              <span>Asset Management</span>
            </div>
            <div className="register-feature">
              <Activity className="w-5 h-5" />
              <span>Reliability Management</span>
            </div>
            <div className="register-feature">
              <BarChart3 className="w-5 h-5" />
              <span>Workforce Management</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right side - Register Form */}
      <div className="register-form-section">
        <div className="register-form-wrapper animate-fade-in">
          {/* Mobile Logo (hidden on desktop) */}
          <div className="register-mobile-logo">
            <img 
              src="/logo.png" 
              alt="AssetIQ" 
              className="w-10 h-10 rounded-lg"
            />
            <span className="text-xl font-bold text-slate-900">AssetIQ</span>
          </div>

          <h1 className="auth-title" data-testid="register-title">{t("auth.registerTitle")}</h1>
          <p className="auth-subtitle">{t("auth.registerSubtitle")}</p>

          <form onSubmit={handleSubmit} className="space-y-5" data-testid="register-form">
            <div className="space-y-2">
              <Label htmlFor="name">{t("auth.name")}</Label>
              <Input
                id="name"
                type="text"
                placeholder="John Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="h-11"
                data-testid="register-name-input"
              />
            </div>

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
                data-testid="register-email-input"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">{t("auth.password")}</Label>
              <Input
                id="password"
                type="password"
                placeholder="Min. 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="h-11"
                data-testid="register-password-input"
              />
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-11 bg-blue-600 hover:bg-blue-700"
              data-testid="register-submit-button"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {t("common.creating")}
                </>
              ) : (
                t("auth.register")
              )}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            {t("auth.hasAccount")}{" "}
            <Link 
              to="/login" 
              className="text-blue-600 font-medium hover:underline"
              data-testid="login-link"
            >
              {t("auth.signIn")}
            </Link>
          </p>
        </div>
      </div>

      <style>{REGISTER_STYLES}</style>
    </div>
  );
};

export default RegisterPage;
