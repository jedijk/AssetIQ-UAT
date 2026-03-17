import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Loader2 } from "lucide-react";

const RegisterPage = () => {
  const { register } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    
    setLoading(true);

    try {
      await register(name, email, password);
      toast.success("Account created successfully!");
    } catch (error) {
      const message = error.response?.data?.detail || "Registration failed. Please try again.";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card animate-fade-in">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-8">
          <img 
            src="/app-icon.png" 
            alt="ThreatBase" 
            className="w-10 h-10 rounded-lg"
          />
          <span className="text-2xl font-bold text-slate-900" data-testid="register-logo">
            ThreatBase
          </span>
        </div>

        <h1 className="auth-title" data-testid="register-title">Create account</h1>
        <p className="auth-subtitle">Start capturing and prioritizing threats</p>

        <form onSubmit={handleSubmit} className="space-y-5" data-testid="register-form">
          <div className="space-y-2">
            <Label htmlFor="name">Full Name</Label>
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
            <Label htmlFor="email">Email</Label>
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
            <Label htmlFor="password">Password</Label>
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
                Creating account...
              </>
            ) : (
              "Create account"
            )}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          Already have an account?{" "}
          <Link 
            to="/login" 
            className="text-blue-600 font-medium hover:underline"
            data-testid="login-link"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
};

export default RegisterPage;
