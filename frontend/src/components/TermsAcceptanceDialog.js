import React, { useState } from "react";
import { 
  Shield, 
  FileText, 
  Check, 
  X, 
  ChevronDown, 
  ChevronUp,
  Lock,
  Eye,
  Trash2,
  Download,
  ExternalLink
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

/**
 * First-time login consent dialog for GDPR compliance.
 * Shows privacy policy summary and requires user acceptance.
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
  const [expandedSection, setExpandedSection] = useState(null);

  const canAccept = hasReadTerms && hasReadPrivacy;

  const handleAccept = () => {
    if (canAccept) {
      onAccept();
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden" data-testid="terms-acceptance-dialog">
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

        <ScrollArea className="max-h-[50vh] pr-4">
          <div className="space-y-4 py-4">
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

            {/* Terms of Service Summary */}
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="terms" className="border rounded-lg px-4">
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-slate-600" />
                    <span>Terms of Service</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="text-sm text-slate-600 space-y-2 pb-2">
                    <p><strong>1. Acceptance:</strong> By using AssetIQ, you agree to these terms.</p>
                    <p><strong>2. Account:</strong> You are responsible for maintaining the security of your account credentials.</p>
                    <p><strong>3. Usage:</strong> Use the platform only for its intended industrial asset management purposes.</p>
                    <p><strong>4. Data:</strong> You retain ownership of data you input. We process it to provide services.</p>
                    <p><strong>5. Availability:</strong> We strive for 99.9% uptime but cannot guarantee uninterrupted service.</p>
                    <p><strong>6. Updates:</strong> Terms may be updated. Continued use implies acceptance of changes.</p>
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="privacy" className="border rounded-lg px-4 mt-2">
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-slate-600" />
                    <span>Privacy Policy</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="text-sm text-slate-600 space-y-2 pb-2">
                    <p><strong>Data We Collect:</strong></p>
                    <ul className="list-disc list-inside ml-2 space-y-1">
                      <li>Account info (name, email, phone)</li>
                      <li>Activity data (submissions, observations, actions)</li>
                      <li>Technical data (login times, IP addresses for security)</li>
                    </ul>
                    <p className="mt-2"><strong>How We Use It:</strong></p>
                    <ul className="list-disc list-inside ml-2 space-y-1">
                      <li>Provide asset management services</li>
                      <li>Security monitoring and fraud prevention</li>
                      <li>Service improvement (with consent)</li>
                    </ul>
                    <p className="mt-2"><strong>Data Retention:</strong></p>
                    <ul className="list-disc list-inside ml-2 space-y-1">
                      <li>Account data: Until deletion or 2 years inactive</li>
                      <li>Audit logs: 5 years (compliance requirement)</li>
                    </ul>
                    <p className="mt-2"><strong>Your Rights:</strong> Access, export, delete your data via Settings → Privacy & Data</p>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            {/* Consent Checkboxes */}
            <div className="space-y-3 pt-2">
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
            <p className="text-xs text-slate-500 mt-2">
              You can review the full Privacy Policy and manage your data preferences anytime in Settings → Privacy & Data.
            </p>
          </div>
        </ScrollArea>

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
