import {
  Droplets,
  CircleDot,
  Waves,
  Gauge,
  Flame,
  Zap,
  Minimize2,
  Filter,
  Thermometer,
  Cog,
} from "lucide-react";
import { getFailureModeCategory, getFailureModeIcon } from "./failureModeIcons";

describe("getFailureModeCategory", () => {
  it("prefers category over legacy discipline field", () => {
    expect(getFailureModeCategory({ category: "Piping", discipline: "Rotating" })).toBe("Piping");
  });

  it("falls back to discipline when category is missing", () => {
    expect(getFailureModeCategory({ discipline: "Electrical" })).toBe("Electrical");
  });
});

describe("getFailureModeIcon", () => {
  it("maps leak-related failure modes to droplets", () => {
    expect(
      getFailureModeIcon({
        category: "Piping",
        failure_mode: "Flange Leak",
        keywords: ["flange", "leak"],
      }),
    ).toBe(Droplets);
  });

  it("maps bearing failures to circle dot", () => {
    expect(
      getFailureModeIcon({
        category: "Rotating",
        failure_mode: "Bearing Failure",
        keywords: ["bearing", "vibration"],
      }),
    ).toBe(CircleDot);
  });

  it("maps cavitation to waves", () => {
    expect(
      getFailureModeIcon({
        category: "Rotating",
        failure_mode: "Cavitation",
        keywords: ["cavitation", "bubbles"],
      }),
    ).toBe(Waves);
  });

  it("maps pressure events to gauge", () => {
    expect(
      getFailureModeIcon({
        category: "Piping",
        failure_mode: "Water Hammer",
        keywords: ["hammer", "pressure surge"],
      }),
    ).toBe(Gauge);
  });

  it("maps fire and explosion to flame", () => {
    expect(
      getFailureModeIcon({
        category: "Safety",
        failure_mode: "Fire",
        keywords: ["fire"],
      }),
    ).toBe(Flame);
  });

  it("maps electrical faults to zap", () => {
    expect(
      getFailureModeIcon({
        category: "Electrical",
        failure_mode: "Short Circuit",
        keywords: ["short circuit"],
      }),
    ).toBe(Zap);
  });

  it("maps extruder screw wear to minimize icon", () => {
    expect(
      getFailureModeIcon({
        category: "Extruder",
        failure_mode: "Screw Wear (Abrasive)",
        keywords: ["screw wear", "abrasive"],
      }),
    ).toBe(Minimize2);
  });

  it("maps fouling and blockage to filter", () => {
    expect(
      getFailureModeIcon({
        category: "Static",
        failure_mode: "Fouling",
        keywords: ["fouling", "scaling"],
      }),
    ).toBe(Filter);
  });

  it("maps thermal issues to thermometer", () => {
    expect(
      getFailureModeIcon({
        category: "Static",
        failure_mode: "Thermal Fatigue",
        keywords: ["thermal", "fatigue"],
      }),
    ).toBe(Thermometer);
  });

  it("falls back to discipline icon when no pattern matches", () => {
    expect(
      getFailureModeIcon({
        category: "Rotating",
        failure_mode: "Custom Unknown Mode",
        keywords: ["custom"],
      }),
    ).toBe(Cog);
  });
});
