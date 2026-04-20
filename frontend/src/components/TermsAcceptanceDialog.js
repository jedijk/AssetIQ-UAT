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
import { ScrollArea } from "./ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden" data-testid="terms-acceptance-dialog">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Shield className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <DialogTitle className="text-xl">Welcome to AssetIQ</DialogTitle>
              <DialogDescription>
                Please review and accept our terms to continue
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="summary" className="text-xs sm:text-sm">
              <Eye className="w-4 h-4 mr-1 hidden sm:inline" />
              Summary
            </TabsTrigger>
            <TabsTrigger value="terms" className="text-xs sm:text-sm">
              <ScrollText className="w-4 h-4 mr-1 hidden sm:inline" />
              Terms of Service
            </TabsTrigger>
            <TabsTrigger value="privacy" className="text-xs sm:text-sm">
              <Shield className="w-4 h-4 mr-1 hidden sm:inline" />
              Privacy Policy
            </TabsTrigger>
          </TabsList>

          {/* Summary Tab */}
          <TabsContent value="summary" className="mt-4">
            <ScrollArea className="h-[40vh] pr-4">
              <div className="space-y-4">
                {/* GDPR Rights Summary */}
                <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
                  <h3 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Your Data Rights (GDPR)
                  </h3>
                  <div className="grid grid-cols-2 gap-3 text-sm">
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
                <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                  <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                    <ScrollText className="w-4 h-4" />
                    Key Terms Summary
                  </h3>
                  <ul className="space-y-2 text-sm text-slate-600">
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
                <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
                  <h3 className="font-semibold text-amber-900 mb-3 flex items-center gap-2">
                    <Shield className="w-4 h-4" />
                    Data We Collect
                  </h3>
                  <ul className="space-y-1 text-sm text-amber-800">
                    <li>• Account info (name, email, position)</li>
                    <li>• Activity data (submissions, observations, actions)</li>
                    <li>• Technical data (login times, security logs)</li>
                  </ul>
                </div>
              </div>
            </ScrollArea>
          </TabsContent>

          {/* Terms of Service Tab */}
          <TabsContent value="terms" className="mt-4">
            <ScrollArea className="h-[40vh] pr-4">
              {termsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-slate-900">{termsData?.title}</h3>
                    <span className="text-xs text-slate-500">
                      v{termsData?.version} • Updated {termsData?.last_updated}
                    </span>
                  </div>
                  <Accordion type="single" collapsible className="w-full">
                    {termsData?.sections?.map((section, index) => renderSection(section, index))}
                  </Accordion>
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          {/* Privacy Policy Tab */}
          <TabsContent value="privacy" className="mt-4">
            <ScrollArea className="h-[40vh] pr-4">
              {privacyLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-slate-900">{privacyData?.title}</h3>
                    <span className="text-xs text-slate-500">
                      v{privacyData?.version} • Updated {privacyData?.last_updated}
                    </span>
                  </div>
                  <Accordion type="single" collapsible className="w-full">
                    {privacyData?.sections?.map((section, index) => renderSection(section, index))}
                  </Accordion>
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>

        {/* Consent Checkboxes */}
        <div className="space-y-3 pt-4 border-t">
          <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
            <Checkbox 
              id="terms" 
              checked={hasReadTerms}
              onCheckedChange={setHasReadTerms}
              data-testid="accept-terms-checkbox"
            />
            <label htmlFor="terms" className="text-sm cursor-pointer">
              I have read and agree to the <strong>Terms of Service</strong>
            </label>
          </div>
          
          <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
            <Checkbox 
              id="privacy" 
              checked={hasReadPrivacy}
              onCheckedChange={setHasReadPrivacy}
              data-testid="accept-privacy-checkbox"
            />
            <label htmlFor="privacy" className="text-sm cursor-pointer">
              I have read and agree to the <strong>Privacy Policy</strong> and understand how my data will be processed
            </label>
          </div>
        </div>

        {/* Info Note */}
        <p className="text-xs text-slate-500">
          You can review these documents anytime in Settings → Privacy & Data.
        </p>

        <DialogFooter className="flex gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={onDecline}
            disabled={isLoading}
            data-testid="decline-terms-btn"
          >
            <X className="w-4 h-4 mr-2" />
            Decline & Logout
          </Button>
          <Button
            onClick={handleAccept}
            disabled={!canAccept || isLoading}
            className="bg-blue-600 hover:bg-blue-700"
            data-testid="accept-terms-btn"
          >
            <Check className="w-4 h-4 mr-2" />
            {isLoading ? "Processing..." : "Accept & Continue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
