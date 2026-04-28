import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Shield, ArrowLeft, RefreshCw, Search, Filter, User, Clock, Calendar as CalendarIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";
import { formatDateTime } from "../lib/dateUtils";
import { api } from "../lib/apiClient";
import { useAuth } from "../contexts/AuthContext";
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover";
import { Calendar } from "../components/ui/calendar";

const METHODS = ["POST", "PUT", "PATCH", "DELETE"];

function pad2(n) {
  return String(n).padStart(2, "0");
}

function formatForDateTimeLocal(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function formatDateOnly(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "2-digit" }).format(d);
  } catch (_e) {
    return d.toLocaleDateString();
  }
}

function mergeDateAndTime(dateOnly, timeStr) {
  if (!(dateOnly instanceof Date) || Number.isNaN(dateOnly.getTime())) return null;
  const [hh, mm] = String(timeStr || "00:00").split(":").map((x) => parseInt(x, 10) || 0);
  return new Date(dateOnly.getFullYear(), dateOnly.getMonth(), dateOnly.getDate(), hh, mm, 0, 0);
}

function DateTimePicker({ value, onChange, placeholder = "Select…" }) {
  const date = value ? new Date(value) : null;
  const dateOk = date && !Number.isNaN(date.getTime());
  const [time, setTime] = useState(() => (dateOk ? `${pad2(date.getHours())}:${pad2(date.getMinutes())}` : "00:00"));

  useEffect(() => {
    if (!dateOk) return;
    setTime(`${pad2(date.getHours())}:${pad2(date.getMinutes())}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const label = dateOk ? formatDateOnly(date) : placeholder;

  return (
    <div className="flex flex-col sm:flex-row gap-2">
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="w-full h-10 rounded-md border border-slate-200 bg-white px-3 text-left text-sm flex items-center justify-between"
          >
            <span className={`${dateOk ? "text-slate-900" : "text-slate-400"} truncate pr-2`}>{label}</span>
            <CalendarIcon className="w-4 h-4 text-slate-400" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0">
          <Calendar
            mode="single"
            selected={dateOk ? date : undefined}
            onSelect={(d) => {
              if (!d) return;
              const next = mergeDateAndTime(d, time) || d;
              onChange?.(formatForDateTimeLocal(next));
            }}
            initialFocus
          />
        </PopoverContent>
      </Popover>

      <Input
        type="time"
        value={time}
        onChange={(e) => {
          const t = e.target.value;
          setTime(t);
          const base = dateOk ? date : new Date();
          const next = mergeDateAndTime(base, t);
          if (next) onChange?.(formatForDateTimeLocal(next));
        }}
        className="w-full sm:w-[110px]"
      />
    </div>
  );
}

function statusVariant(status) {
  if (!status) return "secondary";
  if (status >= 200 && status < 300) return "default";
  if (status >= 300 && status < 400) return "secondary";
  if (status >= 400 && status < 500) return "destructive";
  return "destructive";
}

export default function SettingsAuditLogPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const isAllowed = user?.role === "owner";

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);

  const [q, setQ] = useState("");
  const [method, setMethod] = useState("");
  const [actorId, setActorId] = useState("");
  const [fromTs, setFromTs] = useState("");
  const [toTs, setToTs] = useState("");

  const params = useMemo(() => {
    const p = { limit: 200, skip: 0 };
    if (q) p.path = q;
    if (method) p.method = method;
    if (actorId) p.actor_id = actorId;
    if (fromTs) p.from_ts = new Date(fromTs).toISOString();
    if (toTs) p.to_ts = new Date(toTs).toISOString();
    return p;
  }, [q, method, actorId, fromTs, toTs]);

  async function load() {
    if (!isAllowed) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.get("/audit-log", { params });
      setItems(res.data?.items || []);
      setTotal(res.data?.total || 0);
    } catch (e) {
      setError(e?.response?.data?.detail || e?.message || "Failed to load audit log");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, isAllowed]);

  if (!isAllowed) {
    return (
      <div className="max-w-5xl mx-auto p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-slate-600" />
            <h1 className="text-xl font-semibold">Audit Log</h1>
          </div>
          <Button variant="outline" onClick={() => navigate(-1)} className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Access restricted</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-slate-600">
            Only owners and admins can view the audit log.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Shield className="w-5 h-5 text-slate-600 shrink-0" />
          <div className="min-w-0">
            <h1 className="text-xl font-semibold truncate">Audit Log</h1>
            <p className="text-sm text-slate-600 truncate">
              {total ? `${total} events` : "Change & transaction history"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" onClick={() => navigate(-1)} className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
          <Button onClick={load} disabled={loading} className="gap-2">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="w-4 h-4" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-slate-600">Path contains</label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-2 top-2.5" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="/api/forms" className="pl-8" />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-slate-600">Method</label>
            <select
              className="w-full h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
            >
              <option value="">All</option>
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-slate-600">Actor user id</label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-2 top-2.5" />
              <Input value={actorId} onChange={(e) => setActorId(e.target.value)} placeholder="user id" className="pl-8" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-xs text-slate-600 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                From
              </label>
              <DateTimePicker value={fromTs} onChange={setFromTs} placeholder="Start date/time" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-slate-600 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                To
              </label>
              <DateTimePicker value={toTs} onChange={setToTs} placeholder="End date/time" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Events</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {error ? (
            <div className="text-sm text-red-600">{String(error)}</div>
          ) : null}

          {!loading && (!items || items.length === 0) ? (
            <div className="text-sm text-slate-600">No events found for the current filters.</div>
          ) : null}

          <div className="space-y-2">
            {(items || []).map((ev, idx) => {
              const ts = ev?.ts ? new Date(ev.ts) : null;
              const actor = ev?.actor || {};
              const http = ev?.http || {};
              const change = ev?.change || {};
              const fields = Array.isArray(change.fields) ? change.fields : [];

              return (
                <div
                  key={`${ev?.http?.method || "M"}-${ev?.http?.path || "P"}-${ev?.ts || idx}-${idx}`}
                  className="rounded-lg border border-slate-200 p-3 bg-white"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary">{http.method || "?"}</Badge>
                        <Badge variant={statusVariant(http.status)}>{http.status || "?"}</Badge>
                        {ev?.db_env ? <Badge variant="outline">{String(ev.db_env)}</Badge> : null}
                        <span className="text-sm font-medium text-slate-900 truncate">{http.path}</span>
                      </div>
                      <div className="mt-1 text-xs text-slate-600 flex flex-wrap gap-x-3 gap-y-1">
                        <span>
                          <span className="font-medium">When:</span>{" "}
                          {ts ? formatDateTime(ts) : "Unknown"}
                        </span>
                        <span>
                          <span className="font-medium">Who:</span>{" "}
                          {actor?.name || actor?.email || actor?.id || "Unknown"}
                          {actor?.role ? ` (${actor.role})` : ""}
                        </span>
                      </div>
                    </div>
                  </div>

                  {fields.length ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {fields.slice(0, 20).map((f) => (
                        <Badge key={f} variant="outline">
                          {String(f)}
                        </Badge>
                      ))}
                      {fields.length > 20 ? (
                        <Badge variant="outline">+{fields.length - 20} more</Badge>
                      ) : null}
                    </div>
                  ) : (
                    <div className="mt-2 text-xs text-slate-500">No field list recorded (non-JSON body or empty payload).</div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

