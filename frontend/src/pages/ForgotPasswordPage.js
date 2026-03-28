import { useState } from "react";
import { Link } from "react-router-dom";
import { useLanguage } from "../contexts/LanguageContext";
import { authAPI } from "../lib/api";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Loader2, ArrowLeft, Mail, CheckCircle } from "lucide-react";

// Industrial background image
const BACKGROUND_IMAGE = "https://customer-assets.emergentagent.com/job_682831cd-c439-4614-becb-4ef9d40f147d/artifacts/a6gi0iug_27149310e1925cc6e07ada4653176e7f361ba5e96a825c22e1e22a3df59bf5a7.png";

const ForgotPasswordPage = () => {
  const { t } = useLanguage();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      await authAPI.forgotPassword(email);
      setEmailSent(true);
      toast.success("Reset link sent! Check your email.");
    } catch (error) {
      const message = error.response?.data?.detail || "Failed to send reset email. Please try again.";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="forgot-password-container">
      {/* Left side - Background Image with Overlay */}
      <div className="forgot-image-section">
        <img 
          src={BACKGROUND_IMAGE} 
          alt="Industrial Plant" 
          className="forgot-bg-image"
        />
        <div className="forgot-image-overlay" />
        <div className="forgot-image-content">
          <div className="forgot-brand">
            <img 
              src="/logo.png" 
              alt="AssetIQ" 
              className="w-14 h-14 rounded-xl shadow-lg"
            />
            <h1 className="forgot-brand-title">AssetIQ</h1>
          </div>
          <div className="forgot-tagline">
            <h2>Account Recovery</h2>
            <p>Don't worry, we'll help you get back into your account quickly and securely.</p>
          </div>
        </div>
      </div>

      {/* Right side - Form */}
      <div className="forgot-form-section">
        <div className="forgot-form-wrapper animate-fade-in">
          {/* Mobile Logo */}
          <div className="forgot-mobile-logo">
            <img 
              src="/logo.png" 
              alt="AssetIQ" 
              className="w-10 h-10 rounded-lg"
            />
            <span className="text-xl font-bold text-slate-900">AssetIQ</span>
          </div>

          {/* Back Link */}
          <Link 
            to="/login" 
            className="forgot-back-link"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to login</span>
          </Link>

          {!emailSent ? (
            <>
              <div className="forgot-icon-wrapper">
                <Mail className="w-8 h-8 text-blue-600" />
              </div>
              
              <h1 className="forgot-title" data-testid="forgot-password-title">
                {t("auth.forgotPassword") || "Forgot Password?"}
              </h1>
              <p className="forgot-subtitle">
                {t("auth.forgotPasswordSubtitle") || "Enter your email and we'll send you a link to reset your password."}
              </p>

              <form onSubmit={handleSubmit} className="space-y-5" data-testid="forgot-password-form">
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
                    data-testid="forgot-email-input"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-11 bg-blue-600 hover:bg-blue-700"
                  data-testid="forgot-submit-button"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    "Send Reset Link"
                  )}
                </Button>
              </form>
            </>
          ) : (
            <div className="email-sent-state">
              <div className="success-icon-wrapper">
                <CheckCircle className="w-12 h-12 text-green-500" />
              </div>
              <h1 className="forgot-title">Check Your Email</h1>
              <p className="forgot-subtitle">
                We've sent a password reset link to <strong>{email}</strong>. 
                Please check your inbox and spam folder.
              </p>
              <p className="text-sm text-slate-500 mt-4">
                Didn't receive the email?{" "}
                <button 
                  onClick={() => setEmailSent(false)}
                  className="text-blue-600 font-medium hover:underline"
                >
                  Try again
                </button>
              </p>
            </div>
          )}

          <p className="mt-6 text-center text-sm text-slate-500">
            Remember your password?{" "}
            <Link 
              to="/login" 
              className="text-blue-600 font-medium hover:underline"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>

      <style>{`
        .forgot-password-container {
          display: flex;
          min-height: 100vh;
          min-height: 100dvh;
        }

        /* Left Image Section */
        .forgot-image-section {
          display: none;
          position: relative;
          width: 55%;
          overflow: hidden;
        }

        @media (min-width: 1024px) {
          .forgot-image-section {
            display: block;
          }
        }

        .forgot-bg-image {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .forgot-image-overlay {
          position: absolute;
          inset: 0;
          background: linear-gradient(
            135deg,
            rgba(15, 23, 42, 0.85) 0%,
            rgba(30, 64, 175, 0.75) 50%,
            rgba(15, 23, 42, 0.9) 100%
          );
        }

        .forgot-image-content {
          position: relative;
          z-index: 10;
          height: 100%;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 48px;
          color: white;
        }

        .forgot-brand {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .forgot-brand-title {
          font-size: 28px;
          font-weight: 700;
          color: white;
          letter-spacing: -0.02em;
        }

        .forgot-tagline {
          max-width: 480px;
          margin-bottom: 48px;
        }

        .forgot-tagline h2 {
          font-size: 42px;
          font-weight: 700;
          line-height: 1.2;
          margin-bottom: 16px;
          letter-spacing: -0.02em;
        }

        .forgot-tagline p {
          font-size: 18px;
          color: rgba(255, 255, 255, 0.8);
          line-height: 1.6;
        }

        /* Right Form Section */
        .forgot-form-section {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          background: #f8fafc;
        }

        @media (min-width: 1024px) {
          .forgot-form-section {
            width: 45%;
            flex: none;
          }
        }

        .forgot-form-wrapper {
          width: 100%;
          max-width: 400px;
          background: white;
          padding: 40px;
          border-radius: 20px;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1);
          border: 1px solid #e2e8f0;
        }

        .forgot-mobile-logo {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 24px;
        }

        @media (min-width: 1024px) {
          .forgot-mobile-logo {
            display: none;
          }
        }

        .forgot-back-link {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          color: #64748b;
          font-size: 14px;
          font-weight: 500;
          margin-bottom: 24px;
          transition: color 0.2s;
        }

        .forgot-back-link:hover {
          color: #3b82f6;
        }

        .forgot-icon-wrapper {
          width: 56px;
          height: 56px;
          background: #eff6ff;
          border-radius: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 24px;
        }

        .forgot-title {
          font-size: 24px;
          font-weight: 700;
          color: #1e293b;
          margin-bottom: 8px;
        }

        .forgot-subtitle {
          font-size: 15px;
          color: #64748b;
          line-height: 1.6;
          margin-bottom: 24px;
        }

        .email-sent-state {
          text-align: center;
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

        /* Mobile full background */
        @media (max-width: 1023px) {
          .forgot-password-container {
            background-image: url('${BACKGROUND_IMAGE}');
            background-size: cover;
            background-position: center;
            position: relative;
          }

          .forgot-password-container::before {
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

          .forgot-form-section {
            position: relative;
            z-index: 10;
            background: transparent;
          }

          .forgot-form-wrapper {
            background: rgba(255, 255, 255, 0.97);
            backdrop-filter: blur(12px);
          }
        }
      `}</style>
    </div>
  );
};

export default ForgotPasswordPage;
