import React, { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";
import ChangePasswordDialog from "./ChangePasswordDialog";
import TermsAcceptanceDialog from "./TermsAcceptanceDialog";

/**
 * Wrapper component that handles the first-login flow dialogs in order:
 * 1. Password Change (if must_change_password)
 * 2. Terms/Privacy Acceptance (if terms not accepted)
 * 3. Then app loads normally (intro tour handled by Layout)
 */
export default function FirstLoginFlow({ children }) {
  const { 
    user, 
    mustChangePassword, 
    mustAcceptTerms, 
    acceptTerms, 
    logout 
  } = useAuth();
  
  const [isAcceptingTerms, setIsAcceptingTerms] = useState(false);

  const handleAcceptTerms = async () => {
    setIsAcceptingTerms(true);
    try {
      await acceptTerms();
      toast.success("Welcome to AssetIQ!");
    } catch (error) {
      console.error("Failed to accept terms:", error);
      toast.error("Failed to save your preferences. Please try again.");
    } finally {
      setIsAcceptingTerms(false);
    }
  };

  const handleDeclineTerms = () => {
    toast.info("You must accept the terms to use AssetIQ.");
    logout();
  };

  // Show password change dialog first (handled by ChangePasswordDialog component)
  // Then show terms acceptance if needed (only when password change is done)
  const showTermsDialog = mustAcceptTerms && !mustChangePassword;

  return (
    <>
      {/* Password change dialog - shows automatically when mustChangePassword is true */}
      <ChangePasswordDialog />
      
      {/* Terms acceptance dialog - shows after password change is done */}
      <TermsAcceptanceDialog
        open={showTermsDialog}
        onAccept={handleAcceptTerms}
        onDecline={handleDeclineTerms}
        isLoading={isAcceptingTerms}
      />
      
      {/* Only render children (app content) when all first-login flows are complete */}
      {children}
    </>
  );
}
