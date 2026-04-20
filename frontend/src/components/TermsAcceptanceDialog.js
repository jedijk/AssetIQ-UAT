import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { 
  Shield, 
  FileText, 
  Check, 
  X, 
  Lock,
  Eye,
  Trash2,
  Download,
  Loader2,
  ScrollText
} from "lucide-react";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "./ui/accordion";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "./ui/tabs";
import { gdprAPI } from "../lib/api";

/**
 * First-time login consent dialog for GDPR compliance.
 * Shows Terms of Service and Privacy Policy, requires user acceptance.
 * 
 * Order of dialogs:
 * 1. Password Change (if must_change_password)
 * 2. Terms/Privacy Acceptance (this dialog)
 * 3. Intro Tour (if !has_seen_intro)
 */
export default function TermsAcceptanceDialog({ 
  open, 
  onAccept, 
  onDecline,
  isLoading = false 
}) {
  const [hasReadTerms, setHasReadTerms] = useState(false);
  const [hasReadPrivacy, setHasReadPrivacy] = useState(false);
  const [activeTab, setActiveTab] = useState("summary");

  // Fetch Terms of Service
  const { data: termsData, isLoading: termsLoading } = useQuery({
    queryKey: ["terms-of-service"],
    queryFn: gdprAPI.getTermsOfService,
    enabled: open,
  });

  // Fetch Privacy Policy
  const { data: privacyData, isLoading: privacyLoading } = useQuery({
    queryKey: ["privacy-policy"],
    queryFn: gdprAPI.getPrivacyPolicy,
    enabled: open,
  });

  const canAccept = hasReadTerms && hasReadPrivacy;

  const handleAccept = () => {
    if (canAccept) {
      onAccept();
    }
  };

  const renderSection = (section, index) => (
    <AccordionItem key={index} value={`section-${index}`} className="border-b last:border-b-0">
      <AccordionTrigger className="text-left text-sm hover:no-underline py-3">
        {section.title}
      </AccordionTrigger>
      <AccordionContent className="text-sm text-slate-600 pb-3">
        <p className="mb-2">{section.content}</p>
        {section.items && (
          <ul className="list-disc list-inside space-y-1 text-slate-500 ml-2">
            {section.items.map((item, i) => (
              <li key={i} className="text-xs">{item}</li>
            ))}
          </ul>
        )}
      </AccordionContent>
    </AccordionItem>
  );

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="w-[calc(100vw-1rem)] sm:w-[calc(100vw-2rem)] max-w-3xl max-h-[95dvh] sm:max-h-[90vh] p-0 gap-0 flex flex-col overflow-hidden rounded-xl"
        data-testid="terms-acceptance-dialog"
      >
        <DialogHeader className="px-4 sm:px-6 pt-5 pb-3 flex-shrink-0 border-b">
          <div className="flex items-center gap-3 text-left">
            <div className="p-2 bg-blue-100 rounded-lg flex-shrink-0">
              <Shield className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-base sm:text-xl truncate">Welcome to AssetIQ</DialogTitle>
              <DialogDescription className="text-xs sm:text-sm">
                Please review and accept our terms to continue
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex-1 flex flex-col min-h-0 px-4 sm:px-6 pt-3">
          <TabsList className="grid w-full grid-cols-3 h-auto flex-shrink-0">
            <TabsTrigger value="summary" className="text-[11px] sm:text-sm px-1.5 py-1.5 sm:py-2 gap-1" data-testid="terms-tab-summary">
              <Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span>Summary</span>
            </TabsTrigger>
            <TabsTrigger value="terms" className="text-[11px] sm:text-sm px-1.5 py-1.5 sm:py-2 gap-1" data-testid="terms-tab-terms">
              <ScrollText className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="truncate">Terms</span>
            </TabsTrigger>
            <TabsTrigger value="privacy" className="text-[11px] sm:text-sm px-1.5 py-1.5 sm:py-2 gap-1" data-testid="terms-tab-privacy">
              <Shield className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="truncate">Privacy</span>
            </TabsTrigger>
          </TabsList>

          {/* Summary Tab */}
          <TabsContent value="summary" className="mt-3 flex-1 min-h-0 overflow-y-auto pr-1 data-[state=inactive]:hidden">
            <div className="space-y-3 sm:space-y-4 pb-2">
                {/* GDPR Rights Summary */}
                <div className="p-3 sm:p-4 bg-blue-50 rounded-lg border border-blue-100">
                  <h3 className="font-semibold text-blue-900 mb-2 sm:mb-3 flex items-center gap-2 text-sm sm:text-base">
                    <FileText className="w-4 h-4" />
                    Your Data Rights (GDPR)
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 text-sm">
                    <div className="flex items-start gap-2">
                      <Eye className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <span className="font-medium">Access</span>
                        <p className="text-slate-600 text-xs">Request your data anytime</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <Download className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <span className="font-medium">Portability</span>
                        <p className="text-slate-600 text-xs">Export in JSON format</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <Trash2 className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <span className="font-medium">Erasure</span>
                        <p className="text-slate-600 text-xs">Delete your account</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <Lock className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <span className="font-medium">Control</span>
                        <p className="text-slate-600 text-xs">Manage consent settings</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Key Terms Summary */}
                <div className="p-3 sm:p-4 bg-slate-50 rounded-lg border border-slate-200">
                  <h3 className="font-semibold text-slate-900 mb-2 sm:mb-3 flex items-center gap-2 text-sm sm:text-base">
                    <ScrollText className="w-4 h-4" />
                    Key Terms Summary
                  </h3>
                  <ul className="space-y-1.5 sm:space-y-2 text-xs sm:text-sm text-slate-600">
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                      <span>You retain ownership of all data you input into AssetIQ</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                      <span>We use industry-standard encryption to protect your data</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                      <span>You can export or delete your data at any time</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                      <span>Account deletion requires owner approval for compliance</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                      <span>AI features process data per our privacy policy</span>
                    </li>
                  </ul>
                </div>

                {/* Data Collection Summary */}
                <div className="p-3 sm:p-4 bg-amber-50 rounded-lg border border-amber-200">
                  <h3 className="font-semibold text-amber-900 mb-2 sm:mb-3 flex items-center gap-2 text-sm sm:text-base">
                    <Shield className="w-4 h-4" />
                    Data We Collect
                  </h3>
                  <ul className="space-y-1 text-xs sm:text-sm text-amber-800">
                    <li>• Account info (name, email, position)</li>
                    <li>• Activity data (submissions, observations, actions)</li>
                    <li>• Technical data (login times, security logs)</li>
                  </ul>
                </div>
            </div>
          </TabsContent>

          {/* Terms of Service Tab */}
          <TabsContent value="terms" className="mt-3 flex-1 min-h-0 overflow-y-auto pr-1 data-[state=inactive]:hidden">
              {termsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                </div>
              ) : (
                <div className="space-y-2 pb-2">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-3 sm:mb-4">
                    <h3 className="font-semibold text-slate-900 text-sm sm:text-base">{termsData?.title}</h3>
                    <span className="text-[10px] sm:text-xs text-slate-500">
                      v{termsData?.version} • Updated {termsData?.last_updated}
                    </span>
                  </div>
                  <Accordion type="single" collapsible className="w-full">
                    {termsData?.sections?.map((section, index) => renderSection(section, index))}
                  </Accordion>
                </div>
              )}
          </TabsContent>

          {/* Privacy Policy Tab */}
          <TabsContent value="privacy" className="mt-3 flex-1 min-h-0 overflow-y-auto pr-1 data-[state=inactive]:hidden">
              {privacyLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                </div>
              ) : (
                <div className="space-y-2 pb-2">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-3 sm:mb-4">
                    <h3 className="font-semibold text-slate-900 text-sm sm:text-base">{privacyData?.title}</h3>
                    <span className="text-[10px] sm:text-xs text-slate-500">
                      v{privacyData?.version} • Updated {privacyData?.last_updated}
                    </span>
                  </div>
                  <Accordion type="single" collapsible className="w-full">
                    {privacyData?.sections?.map((section, index) => renderSection(section, index))}
                  </Accordion>
                </div>
              )}
          </TabsContent>
        </Tabs>

        {/* Consent Checkboxes + Footer (sticky bottom, never scrolls away on mobile) */}
        <div className="flex-shrink-0 border-t bg-slate-50 px-4 sm:px-6 pt-3 pb-3 sm:pb-4 space-y-2">
          <div className="flex items-center gap-2.5">
            <Checkbox
              id="terms"
              checked={hasReadTerms}
              onCheckedChange={setHasReadTerms}
              className="flex-shrink-0"
              data-testid="accept-terms-checkbox"
            />
            <label htmlFor="terms" className="text-[11px] sm:text-sm cursor-pointer leading-snug select-none">
              I agree to the <strong>Terms of Service</strong>
            </label>
          </div>

          <div className="flex items-center gap-2.5">
            <Checkbox
              id="privacy"
              checked={hasReadPrivacy}
              onCheckedChange={setHasReadPrivacy}
              className="flex-shrink-0"
              data-testid="accept-privacy-checkbox"
            />
            <label htmlFor="privacy" className="text-[11px] sm:text-sm cursor-pointer leading-snug select-none">
              I agree to the <strong>Privacy Policy</strong> and data processing terms
            </label>
          </div>

          <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end pt-2 sm:pt-1">
            <Button
              variant="outline"
              onClick={onDecline}
              disabled={isLoading}
              size="sm"
              className="w-full sm:w-auto sm:size-default"
              data-testid="decline-terms-btn"
            >
              <X className="w-4 h-4 mr-2" />
              Decline & Logout
            </Button>
            <Button
              onClick={handleAccept}
              disabled={!canAccept || isLoading}
              size="sm"
              className="w-full sm:w-auto sm:size-default bg-blue-600 hover:bg-blue-700"
              data-testid="accept-terms-btn"
            >
              <Check className="w-4 h-4 mr-2" />
              {isLoading ? "Processing..." : "Accept & Continue"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
