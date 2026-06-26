import {
  buildLabelHintsFromRisk,
  buildTraceStages,
  formatNodeTypeLabel,
  getNodeRecordLink,
  mergeTracePayload,
  summarizeRiskExplanation,
} from "./reliabilityTraceUtils";

describe("formatNodeTypeLabel", () => {
  it("maps graph node types to friendly labels", () => {
    expect(formatNodeTypeLabel("threat")).toBe("Observation");
    expect(formatNodeTypeLabel("cause")).toBe("Root cause");
  });

  it("title-cases unknown types", () => {
    expect(formatNodeTypeLabel("custom_node")).toBe("custom node");
  });
});

describe("getNodeRecordLink", () => {
  it("returns workspace links for observations", () => {
    expect(getNodeRecordLink("threat", "obs-1")).toBe("/threats/obs-1/workspace");
  });

  it("returns null for unsupported types", () => {
    expect(getNodeRecordLink("outcome", "x")).toBeNull();
  });
});

describe("buildTraceStages", () => {
  it("groups edges into ordered stages", () => {
    const stages = buildTraceStages({
      edges: [
        {
          id: "e1",
          source_id: "eq-1",
          source_type: "equipment",
          source_label: "Pump A",
          target_id: "fm-1",
          target_type: "failure_mode",
          target_label: "Seal leak",
        },
        {
          id: "e2",
          source_id: "fm-1",
          source_type: "failure_mode",
          target_id: "obs-1",
          target_type: "observation",
          target_label: "Vibration high",
        },
      ],
    });

    expect(stages.map((s) => s.key)).toEqual(["equipment", "failure_mode", "observation"]);
    expect(stages[0].nodes[0].label).toBe("Pump A");
  });
});

describe("summarizeRiskExplanation", () => {
  it("normalizes observation and threat fields", () => {
    const summary = summarizeRiskExplanation({
      open_observations: [{ id: "o1", title: "Leak" }],
      graph_linked_observation_count: 2,
      overdue_pm_scheduled: 3,
    });
    expect(summary.openObservationCount).toBe(1);
    expect(summary.graphLinkedObservationCount).toBe(2);
    expect(summary.overduePm).toBe(3);
  });
});

describe("buildLabelHintsFromRisk", () => {
  it("indexes observation titles by type prefix", () => {
    const hints = buildLabelHintsFromRisk({
      open_threats: [{ id: "t1", title: "Hot bearing" }],
    });
    expect(hints["threat:t1"]).toBe("Hot bearing");
    expect(hints["observation:t1"]).toBe("Hot bearing");
  });
});

describe("mergeTracePayload", () => {
  it("deduplicates edges by id", () => {
    const merged = mergeTracePayload(
      { chain: { edges: [{ id: "e1", source_id: "a" }] }, node_labels: { "equipment:a": "A" } },
      { edges: [{ id: "e1", source_id: "a" }, { id: "e2", target_id: "b" }], node_labels: { "action:b": "B" } },
    );
    expect(merged.chain.edges).toHaveLength(2);
    expect(merged.node_labels["action:b"]).toBe("B");
  });
});
