import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Bot, Loader2, Send } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { ScrollArea } from "../../../components/ui/scroll-area";
import { onboardingAPI } from "../../../lib/apis/onboarding";
import { getPhaseConfig } from "../config/phases";

export function OnboardingAICoach({ phaseId }) {
  const phase = getPhaseConfig(phaseId);
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content: `I'm your AssetIQ onboarding coach. I can explain ${phase?.label || "this step"}, answer questions, and suggest best practices. I won't make changes without your confirmation.`,
    },
  ]);
  const [input, setInput] = useState("");

  const sendMutation = useMutation({
    mutationFn: async (text) => {
      return onboardingAPI.askCoach(phaseId, text);
    },
    onSuccess: (data) => {
      const reply = data?.message || "I received your question. Use the action button to configure this phase.";
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: reply },
      ]);
    },
    onError: () => {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "AI coach is temporarily unavailable. Use Explain Again, Show Example, or Best Practice buttons for guided help.",
        },
      ]);
    },
  });

  const ask = (text) => {
    if (!text.trim()) return;
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setInput("");
    sendMutation.mutate(text);
  };

  return (
    <aside className="w-full xl:w-80 shrink-0 flex flex-col border border-slate-200 rounded-lg bg-white overflow-hidden max-h-[calc(100vh-8rem)]">
      <div className="p-4 border-b border-slate-200 flex items-center gap-2 bg-emerald-50">
        <Bot className="w-5 h-5 text-emerald-700" />
        <div>
          <p className="font-semibold text-sm text-slate-900">AI Coach</p>
          <p className="text-xs text-slate-500">{phase?.label} · read-only guidance</p>
        </div>
      </div>
      <ScrollArea className="flex-1 p-3">
        <div className="space-y-3">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={
                msg.role === "user"
                  ? "ml-4 p-2 rounded-lg bg-emerald-100 text-sm text-slate-800"
                  : "mr-4 p-2 rounded-lg bg-slate-100 text-sm text-slate-700"
              }
            >
              {msg.content}
            </div>
          ))}
          {sendMutation.isPending && (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin" /> Thinking…
            </div>
          )}
        </div>
      </ScrollArea>
      <form
        className="p-3 border-t border-slate-200 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about this step…"
          disabled={sendMutation.isPending}
        />
        <Button type="submit" size="icon" disabled={sendMutation.isPending || !input.trim()}>
          <Send className="w-4 h-4" />
        </Button>
      </form>
    </aside>
  );
}
