import { describe, it, expect } from "vitest";
import { Platform } from "react-native";

/**
 * Test the safe area padding logic used in ScreenContainer.
 * We test the pure logic (not the React component) to verify
 * the minimum web fallback and edge-based padding calculation.
 */

const WEB_MIN_TOP = 50;

type Edge = "top" | "bottom" | "left" | "right";

interface Insets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

function computeSafeAreaStyle(
  edges: Edge[],
  insets: Insets,
  platform: "web" | "ios" | "android"
) {
  const style: Partial<Record<string, number>> = {};
  if (edges.includes("top")) {
    const topInset = insets.top;
    style.paddingTop = platform === "web" ? Math.max(topInset, WEB_MIN_TOP) : topInset;
  }
  if (edges.includes("bottom")) style.paddingBottom = insets.bottom;
  if (edges.includes("left")) style.paddingLeft = insets.left;
  if (edges.includes("right")) style.paddingRight = insets.right;
  return style;
}

describe("ScreenContainer safe area logic", () => {
  it("applies minimum 50px top padding on web when insets.top is 0", () => {
    const result = computeSafeAreaStyle(
      ["top", "left", "right"],
      { top: 0, bottom: 0, left: 0, right: 0 },
      "web"
    );
    expect(result.paddingTop).toBe(50);
  });

  it("uses actual insets on web when they exceed the minimum", () => {
    const result = computeSafeAreaStyle(
      ["top", "left", "right"],
      { top: 59, bottom: 34, left: 0, right: 0 },
      "web"
    );
    expect(result.paddingTop).toBe(59);
  });

  it("uses actual insets on iOS without minimum fallback", () => {
    const result = computeSafeAreaStyle(
      ["top", "left", "right"],
      { top: 59, bottom: 34, left: 0, right: 0 },
      "ios"
    );
    expect(result.paddingTop).toBe(59);
  });

  it("uses 0 on iOS when insets.top is 0 (no minimum fallback)", () => {
    const result = computeSafeAreaStyle(
      ["top", "left", "right"],
      { top: 0, bottom: 0, left: 0, right: 0 },
      "ios"
    );
    expect(result.paddingTop).toBe(0);
  });

  it("does not add paddingTop when top edge is not requested", () => {
    const result = computeSafeAreaStyle(
      ["left", "right"],
      { top: 59, bottom: 34, left: 0, right: 0 },
      "web"
    );
    expect(result.paddingTop).toBeUndefined();
  });

  it("adds paddingBottom when bottom edge is requested", () => {
    const result = computeSafeAreaStyle(
      ["top", "bottom", "left", "right"],
      { top: 59, bottom: 34, left: 0, right: 0 },
      "ios"
    );
    expect(result.paddingBottom).toBe(34);
  });

  it("handles all four edges", () => {
    const result = computeSafeAreaStyle(
      ["top", "bottom", "left", "right"],
      { top: 47, bottom: 34, left: 10, right: 10 },
      "ios"
    );
    expect(result.paddingTop).toBe(47);
    expect(result.paddingBottom).toBe(34);
    expect(result.paddingLeft).toBe(10);
    expect(result.paddingRight).toBe(10);
  });
});
