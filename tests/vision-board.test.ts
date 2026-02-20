import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock AsyncStorage
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(),
    setItem: vi.fn(),
  },
}));

import AsyncStorage from "@react-native-async-storage/async-storage";
import { loadVisionBoard, saveVisionBoard, type VisionBoard } from "../lib/storage";

const mockGet = AsyncStorage.getItem as ReturnType<typeof vi.fn>;
const mockSet = AsyncStorage.setItem as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Vision Board Storage", () => {
  it("returns empty object when no data stored", async () => {
    mockGet.mockResolvedValueOnce(null);
    const board = await loadVisionBoard();
    expect(board).toEqual({});
  });

  it("returns parsed board from storage", async () => {
    const stored: VisionBoard = {
      health: ["file://img1.jpg", "file://img2.jpg"],
      mindset: ["file://img3.jpg"],
    };
    mockGet.mockResolvedValueOnce(JSON.stringify(stored));
    const board = await loadVisionBoard();
    expect(board).toEqual(stored);
  });

  it("returns empty object on parse error", async () => {
    mockGet.mockResolvedValueOnce("not-valid-json{{{");
    const board = await loadVisionBoard();
    expect(board).toEqual({});
  });

  it("saves board to AsyncStorage as JSON", async () => {
    mockSet.mockResolvedValueOnce(undefined);
    const board: VisionBoard = { wealth: ["file://money.jpg"] };
    await saveVisionBoard(board);
    expect(mockSet).toHaveBeenCalledWith(
      "daycheck:visionboard",
      JSON.stringify(board),
    );
  });

  it("can add images to a category", async () => {
    const initial: VisionBoard = { health: ["file://a.jpg"] };
    mockGet.mockResolvedValueOnce(JSON.stringify(initial));
    const board = await loadVisionBoard();

    const updated: VisionBoard = {
      ...board,
      health: [...(board.health ?? []), "file://b.jpg"],
    };
    mockSet.mockResolvedValueOnce(undefined);
    await saveVisionBoard(updated);

    expect(updated.health).toHaveLength(2);
    expect(updated.health).toContain("file://b.jpg");
  });

  it("can remove an image from a category", async () => {
    const initial: VisionBoard = { health: ["file://a.jpg", "file://b.jpg"] };
    mockGet.mockResolvedValueOnce(JSON.stringify(initial));
    const board = await loadVisionBoard();

    const updated: VisionBoard = {
      ...board,
      health: (board.health ?? []).filter((u) => u !== "file://a.jpg"),
    };
    expect(updated.health).toHaveLength(1);
    expect(updated.health).not.toContain("file://a.jpg");
  });
});
