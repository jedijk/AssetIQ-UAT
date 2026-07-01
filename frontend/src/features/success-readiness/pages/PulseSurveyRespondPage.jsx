import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../../components/ui/button";
import { Label } from "../../../components/ui/label";
import { Textarea } from "../../../components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";
import { successReadinessAPI } from "../../../lib/apis/successReadiness";
import { SUCCESS_READINESS_BASE } from "../config/nav";
import { SuccessReadinessLoading } from "../components/SuccessReadinessLayout";

function QuestionField({ question, value, onChange }) {
  if (question.type === "rating") {
    const min = question.scale_min ?? 1;
    const max = question.scale_max ?? 5;
    const options = [];
    for (let i = min; i <= max; i += 1) options.push(i);

    return (
      <div>
        <Label className="text-sm font-medium text-slate-800">{question.label}</Label>
        <div className="flex flex-wrap gap-2 mt-2">
          {options.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              className={`w-10 h-10 rounded-full border text-sm font-medium ${
                value === n
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "bg-white text-slate-700 border-slate-200 hover:border-indigo-300"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (question.type === "yes_no") {
    return (
      <div>
        <Label className="text-sm font-medium text-slate-800">{question.label}</Label>
        <div className="flex gap-2 mt-2">
          {["yes", "no"].map((opt) => (
            <Button
              key={opt}
              type="button"
              variant={value === opt ? "default" : "outline"}
              size="sm"
              onClick={() => onChange(opt)}
            >
              {opt === "yes" ? "Yes" : "No"}
            </Button>
          ))}
        </div>
      </div>
    );
  }

  if (question.type === "multiple_choice") {
    return (
      <div>
        <Label className="text-sm font-medium text-slate-800">{question.label}</Label>
        <Select value={value || ""} onValueChange={onChange}>
          <SelectTrigger className="mt-2">
            <SelectValue placeholder="Select an option" />
          </SelectTrigger>
          <SelectContent>
            {(question.options || []).map((opt) => (
              <SelectItem key={opt} value={opt}>{opt}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  return null;
}

export default function PulseSurveyRespondPage() {
  const { surveyId } = useParams();
  const navigate = useNavigate();
  const [answers, setAnswers] = useState({});
  const [comment, setComment] = useState("");

  const { data: survey, isLoading, error } = useQuery({
    queryKey: ["success-readiness", "pulse-surveys", surveyId, "respond"],
    queryFn: () => successReadinessAPI.getPulseSurvey(surveyId),
    enabled: Boolean(surveyId),
  });

  const mutation = useMutation({
    mutationFn: () =>
      successReadinessAPI.submitPulseResponse(surveyId, {
        answers: Object.entries(answers).map(([question_id, value]) => ({ question_id, value })),
        comment,
      }),
    onSuccess: () => {
      toast.success("Thank you for your feedback!");
      navigate(`${SUCCESS_READINESS_BASE}/pulse-surveys`);
    },
    onError: (err) => toast.error(err?.response?.data?.detail || "Failed to submit response"),
  });

  if (isLoading) return <SuccessReadinessLoading />;

  if (error || !survey) {
    return (
      <div className="p-6 text-center text-red-600">
        Survey not available.{" "}
        <Button asChild variant="link">
          <Link to={`${SUCCESS_READINESS_BASE}/pulse-surveys`}>Back</Link>
        </Button>
      </div>
    );
  }

  if (survey.status !== "active") {
    return (
      <div className="p-6 text-center text-slate-600">
        This survey is no longer accepting responses.
        <div className="mt-2">
          <Button asChild variant="link">
            <Link to={`${SUCCESS_READINESS_BASE}/pulse-surveys`}>Back to pulse surveys</Link>
          </Button>
        </div>
      </div>
    );
  }

  const questions = survey.questions || [];
  const allAnswered = questions.every((q) => answers[q.id] !== undefined && answers[q.id] !== "");

  return (
    <div className="p-6 max-w-xl mx-auto space-y-6">
      <div>
        <h2 className="text-base font-semibold text-slate-900">{survey.title}</h2>
        <p className="text-sm text-slate-500 mt-1">{survey.description}</p>
        {survey.anonymous && (
          <p className="text-xs text-slate-400 mt-2">Your responses are anonymous.</p>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-6">
        {questions.map((question) => (
          <QuestionField
            key={question.id}
            question={question}
            value={answers[question.id]}
            onChange={(value) => setAnswers((prev) => ({ ...prev, [question.id]: value }))}
          />
        ))}

        {survey.comment_prompt && (
          <div>
            <Label className="text-sm font-medium text-slate-800">{survey.comment_prompt}</Label>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="mt-2"
              placeholder="Optional"
            />
          </div>
        )}

        <Button
          onClick={() => mutation.mutate()}
          disabled={!allAnswered || mutation.isPending}
          className="w-full"
        >
          <CheckCircle2 className="w-4 h-4 mr-1" />
          Submit response
        </Button>
      </div>
    </div>
  );
}
