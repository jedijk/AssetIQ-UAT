import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../contexts/AuthContext";
import { authAPI } from "../lib/apis/auth";

const OIDC_STATE_KEY = "oidc_state";

const OidcCallbackPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { loginWithSsoToken } = useAuth();
  const [error, setError] = useState(null);

  useEffect(() => {
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const storedState = sessionStorage.getItem(OIDC_STATE_KEY);

    if (!code) {
      setError("Missing authorization code");
      return;
    }

    if (storedState && state && storedState !== state) {
      setError("Invalid SSO state — please try again");
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const result = await authAPI.exchangeOidcCode(code, state);
        if (cancelled) return;

        sessionStorage.removeItem(OIDC_STATE_KEY);
        await loginWithSsoToken(result.token, result.user);
        toast.success("Signed in with SSO");
        navigate("/", { replace: true });
      } catch (err) {
        if (cancelled) return;
        const detail = err?.response?.data?.detail;
        const message =
          typeof detail === "string"
            ? detail
            : "SSO sign-in failed. Contact your administrator.";
        setError(message);
        toast.error(message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [searchParams, loginWithSsoToken, navigate]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="text-center max-w-md">
          <h1 className="text-lg font-semibold text-slate-900">SSO Sign-in Failed</h1>
          <p className="mt-2 text-sm text-slate-600">{error}</p>
          <button
            type="button"
            onClick={() => navigate("/login", { replace: true })}
            className="mt-4 text-sm text-blue-600 hover:underline"
          >
            Return to login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center bg-slate-50"
      data-testid="oidc-callback-page"
    >
      <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      <p className="mt-3 text-sm text-slate-600">Completing SSO sign-in…</p>
    </div>
  );
};

export default OidcCallbackPage;
