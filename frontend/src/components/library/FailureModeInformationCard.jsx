const PRIMARY_BLUE = "#2563eb";
const DARK_TEXT = "#0f172a";
const MUTED_TEXT = "#475569";
const BORDER = "#e2e8f0";

function SectionTitle({ children }) {
  return (
    <h3
      className="text-sm font-semibold uppercase tracking-wide mb-2"
      style={{ color: PRIMARY_BLUE }}
    >
      {children}
    </h3>
  );
}

function BulletList({ items = [] }) {
  if (!items?.length) {
    return <p className="text-sm" style={{ color: MUTED_TEXT }}>Not specified in current Failure Mode record.</p>;
  }
  return (
    <ul className="list-disc pl-5 space-y-1 text-sm" style={{ color: DARK_TEXT }}>
      {items.map((item, idx) => (
        <li key={idx}>{item}</li>
      ))}
    </ul>
  );
}

function RiskBadge({ level }) {
  const colors = {
    Low: "bg-green-100 text-green-800 border-green-200",
    Medium: "bg-yellow-100 text-yellow-800 border-yellow-200",
    Elevated: "bg-orange-100 text-orange-800 border-orange-200",
    High: "bg-red-100 text-red-800 border-red-200",
    Critical: "bg-red-200 text-red-900 border-red-300",
  };
  return (
    <span className={`inline-flex px-3 py-1 rounded-full text-sm font-semibold border ${colors[level] || "bg-slate-100 text-slate-700 border-slate-200"}`}>
      {level || "—"}
    </span>
  );
}

