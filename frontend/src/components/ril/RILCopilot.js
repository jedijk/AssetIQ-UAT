/**
 * RIL Copilot Component
 * Natural language AI interface for reliability intelligence.
 * 
 * Example queries:
 * - "Why is P-104 high risk?"
 * - "What changed this week?"
 * - "Show all evidence for HX-201"
 * - "Which assets need attention today?"
 * - "What failures are predicted this month?"
 */

import React, { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain,
  ChevronRight,
  Loader2,
  MessageSquare,
  Send,
  Sparkles,
  X,
  AlertTriangle,
  FileText,
  Gauge,
  Clock,
  Lightbulb,
} from "lucide-react";
import { rilCopilotAPI } from "../../lib/apis/rilAPI";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import ReactMarkdown from "react-markdown";
import AIRecommendationCard from "../ai/AIRecommendationCard";

// Intent icons
const intentIcons = {
  risk_analysis: AlertTriangle,
  changes_summary: Clock,
  equipment_details: Gauge,
  attention_required: AlertTriangle,
  predictions: Lightbulb,
  cases_summary: FileText,
  alerts_summary: AlertTriangle,
  general_summary: Brain,
};

export default function RILCopilot({ open, onClose, equipmentId = null }) {
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState([]);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Fetch suggestions
  const { data: suggestionsData } = useQuery({
    queryKey: ["ril-copilot-suggestions"],
    queryFn: () => rilCopilotAPI.getSuggestions(),
    enabled: open,
  });

  const suggestions = suggestionsData?.suggestions || [];

  // Query mutation
  const queryMutation = useMutation({
    mutationFn: ({ query, equipmentId }) => rilCopilotAPI.query(query, equipmentId),
    onSuccess: (data) => {
      setMessages((prev) => [
        ...prev,
        {
          type: "assistant",
          content: data.answer || data.summary,
          intent: data.intent,
          actions: data.actions,
          contract: data,
          timestamp: new Date(),
        },
      ]);
    },
    onError: (error) => {
      setMessages((prev) => [
        ...prev,
        {
          type: "error",
          content: error.message || "Failed to get response. Please try again.",
          timestamp: new Date(),
        },
      ]);
    },
  });

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!query.trim() || queryMutation.isPending) return;

    const userQuery = query.trim();
    setQuery("");

    // Add user message
    setMessages((prev) => [
      ...prev,
      {
        type: "user",
        content: userQuery,
        timestamp: new Date(),
      },
    ]);

    // Send to API
    queryMutation.mutate({ query: userQuery, equipmentId });
  };

  const handleSuggestionClick = (suggestion) => {
    setQuery(suggestion.query);
    inputRef.current?.focus();
  };

  const IntentIcon = (intent) => intentIcons[intent] || Brain;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-40"
            onClick={onClose}
          />

          {/* Sidebar */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed right-0 top-0 h-full w-full max-w-lg bg-white dark:bg-zinc-900 shadow-2xl z-50 flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 shadow-lg">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="font-semibold text-zinc-900 dark:text-white">
                    Reliability Copilot
                  </h2>
                  <p className="text-xs text-zinc-500">AI-powered insights</p>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={onClose}>
                <X className="w-5 h-5" />
              </Button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.length === 0 ? (
                <div className="space-y-4">
                  {/* Welcome message */}
                  <div className="text-center py-6">
                    <Brain className="w-12 h-12 mx-auto mb-3 text-blue-500" />
                    <h3 className="font-semibold text-lg text-zinc-900 dark:text-white">
                      Ask me anything about reliability
                    </h3>
                    <p className="text-sm text-zinc-500 mt-1">
                      I can help with risk analysis, predictions, and maintenance insights
                    </p>
                  </div>

                  {/* Suggestions */}
                  {suggestions.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
                        Suggested queries
                      </p>
                      <div className="space-y-2">
                        {suggestions.slice(0, 6).map((suggestion, i) => (
                          <motion.button
                            key={i}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.05 }}
                            onClick={() => handleSuggestionClick(suggestion)}
                            className="w-full flex items-center gap-3 p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors text-left"
                          >
                            <MessageSquare className="w-4 h-4 text-blue-500 flex-shrink-0" />
                            <span className="text-sm text-zinc-700 dark:text-zinc-300 flex-1">
                              {suggestion.query}
                            </span>
                            <ChevronRight className="w-4 h-4 text-zinc-400" />
                          </motion.button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                messages.map((message, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex ${message.type === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl p-4 ${
                        message.type === "user"
                          ? "bg-blue-500 text-white"
                          : message.type === "error"
                          ? "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400"
                          : "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white"
                      }`}
                    >
                      {message.type === "assistant" && message.intent && (
                        <div className="flex items-center gap-2 mb-2 pb-2 border-b border-zinc-200 dark:border-zinc-700">
                          <Badge variant="secondary" className="text-xs">
                            {message.intent.replace(/_/g, " ")}
                          </Badge>
                        </div>
                      )}
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        {message.type === "user" ? (
                          <p className="m-0">{message.content}</p>
                        ) : (
                          <ReactMarkdown>{message.content}</ReactMarkdown>
                        )}
                      </div>
                      {message.actions && message.actions.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-zinc-200 dark:border-zinc-700">
                          <p className="text-xs font-medium text-zinc-500 mb-2">
                            Suggested actions:
                          </p>
                          <div className="space-y-1">
                            {message.actions.map((action, j) => (
                              <div
                                key={j}
                                className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400"
                              >
                                <ChevronRight className="w-3 h-3" />
                                <span>{action}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {message.contract && (message.contract.citations?.length > 0 || message.contract.evidence_not_available) && (
                        <div className="mt-3">
                          <AIRecommendationCard
                            citations={message.contract.citations}
                            evidenceNotAvailable={message.contract.evidence_not_available}
                            deterministicInputs={message.contract.evidence?.deterministic}
                            compact
                          />
                        </div>
                      )}
                      <p className="text-xs opacity-50 mt-2">
                        {message.timestamp.toLocaleTimeString()}
                      </p>
                    </div>
                  </motion.div>
                ))
              )}
              {queryMutation.isPending && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center gap-2 text-zinc-500"
                >
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Analyzing...</span>
                </motion.div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-4 border-t border-zinc-200 dark:border-zinc-800">
              <form onSubmit={handleSubmit} className="flex gap-2">
                <Input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Ask about reliability, risks, predictions..."
                  className="flex-1"
                  disabled={queryMutation.isPending}
                />
                <Button
                  type="submit"
                  disabled={!query.trim() || queryMutation.isPending}
                  className="bg-gradient-to-r from-blue-500 to-purple-600 text-white hover:from-blue-600 hover:to-purple-700"
                >
                  {queryMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </Button>
              </form>
              <p className="text-xs text-zinc-500 mt-2 text-center">
                Powered by GPT-4o • Ask naturally about your equipment
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
