import {
  upgradeToFineGrid,
  clampWidgetPosition,
  pixelDeltaToGridSteps,
  FINE_GRID_COLUMNS,
} from "../boardLayoutUtils";

describe("upgradeToFineGrid", () => {
  it("doubles legacy 12-col positions to 24-col", () => {
    const { layout, widgets } = upgradeToFineGrid(
      { columns: 12, rows: 6 },
      [{ id: "w1", position: { x: 3, y: 0, w: 3, h: 2 } }],
    );
    expect(layout.columns).toBe(FINE_GRID_COLUMNS);
    expect(widgets[0].position).toEqual({ x: 6, y: 0, w: 6, h: 4 });
  });

  it("leaves fine grid unchanged", () => {
    const input = {
      layout: { columns: 24, rows: 16 },
      widgets: [{ id: "w1", position: { x: 1, y: 1, w: 2, h: 2 } }],
    };
    const result = upgradeToFineGrid(input.layout, input.widgets);
    expect(result.layout).toEqual(input.layout);
    expect(result.widgets).toEqual(input.widgets);
  });
});

describe("clampWidgetPosition", () => {
  it("keeps widget inside grid bounds", () => {
    expect(
      clampWidgetPosition({ x: 20, y: 10, w: 8, h: 4 }, { columns: 24, rows: 16 }),
    ).toEqual({ x: 16, y: 10, w: 8, h: 4 });
  });
});

describe("pixelDeltaToGridSteps", () => {
  it("converts pixel movement to grid steps", () => {
    const steps = pixelDeltaToGridSteps(80, 40, { colWidth: 40, rowHeight: 20, gap: 0 });
    expect(steps).toEqual({ dx: 2, dy: 2 });
  });
});