export default function FailureModeInformationCard({ card, t }) {
  if (!card) return null;

  const header = card.header || {};
  const risk = card.risk_summary || {};
  const scoring = card.scoring_justification || {};
  const likelihood = card.likelihood || {};
  const effects = card.potential_effects || {};
  const causes = card.potential_causes || {};
  const kri = card.key_reliability_indicator || {};
  const standards = card.standards_alignment || {};
  const footer = card.footer || {};

  return (
    <div
      data-testid="failure-mode-information-card"
      className="bg-white w-[900px] max-w-full mx-auto shadow-sm border"
      style={{ color: DARK_TEXT, borderColor: BORDER }}
    >
      {/* Header */}
      <div className="px-8 pt-8 pb-6 border-b" style={{ borderColor: BORDER }}>
        <div className="flex items-start justify-between gap-6">
          <img
            src="/assetiq-text-logo.png"
            alt="AssetIQ"
            className="h-10 w-auto object-contain"
          />
          <div className="text-right text-xs" style={{ color: MUTED_TEXT }}>
            <div className="font-medium" style={{ color: PRIMARY_BLUE }}>
              {header.title || t?.("failureModeInfoCard.title") || "Failure Mode Information Card"}
            </div>
            {header.validation_status && (
              <div>{header.validation_status}</div>
            )}
            {header.last_updated && (
              <div>{t?.("failureModeInfoCard.lastUpdated") || "Last Updated"}: {header.last_updated}</div>
            )}
          </div>
        </div>
        <h1 className="text-2xl font-bold mt-6" style={{ color: DARK_TEXT }}>
          {header.failure_mode_name}
        </h1>
        <div className="flex flex-wrap gap-4 mt-3 text-sm" style={{ color: MUTED_TEXT }}>
          {header.discipline && <span>{t?.("failureModeInfoCard.discipline") || "Discipline"}: <strong style={{ color: DARK_TEXT }}>{header.discipline}</strong></span>}
          {header.process && <span>{t?.("failureModeInfoCard.process") || "Process"}: <strong style={{ color: DARK_TEXT }}>{header.process}</strong></span>}
          {header.iso14224_reference && <span>{t?.("failureModeInfoCard.iso14224") || "ISO 14224"}: <strong style={{ color: DARK_TEXT }}>{header.iso14224_reference}</strong></span>}
        </div>
      </div>

      {/* Risk Summary */}
      <div className="px-8 py-6 border-b bg-slate-50" style={{ borderColor: BORDER }}>
        <SectionTitle>{t?.("failureModeInfoCard.riskSummary") || "Risk Summary"}</SectionTitle>
        <div className="grid grid-cols-5 gap-4 items-center">
          <div className="text-center">
            <div className="text-3xl font-bold" style={{ color: PRIMARY_BLUE }}>{risk.rpn ?? "—"}</div>
            <div className="text-xs uppercase tracking-wide mt-1" style={{ color: MUTED_TEXT }}>RPN</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-semibold">{risk.severity ?? "—"}</div>
            <div className="text-xs uppercase tracking-wide mt-1" style={{ color: MUTED_TEXT }}>{t?.("library.severity") || "Severity"}</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-semibold">{risk.occurrence ?? "—"}</div>
            <div className="text-xs uppercase tracking-wide mt-1" style={{ color: MUTED_TEXT }}>{t?.("library.occurrence") || "Occurrence"}</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-semibold">{risk.detection ?? "—"}</div>
            <div className="text-xs uppercase tracking-wide mt-1" style={{ color: MUTED_TEXT }}>{t?.("library.detectability") || "Detection"}</div>
          </div>
          <div className="text-center">
            <RiskBadge level={risk.overall_risk_level} />
            <div className="text-xs uppercase tracking-wide mt-2" style={{ color: MUTED_TEXT }}>{t?.("failureModeInfoCard.riskLevel") || "Risk Level"}</div>
          </div>
        </div>
      </div>

      <div className="px-8 py-6 space-y-6">
        {/* Overview */}
        <section>
          <SectionTitle>{t?.("failureModeInfoCard.overview") || "Failure Mode Overview"}</SectionTitle>
          <div className="space-y-3 text-sm leading-relaxed">
            {(card.failure_mode_overview || []).map((para, idx) => (
              <p key={idx}>{para}</p>
            ))}
          </div>
        </section>

        {/* Technical Description */}
        <section>
          <SectionTitle>{t?.("failureModeInfoCard.technicalDescription") || "Technical Description"}</SectionTitle>
          <p className="text-sm leading-relaxed">{card.technical_description}</p>
        </section>

        {/* Scoring Justification */}
        <section>
          <SectionTitle>{t?.("failureModeInfoCard.scoringJustification") || "Scoring Justification"}</SectionTitle>
          <div className="space-y-2 text-sm">
            {scoring.severity && <p>{scoring.severity}</p>}
            {scoring.occurrence && <p>{scoring.occurrence}</p>}
            {scoring.detection && <p>{scoring.detection}</p>}
          </div>
        </section>

        {/* Likelihood */}
        <section>
          <SectionTitle>{t?.("failureModeInfoCard.likelihood") || "Likelihood"}</SectionTitle>
          <p className="text-sm">
            <strong>{likelihood.label}</strong>
            {likelihood.explanation ? ` — ${likelihood.explanation}` : ""}
          </p>
        </section>

        {/* Effects & Causes grid */}
        <div className="grid grid-cols-2 gap-6">
          <section>
            <SectionTitle>{t?.("failureModeInfoCard.potentialEffects") || "Potential Effects"}</SectionTitle>
            <div className="space-y-3 text-sm">
              <div><div className="font-medium mb-1">{t?.("failureModeInfoCard.processEffects") || "Process Effects"}</div><BulletList items={effects.process_effects} /></div>
              <div><div className="font-medium mb-1">{t?.("failureModeInfoCard.equipmentEffects") || "Equipment Effects"}</div><BulletList items={effects.equipment_effects} /></div>
              <div><div className="font-medium mb-1">{t?.("failureModeInfoCard.businessEffects") || "Business Effects"}</div><BulletList items={effects.business_effects} /></div>
              <div><div className="font-medium mb-1">{t?.("failureModeInfoCard.safetyConsiderations") || "Safety Considerations"}</div><BulletList items={effects.safety_considerations} /></div>
              <div><div className="font-medium mb-1">{t?.("failureModeInfoCard.environmentalConsiderations") || "Environmental Considerations"}</div><BulletList items={effects.environmental_considerations} /></div>
            </div>
          </section>
          <section>
            <SectionTitle>{t?.("failureModeInfoCard.potentialCauses") || "Potential Causes"}</SectionTitle>
            <div className="space-y-3 text-sm">
              {Object.entries({
                process: t?.("failureModeInfoCard.causeProcess") || "Process",
                maintenance: t?.("failureModeInfoCard.causeMaintenance") || "Maintenance",
                design: t?.("failureModeInfoCard.causeDesign") || "Design",
                operational: t?.("failureModeInfoCard.causeOperational") || "Operational",
                human_factors: t?.("failureModeInfoCard.causeHumanFactors") || "Human Factors",
              }).map(([key, label]) => (
                <div key={key}>
                  <div className="font-medium mb-1">{label}</div>
                  <BulletList items={causes[key]} />
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Applicable Equipment */}
        <section>
          <SectionTitle>{t?.("failureModeInfoCard.applicableEquipment") || "Applicable Equipment"}</SectionTitle>
          <BulletList items={card.applicable_equipment} />
        </section>

        {/* Key Reliability Indicator */}
        <section className="rounded-lg border p-4" style={{ borderColor: BORDER }}>
          <SectionTitle>{t?.("failureModeInfoCard.keyReliabilityIndicator") || "Key Reliability Indicator"}</SectionTitle>
          <p className="text-sm font-semibold">{kri.indicator}</p>
          {kri.description && <p className="text-sm mt-1" style={{ color: MUTED_TEXT }}>{kri.description}</p>}
        </section>

        {/* Recommended Actions */}
        <section>
          <SectionTitle>{t?.("failureModeInfoCard.recommendedActions") || "Recommended Actions"}</SectionTitle>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b" style={{ borderColor: BORDER, color: PRIMARY_BLUE }}>
                  <th className="text-left py-2 pr-3 font-semibold">{t?.("failureModeInfoCard.action") || "Action"}</th>
                  <th className="text-left py-2 pr-3 font-semibold">{t?.("failureModeInfoCard.strategy") || "Strategy"}</th>
                  <th className="text-left py-2 pr-3 font-semibold">{t?.("failureModeInfoCard.justification") || "Justification"}</th>
                  <th className="text-left py-2 font-semibold">{t?.("failureModeInfoCard.riskReduction") || "Risk Reduction"}</th>
                </tr>
              </thead>
              <tbody>
                {(card.recommended_actions || []).map((action, idx) => (
                  <tr key={idx} className="border-b align-top" style={{ borderColor: BORDER }}>
                    <td className="py-3 pr-3">
                      <div className="font-medium">{action.action_name}</div>
                      {action.discipline && <div className="text-xs mt-1" style={{ color: MUTED_TEXT }}>{action.discipline}</div>}
                      {action.control_type && <div className="text-xs mt-1" style={{ color: PRIMARY_BLUE }}>{action.control_type}</div>}
                    </td>
                    <td className="py-3 pr-3">{action.maintenance_strategy}</td>
                    <td className="py-3 pr-3">{action.justification}</td>
                    <td className="py-3">{action.risk_component}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Risk Reduction Logic */}
        <section>
          <SectionTitle>{t?.("failureModeInfoCard.riskReductionLogic") || "Risk Reduction Logic"}</SectionTitle>
          <p className="text-sm leading-relaxed">{card.risk_reduction_logic}</p>
        </section>

        {/* Standards Alignment */}
        <section>
          <SectionTitle>{t?.("failureModeInfoCard.standardsAlignment") || "Standards Alignment"}</SectionTitle>
          <p className="text-sm mb-3">{standards.summary}</p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {(standards.standards || []).map((std, idx) => (
              <div key={idx} className="border rounded px-3 py-2" style={{ borderColor: BORDER }}>
                <div className="font-semibold" style={{ color: PRIMARY_BLUE }}>{std.code}</div>
                <div style={{ color: MUTED_TEXT }}>{std.description}</div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Footer */}
      <div className="px-8 py-6 border-t text-center" style={{ borderColor: BORDER, backgroundColor: "#f8fafc" }}>
        {(footer.tagline_lines || []).map((line, idx) => (
          <div key={idx} className="text-sm font-medium" style={{ color: DARK_TEXT }}>{line}</div>
        ))}
        <div className="text-xs mt-2" style={{ color: PRIMARY_BLUE }}>
          {footer.powered_by || "Powered by AssetIQ"}
        </div>
      </div>
    </div>
  );
}
