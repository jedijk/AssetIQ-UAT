import React, { useState } from "react";
import {
  HelpCircle, X, Upload, Brain, CheckCircle, Library, Sparkles, ChevronRight,
  FileSpreadsheet, FileText, Image, AlertTriangle, Link, Plus,
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
            How PM Plan Import Works
          </DialogTitle>
        </DialogHeader>
        
        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-8 pb-6">
            {/* What It Does */}
            <section>
              <h3 className="text-lg font-semibold text-slate-900 mb-3">What It Does</h3>
              <p className="text-slate-600 mb-4">
                You upload your existing maintenance plan (Excel, PDF, or scanned image), and AssetIQ 
                automatically extracts maintenance tasks and converts them into <strong>failure prevention intelligence</strong>.
              </p>
              <p className="text-slate-600 mb-3">
                Instead of simply importing maintenance tasks, AssetIQ helps identify:
              </p>
              <ul className="space-y-2 text-slate-600">
                <li className="flex items-start gap-2">
                  <ChevronRight className="w-4 h-4 text-blue-500 mt-1 flex-shrink-0" />
                  <span>What <strong>component</strong> the task applies to</span>
                </li>
                <li className="flex items-start gap-2">
                  <ChevronRight className="w-4 h-4 text-blue-500 mt-1 flex-shrink-0" />
                  <span>What <strong>type of maintenance</strong> it is</span>
                </li>
                <li className="flex items-start gap-2">
                  <ChevronRight className="w-4 h-4 text-blue-500 mt-1 flex-shrink-0" />
                  <span>What <strong>failure modes</strong> the task is intended to prevent</span>
                </li>
                <li className="flex items-start gap-2">
                  <ChevronRight className="w-4 h-4 text-blue-500 mt-1 flex-shrink-0" />
                  <span>How that task should <strong>link to your Failure Mode Library</strong></span>
                </li>
              </ul>
              <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-100">
                <p className="text-sm text-blue-800">
                  This creates a direct connection between maintenance activities and reliability logic.
                </p>
              </div>
            </section>

            {/* The Process */}
            <section>
              <h3 className="text-lg font-semibold text-slate-900 mb-4">The Process (4 Steps)</h3>
              
              {/* Step 1 */}
              <div className="mb-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-semibold">1</div>
                  <h4 className="font-semibold text-slate-800">Upload Your File</h4>
                </div>
                <div className="ml-11 space-y-2 text-slate-600">
                  <p>Click <strong>"Import PM Plan"</strong> on the Failure Modes page</p>
                  <p>Drag & drop or browse for your maintenance plan file</p>
                  <div className="flex items-center gap-4 mt-3 text-sm">
                    <span className="text-slate-500">Supported:</span>
                    <div className="flex items-center gap-1">
                      <FileSpreadsheet className="w-4 h-4 text-green-600" />
                      <span>Excel (.xlsx)</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <FileText className="w-4 h-4 text-red-500" />
                      <span>PDF</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Image className="w-4 h-4 text-purple-500" />
                      <span>Images</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 2 */}
              <div className="mb-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-semibold">2</div>
                  <h4 className="font-semibold text-slate-800">AI Analyzes Your Tasks</h4>
                </div>
                <div className="ml-11 text-slate-600">
                  <p className="mb-3">
                    The system reads your file and for each maintenance task (for example: <em>"Grease bearings weekly"</em>), 
                    the AI identifies:
                  </p>
                  <div className="bg-slate-50 rounded-lg p-4 border">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-slate-500">Component:</span>
                        <p className="font-medium">Bearing</p>
                      </div>
                      <div>
                        <span className="text-slate-500">Task Type:</span>
                        <p className="font-medium">Lubrication</p>
                      </div>
                      <div>
                        <span className="text-slate-500">Possible Failure Modes:</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          <Badge variant="outline" className="text-xs">Bearing wear</Badge>
                          <Badge variant="outline" className="text-xs">Seizure</Badge>
                          <Badge variant="outline" className="text-xs">Overheating</Badge>
                        </div>
                      </div>
                      <div>
                        <span className="text-slate-500">Detection Methods:</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          <Badge variant="outline" className="text-xs">Vibration</Badge>
                          <Badge variant="outline" className="text-xs">Temperature</Badge>
                          <Badge variant="outline" className="text-xs">Noise</Badge>
                        </div>
                      </div>
                      <div>
                        <span className="text-slate-500">Frequency:</span>
                        <p className="font-medium">Weekly</p>
                      </div>
                      <div>
                        <span className="text-slate-500">Confidence Score:</span>
                        <p className="font-medium text-green-600">87%</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 3 */}
              <div className="mb-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-semibold">3</div>
                  <h4 className="font-semibold text-slate-800">Review & Accept</h4>
                </div>
                <div className="ml-11 text-slate-600">
                  <p className="mb-3">You see all extracted tasks in a review table. Each task shows:</p>
                  <ul className="space-y-1 mb-4 text-sm">
                    <li>• Original PM task</li>
                    <li>• Suggested component</li>
                    <li>• Suggested failure mode mapping</li>
                    <li>• Confidence score</li>
                    <li>• Existing library match (if found)</li>
                  </ul>
                  <p className="mb-3">You can: <strong>Accept</strong>, <strong>Reject</strong>, or <strong>Edit</strong></p>
                  <div className="flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 rounded-full bg-green-500"></div>
                      <span>High confidence</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                      <span>Medium confidence</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 rounded-full bg-red-500"></div>
                      <span>Low confidence (review required)</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 4 */}
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-semibold">4</div>
                  <h4 className="font-semibold text-slate-800">Import to Failure Mode Library</h4>
                </div>
                <div className="ml-11 text-slate-600 space-y-4">
                  <p>When you click "Import", three things can happen:</p>
                  
                  {/* Option A */}
                  <div className="bg-green-50 rounded-lg p-4 border border-green-100">
                    <div className="flex items-center gap-2 mb-2">
                      <Link className="w-4 h-4 text-green-600" />
                      <span className="font-semibold text-green-800">A) Match found in existing library</span>
                    </div>
                    <p className="text-sm text-green-700 mb-2">
                      Example: Task <em>"Grease feed roller bearings weekly"</em>
                    </p>
                    <p className="text-sm text-green-700 mb-2">
                      AI finds: Failure mode <strong>"Bearing Lubrication Starvation"</strong>
                    </p>
                    <p className="text-sm text-green-800 font-medium">
                      → The PM task gets added as a <strong>Recommended Action / Preventive Control</strong> to that existing failure mode.
                    </p>
                  </div>

                  {/* Option B */}
                  <div className="bg-amber-50 rounded-lg p-4 border border-amber-100">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600" />
                      <span className="font-semibold text-amber-800">B) Similar failure mode found, user confirms mapping</span>
                    </div>
                    <p className="text-sm text-amber-700 mb-2">
                      AI suggests possible matches:
                    </p>
                    <div className="flex gap-2 mb-2">
                      <Badge variant="outline" className="text-xs bg-white">Bearing Wear</Badge>
                      <Badge variant="outline" className="text-xs bg-white">Lubrication Starvation</Badge>
                      <Badge variant="outline" className="text-xs bg-white">Bearing Overheating</Badge>
                    </div>
                    <p className="text-sm text-amber-800 font-medium">
                      → User selects the correct one. The PM task links to the selected existing failure mode.
                    </p>
                  </div>

                  {/* Option C */}
                  <div className="bg-purple-50 rounded-lg p-4 border border-purple-100">
                    <div className="flex items-center gap-2 mb-2">
                      <Plus className="w-4 h-4 text-purple-600" />
                      <span className="font-semibold text-purple-800">C) No reliable match found</span>
                    </div>
                    <p className="text-sm text-purple-700 mb-2">
                      AssetIQ does <strong>NOT</strong> automatically create failure modes blindly.
                    </p>
                    <p className="text-sm text-purple-700 mb-2">
                      Instead, AI proposes a <strong>new failure mode candidate</strong>. User reviews:
                    </p>
                    <ul className="text-sm text-purple-700 mb-2 space-y-1">
                      <li>• Failure mode name</li>
                      <li>• Component</li>
                      <li>• Prevention logic</li>
                      <li>• Confidence</li>
                    </ul>
                    <p className="text-sm text-purple-800 font-medium">
                      → Only after approval: A new failure mode gets created in the library.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* Simple Example */}
            <section>
              <h3 className="text-lg font-semibold text-slate-900 mb-3">Simple Example</h3>
              <div className="bg-slate-50 rounded-lg p-4 border">
                <p className="text-sm text-slate-500 mb-2">Your Excel has:</p>
                <p className="font-mono text-sm bg-white p-2 rounded border mb-4">"Grease feed roller bearings weekly"</p>
                
                <p className="text-sm text-slate-500 mb-2">AI converts it to:</p>
                <div className="grid grid-cols-2 gap-2 text-sm mb-4">
                  <div><span className="text-slate-500">Component:</span> <strong>Feed roller bearing</strong></div>
                  <div><span className="text-slate-500">Task Type:</span> <strong>Lubrication</strong></div>
                  <div><span className="text-slate-500">Frequency:</span> <strong>Weekly</strong></div>
                  <div><span className="text-slate-500">Confidence:</span> <strong className="text-green-600">87%</strong></div>
                </div>
                <div className="text-sm mb-2">
                  <span className="text-slate-500">Possible Failure Modes:</span>
                  <div className="flex gap-1 mt-1">
                    <Badge variant="outline" className="text-xs">Lubrication starvation</Badge>
                    <Badge variant="outline" className="text-xs">Bearing wear</Badge>
                    <Badge variant="outline" className="text-xs">Bearing seizure</Badge>
                  </div>
                </div>
                
                <div className="mt-4 pt-4 border-t">
                  <p className="text-sm text-slate-600 mb-2">
                    AssetIQ checks the library. If <strong>"Bearing Lubrication Starvation"</strong> already exists:
                  </p>
                  <div className="bg-green-100 rounded p-3 text-sm text-green-800">
                    <strong>Result:</strong> Add PM task as Recommended Preventive Action → 
                    <em>"Grease feed roller bearings weekly"</em>
                  </div>
                </div>
              </div>
            </section>

            {/* Why This Matters */}
            <section>
              <h3 className="text-lg font-semibold text-slate-900 mb-3">Why This Matters</h3>
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="bg-slate-100 rounded-lg p-3">
                    <p className="text-slate-500 font-medium mb-1">Before</p>
                    <p className="text-slate-700">Maintenance tasks are just a checklist</p>
                  </div>
                  <div className="bg-green-100 rounded-lg p-3">
                    <p className="text-green-700 font-medium mb-1">After</p>
                    <p className="text-green-800">Tasks are linked to <strong>why</strong> you do them</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="bg-slate-100 rounded-lg p-3">
                    <p className="text-slate-500 font-medium mb-1">Before</p>
                    <p className="text-slate-700">No connection to reliability</p>
                  </div>
                  <div className="bg-green-100 rounded-lg p-3">
                    <p className="text-green-700 font-medium mb-1">After</p>
                    <p className="text-green-800">PM tasks connect directly to failure modes</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="bg-slate-100 rounded-lg p-3">
                    <p className="text-slate-500 font-medium mb-1">Before</p>
                    <p className="text-slate-700">Static maintenance documents</p>
                  </div>
                  <div className="bg-green-100 rounded-lg p-3">
                    <p className="text-green-700 font-medium mb-1">After</p>
                    <p className="text-green-800">Living, searchable reliability intelligence</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="bg-slate-100 rounded-lg p-3">
                    <p className="text-slate-500 font-medium mb-1">Before</p>
                    <p className="text-slate-700">PM actions are isolated</p>
                  </div>
                  <div className="bg-green-100 rounded-lg p-3">
                    <p className="text-green-700 font-medium mb-1">After</p>
                    <p className="text-green-800">Preventive controls become reusable knowledge</p>
                  </div>
                </div>
              </div>
            </section>

            {/* Bottom Line */}
            <section className="bg-blue-50 rounded-xl p-6 border border-blue-100">
              <h3 className="text-lg font-semibold text-blue-900 mb-3">Bottom Line</h3>
              <p className="text-blue-800 mb-4">
                Your maintenance plan becomes <strong>failure prevention intelligence</strong>.
              </p>
              <p className="text-blue-700 mb-3">
                Instead of simply storing maintenance tasks, AssetIQ helps answer:
              </p>
              <p className="text-lg font-semibold text-blue-900 mb-4 italic">
                "What failure is this task trying to prevent?"
              </p>
              <p className="text-blue-700 mb-2">That makes your maintenance plan directly useful for:</p>
              <div className="flex flex-wrap gap-2">
                <Badge className="bg-blue-100 text-blue-700">Failure Mode Library</Badge>
                <Badge className="bg-blue-100 text-blue-700">RCA</Badge>
                <Badge className="bg-blue-100 text-blue-700">Criticality Analysis</Badge>
                <Badge className="bg-blue-100 text-blue-700">PM Optimization</Badge>
                <Badge className="bg-blue-100 text-blue-700">Reliability Analytics</Badge>
              </div>
              <div className="mt-4 pt-4 border-t border-blue-200">
                <p className="text-blue-900 font-semibold">
                  In short: Your maintenance checklist becomes structured reliability knowledge.
                </p>
              </div>
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

// Help button component to trigger the modal
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
