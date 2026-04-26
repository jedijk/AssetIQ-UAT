import { useState, useRef, useEffect, useCallback } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Loader2, Shield, Activity, BarChart3, RefreshCw, Server, WifiOff } from "lucide-react";
import { getBackendUrl } from "../lib/apiConfig";

// Background video - served from public folder (static asset)
const BACKGROUND_VIDEO = "/background.mp4";

// Max retry attempts for server connection
const MAX_RETRY_ATTEMPTS = 5;
const RETRY_DELAY_MS = 3000;

const LoginPage = () => {
  const { login } = useAuth();
  const { t } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  
  // Server startup state
  const [serverStarting, setServerStarting] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [autoRetrying, setAutoRetrying] = useState(false);
  const retryTimeoutRef = useRef(null);
  const pendingLoginRef = useRef(null);
  
  // Refs for accessing autofilled values (Face ID, password managers)
  const emailRef = useRef(null);
  const passwordRef = useRef(null);

  // Get the redirect destination from state (set by ProtectedRoute)
  const from = location.state?.from || "/";

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  // Check if error indicates server is starting/unavailable
  const isServerStartupError = (error) => {
    if (error.code === "ERR_NETWORK" || error.message === "Network Error") {
      return true;
    }
    if (error.response?.status >= 502 && error.response?.status <= 504) {
      return true;
    }
    if (error.code === "ECONNREFUSED" || error.code === "ETIMEDOUT") {
      return true;
    }
    return false;
  };

  // Perform login attempt
  const performLogin = useCallback(async (emailValue, passwordValue, isRetry = false) => {
    try {
      await login(emailValue, passwordValue);
      
      // Success - clear server starting state
      setServerStarting(false);
      setRetryCount(0);
      setAutoRetrying(false);
      pendingLoginRef.current = null;
      
      toast.success(t("chat.welcomeMessage").split("!")[0] + "!");
      navigate(from, { replace: true });
      return true;
    } catch (error) {
      // Check if this is a server startup error
      if (isServerStartupError(error)) {
        setServerStarting(true);
        pendingLoginRef.current = { email: emailValue, password: passwordValue };
        
        if (!isRetry) {
          setRetryCount(1);
          toast.info("Server is starting up. Retrying automatically...");
        }
        
        return false;
      }
      
      // Regular error - not a server issue
      setServerStarting(false);
      setAutoRetrying(false);
      pendingLoginRef.current = null;
      
      let message = "Login failed. Please try again.";
      if (error.response?.data?.detail) {
        message = error.response.data.detail;
      } else if (error.response?.status === 401) {
        message = "Invalid email or password.";
      }
      
      console.error("Login error:", error.response?.status, error.message);
      toast.error(message);
      return true; // Return true to stop retrying
    }
  }, [login, navigate, from, t]);

  // Auto-retry logic
  useEffect(() => {
    if (serverStarting && retryCount > 0 && retryCount <= MAX_RETRY_ATTEMPTS && pendingLoginRef.current) {
      setAutoRetrying(true);
      
      retryTimeoutRef.current = setTimeout(async () => {
        const { email: savedEmail, password: savedPassword } = pendingLoginRef.current;
        const success = await performLogin(savedEmail, savedPassword, true);
        
        if (!success && retryCount < MAX_RETRY_ATTEMPTS) {
          setRetryCount(prev => prev + 1);
        } else if (!success) {
          // Max retries reached
          setAutoRetrying(false);
          toast.error("Server is taking longer than expected. Please try again later.");
        }
      }, RETRY_DELAY_MS);
    }
    
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, [serverStarting, retryCount, performLogin]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setServerStarting(false);
    setRetryCount(0);

    // Get values from refs to handle autofill (Face ID, password managers)
    const emailValue = emailRef.current?.value || email;
    const passwordValue = passwordRef.current?.value || password;

    if (!emailValue || !passwordValue) {
      toast.error("Please enter email and password");
      setLoading(false);
      return;
    }

    await performLogin(emailValue, passwordValue);
    setLoading(false);
  };

  const handleManualRetry = async () => {
    if (pendingLoginRef.current) {
      setRetryCount(1);
      setAutoRetrying(true);
      const { email: savedEmail, password: savedPassword } = pendingLoginRef.current;
      const success = await performLogin(savedEmail, savedPassword, true);
      if (success) {
        setAutoRetrying(false);
      }
    }
  };

  const handleCancelRetry = () => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
    }
    setServerStarting(false);
    setRetryCount(0);
    setAutoRetrying(false);
    pendingLoginRef.current = null;
  };

  return (
    <div className="login-page-container">
      {/* Mobile Video Background - positioned at container level */}
      <video 
        src={BACKGROUND_VIDEO}
        autoPlay
        loop
        muted
        playsInline
        poster="/logo.png"
        className="login-mobile-video"
        style={{ backgroundColor: '#1e3a5f' }}
      />
      
      {/* Left side - Background Video with Overlay */}
      <div className="login-image-section">
        <video 
          src={BACKGROUND_VIDEO}
          autoPlay
          loop
          muted
          playsInline
          className="login-bg-video"
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
            <h2><span style={{whiteSpace: 'nowrap'}}>Asset Management Intelligence</span><br/>Platform</h2>
            <p>Unify asset, reliability, and workforce management in one intelligent platform. Turn data into action with AI-driven insights that reduce downtime and improve operational efficiency.</p>
          </div>
          <div className="login-features">
            <div className="login-feature">
              <Shield className="w-5 h-5" />
              <span>Asset Management</span>
            </div>
            <div className="login-feature">
              <Activity className="w-5 h-5" />
              <span>Reliability Management</span>
            </div>
            <div className="login-feature">
              <BarChart3 className="w-5 h-5" />
              <span>Workforce Management</span>
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

          {/* Server Starting Overlay */}
          {serverStarting && (
            <div className="server-starting-overlay" data-testid="server-starting-overlay">
              <div className="server-starting-content">
                <div className="server-starting-icon">
                  <Server className="w-8 h-8 text-blue-600" />
                  <div className="server-starting-pulse" />
                </div>
                <h2 className="text-xl font-semibold text-slate-900 mt-4">
                  Server Starting Up
                </h2>
                <p className="text-sm text-slate-500 mt-2 text-center max-w-xs">
                  Please wait while we connect to the server. This usually takes a few seconds.
                </p>
                
                {/* Progress indicator */}
                <div className="server-starting-progress mt-4">
                  <div className="progress-bar">
                    <div 
                      className="progress-fill"
                      style={{ width: `${(retryCount / MAX_RETRY_ATTEMPTS) * 100}%` }}
                    />
                  </div>
                  <p className="text-xs text-slate-400 mt-2">
                    {autoRetrying ? (
                      <>
                        <RefreshCw className="w-3 h-3 inline mr-1 animate-spin" />
                        Connecting... Attempt {retryCount} of {MAX_RETRY_ATTEMPTS}
                      </>
                    ) : (
                      "Connection paused"
                    )}
                  </p>
                </div>

                {/* Action buttons */}
                <div className="flex gap-3 mt-5">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCancelRetry}
                    className="text-slate-600"
                  >
                    Cancel
                  </Button>
                  {!autoRetrying && (
                    <Button
                      size="sm"
                      onClick={handleManualRetry}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                      Retry Now
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}

          <h1 className="auth-title" data-testid="login-title">{t("auth.loginTitle")}</h1>
          <p className="auth-subtitle">{t("auth.loginSubtitle")}</p>

          <form onSubmit={handleSubmit} className="space-y-5" data-testid="login-form">
            <div className="space-y-2">
              <Label htmlFor="email">{t("auth.email")}</Label>
              <Input
                ref={emailRef}
                id="email"
                name="email"
                type="email"
                autoComplete="email"
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
                ref={passwordRef}
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
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
        
        {/* Version Number - Bottom Right */}
        <div className="login-version">
          Version 3.6.1
        </div>
      </div>

      <style>{`
        .login-page-container {
          display: flex;
          min-height: 100vh;
          min-height: 100dvh;
        }

        /* Left Video Section */
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

        .login-bg-video {
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

        /* Mobile video background - hidden on desktop, visible on mobile */
        .login-mobile-video {
          display: none;
        }

        @media (max-width: 1023px) {
          .login-page-container {
            position: relative;
            overflow: hidden;
          }

          .login-mobile-video {
            display: block;
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            object-fit: cover;
            z-index: 0;
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
            z-index: 1;
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

        /* Server Starting Overlay Styles */
        .server-starting-overlay {
          position: absolute;
          inset: 0;
          background: rgba(255, 255, 255, 0.98);
          backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 50;
          border-radius: 20px;
        }

        .server-starting-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 24px;
        }

        .server-starting-icon {
          position: relative;
          width: 64px;
          height: 64px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
          border-radius: 16px;
        }

        .server-starting-pulse {
          position: absolute;
          inset: -4px;
          border-radius: 20px;
          border: 2px solid #3b82f6;
          animation: pulse-ring 1.5s ease-out infinite;
        }

        @keyframes pulse-ring {
          0% {
            transform: scale(1);
            opacity: 0.8;
          }
          100% {
            transform: scale(1.2);
            opacity: 0;
          }
        }

        .server-starting-progress {
          width: 100%;
          max-width: 200px;
        }

        .progress-bar {
          height: 4px;
          background: #e2e8f0;
          border-radius: 2px;
          overflow: hidden;
        }

        .progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #3b82f6, #60a5fa);
          border-radius: 2px;
          transition: width 0.5s ease-out;
        }

        .login-form-wrapper {
          position: relative;
        }

        /* Version display - bottom right */
        .login-version {
          position: absolute;
          bottom: 16px;
          right: 24px;
          font-size: 11px;
          color: #94a3b8;
          font-weight: 500;
        }

        @media (max-width: 1023px) {
          .login-version {
            color: rgba(255, 255, 255, 0.6);
          }
        }
      `}</style>
    </div>
  );
};

export default LoginPage;
