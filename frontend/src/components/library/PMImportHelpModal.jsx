import React from "react";
import {
  HelpCircle, ChevronRight, FileSpreadsheet, FileText, Image,
  Languages, Tag as TagIcon, Clock, Wrench, CheckCircle, Database,
} from "lucide-react";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Badge } from "../ui/badge";
import { ScrollArea } from "../ui/scroll-area";

export const PMImportHelpModal = ({ isOpen, onClose }) => {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-blue-600" />
            How PM Import Works
          </DialogTitle>
        </DialogHeader>
        
        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-8 pb-6">
            
            {/* What it does */}
            <section>
              <h3 className="text-lg font-semibold text-slate-900 mb-3">What It Does</h3>
              <p className="text-slate-600 mb-3">
                You upload an unstructured maintenance plan (Excel, PDF, CSV, or scanned image).
                AssetIQ turns it into a clean, editable list of standardized maintenance tasks
                that are linked to your <strong>Equipment Hierarchy</strong>.
              </p>
              <p className="text-slate-600">
                Once you review and accept the tasks, they're written to the
                <strong> PM Task Library</strong> — ready to be picked up by the Maintenance Program,
                Scheduler, or other downstream modules.
              </p>
              <div className="mt-3 p-3 bg-amber-50 rounded-lg border border-amber-100 text-sm text-amber-800">
                PM Import does <strong>not</strong> create failure modes, FMEAs, or maintenance
                strategies. Its only job is to import, enrich and match maintenance tasks.
              </div>
            </section>

            {/* The pipeline */}
            <section>
              <h3 className="text-lg font-semibold text-slate-900 mb-4">The Pipeline (6 stages)</h3>

              {/* 1 */}
              <Step n={1} icon={<FileSpreadsheet className="w-5 h-5 text-blue-600" />} title="Upload File">
                Click <strong>Import PM Plan</strong>, then drag &amp; drop or browse for the file.
                <div className="flex items-center gap-3 mt-3 text-sm">
                  <span className="text-slate-500">Supported:</span>
                  <span className="inline-flex items-center gap-1"><FileSpreadsheet className="w-4 h-4 text-green-600" /> Excel</span>
                  <span className="inline-flex items-center gap-1"><FileText className="w-4 h-4 text-red-500" /> PDF</span>
                  <span className="inline-flex items-center gap-1"><Image className="w-4 h-4 text-purple-500" /> Images / CSV</span>
                </div>
              </Step>

              {/* 2 */}
              <Step n={2} icon={<Database className="w-5 h-5 text-blue-600" />} title="Extract Tasks">
                AssetIQ parses the file row-by-row (or page-by-page for PDFs) and produces a raw
                list of candidate maintenance tasks with their source component, asset and raw frequency.
              </Step>

              {/* 3 */}
              <Step n={3} icon={<Languages className="w-5 h-5 text-blue-600" />} title="AI Enrichment">
                Each task is sent through your OpenAI key (GPT-4o) which fills in:
                <ul className="mt-2 space-y-1 text-sm text-slate-600">
                  <li className="flex items-start gap-2"><ChevronRight className="w-4 h-4 text-blue-500 mt-0.5" /> Translate the task description to clear English</li>
                  <li className="flex items-start gap-2"><ChevronRight className="w-4 h-4 text-blue-500 mt-0.5" /> Classify task type: <Badge variant="outline" className="text-xs mx-1">PM</Badge> <Badge variant="outline" className="text-xs mx-1">PDM</Badge> <Badge variant="outline" className="text-xs mx-1">CBM</Badge> <Badge variant="outline" className="text-xs mx-1">CM</Badge></li>
                  <li className="flex items-start gap-2"><ChevronRight className="w-4 h-4 text-blue-500 mt-0.5" /> Suggest a discipline (Mechanical, Electrical, Instrumentation, Process, Civil, Operations, HVAC)</li>
                  <li className="flex items-start gap-2"><ChevronRight className="w-4 h-4 text-blue-500 mt-0.5" /> Standardize frequency (Daily &middot; Weekly &middot; Monthly &middot; Quarterly &middot; …) + days</li>
                  <li className="flex items-start gap-2"><ChevronRight className="w-4 h-4 text-blue-500 mt-0.5" /> Estimate labor hours</li>
                  <li className="flex items-start gap-2"><ChevronRight className="w-4 h-4 text-blue-500 mt-0.5" /> Confidence score (0–100)</li>
                </ul>
              </Step>

              {/* 4 */}
              <Step n={4} icon={<TagIcon className="w-5 h-5 text-blue-600" />} title="Equipment Matching">
                Each task is matched to your equipment hierarchy in priority order:
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-100">
                    <div className="font-semibold text-emerald-800 mb-1">Priority 1 — Tag exact</div>
                    <p className="text-emerald-700">Extract tag tokens like <code className="bg-white px-1 rounded">P-1001</code> or <code className="bg-white px-1 rounded">1F-3001-0123</code> and look them up in <code className="bg-white px-1 rounded">equipment_nodes.tag</code>.</p>
                  </div>
                  <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
                    <div className="font-semibold text-blue-800 mb-1">Priority 2 — Description fuzzy</div>
                    <p className="text-blue-700">If no tag matches, fuzzy-match the equipment description against <code className="bg-white px-1 rounded">equipment_nodes.name</code> with a confidence score.</p>
                  </div>
                </div>
                <p className="mt-3 text-sm text-slate-500">If neither matches, the row shows an amber <strong>Unmatched</strong> chip — click it to pick the right node manually.</p>
              </Step>

              {/* 5 */}
              <Step n={5} icon={<Wrench className="w-5 h-5 text-blue-600" />} title="Review &amp; Edit">
                Every field is editable before import:
                <ul className="mt-2 grid grid-cols-2 gap-1 text-sm text-slate-600">
                  <li>&bull; Equipment Tag</li>
                  <li>&bull; Equipment Description</li>
                  <li>&bull; Task Description</li>
                  <li>&bull; Task Type (PM / PDM / CBM / CM)</li>
                  <li>&bull; Discipline</li>
                  <li>&bull; Frequency</li>
                  <li>&bull; Estimated Hours</li>
                  <li>&bull; Equipment Match</li>
                </ul>
                <p className="mt-2 text-sm text-slate-500">Use the row actions to Accept ✓, Reject ✗, Edit ✎ or Delete 🗑.</p>
              </Step>

              {/* 6 */}
              <Step n={6} icon={<CheckCircle className="w-5 h-5 text-green-600" />} title="Import" last>
                Click <strong>Import</strong> to promote every <Badge variant="outline" className="text-xs mx-1 bg-green-50 text-green-700 border-green-200">accepted</Badge> task into the
                <code className="bg-slate-100 px-1.5 py-0.5 rounded ml-1">pm_tasks</code> collection (the PM Task Library).
                Rejected and pending tasks stay in the session for future review.
              </Step>
            </section>

            {/* Example */}
            <section>
              <h3 className="text-lg font-semibold text-slate-900 mb-3">Example</h3>
              <div className="bg-slate-50 rounded-lg p-4 border space-y-3">
                <div>
                  <p className="text-xs text-slate-500 mb-1">Raw row in your Excel:</p>
                  <p className="font-mono text-sm bg-white p-2 rounded border">
                    <code>Brabender · Line-90 · Controleer lagers op slijtage maandelijks</code>
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">After enrichment + matching:</p>
                  <div className="grid grid-cols-2 gap-2 text-sm bg-white p-3 rounded border">
                    <div><span className="text-slate-500">Equipment Tag:</span> <strong>Line-90</strong></div>
                    <div><span className="text-slate-500">Equipment Match:</span> <strong>1T-2001 Brabender</strong> <Badge variant="outline" className="ml-1 text-xs bg-emerald-50 text-emerald-700">90%</Badge></div>
                    <div><span className="text-slate-500">Task Description:</span> <strong>Check bearings for wear monthly</strong></div>
                    <div><span className="text-slate-500">Task Type:</span> <Badge variant="outline" className="text-xs bg-green-50 text-green-700">PM</Badge></div>
                    <div><span className="text-slate-500">Discipline:</span> <strong>Mechanical</strong></div>
                    <div><span className="text-slate-500">Frequency:</span> <strong>Monthly</strong> (30 d)</div>
                    <div className="flex items-center gap-1"><Clock className="w-4 h-4 text-slate-400" /><span className="text-slate-500">Estimated:</span> <strong>1.0 h</strong></div>
                    <div><span className="text-slate-500">Confidence:</span> <strong className="text-green-600">95%</strong></div>
                  </div>
                </div>
              </div>
            </section>

            {/* Why */}
            <section className="bg-blue-50 rounded-xl p-6 border border-blue-100">
              <h3 className="text-lg font-semibold text-blue-900 mb-3">Why This Matters</h3>
              <p className="text-blue-800 mb-3">
                Your scattered maintenance plans become a single, structured task library — translated,
                classified, time-estimated, and tied to real equipment.
              </p>
              <p className="text-blue-700">
                From there, the Maintenance Program, Scheduler, and Inspection-Sheet modules can pull
                tasks directly — without any manual data cleanup.
              </p>
            </section>

          </div>
        </ScrollArea>
        
        <div className="pt-4 border-t flex justify-end">
          <Button onClick={onClose}>Got it</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const Step = ({ n, icon, title, children, last }) => (
  <div className={last ? "" : "mb-6"}>
    <div className="flex items-center gap-3 mb-3">
      <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-semibold">
        {n}
      </div>
      <div className="flex items-center gap-2">
        {icon}
        <h4 className="font-semibold text-slate-800">{title}</h4>
      </div>
    </div>
    <div className="ml-11 text-slate-600">{children}</div>
  </div>
);

export const PMImportHelpButton = ({ onClick }) => {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-blue-600 transition-colors"
    >
      <HelpCircle className="w-4 h-4" />
      <span>How does this work?</span>
    </button>
  );
};

export default PMImportHelpModal;
