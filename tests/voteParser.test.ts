import { describe, expect, it } from "vitest";

import { parseVoteMessage } from "@/lib/voteParser";

const options = [
  { id: "o1", position: 1, keyword: "pizza", label: "Pizza" },
  { id: "o2", position: 2, keyword: "burger", label: "Burger" },
  { id: "o3", position: 3, keyword: "salad", label: "Salad" }
];

describe("vote parser", () => {
  it("parses numeric mode", () => {
    expect(parseVoteMessage({ mode: "NUMBERS", options, message: "2" })?.id).toBe("o2");
    expect(parseVoteMessage({ mode: "NUMBERS", options, message: "!vote 3" })?.id).toBe("o3");
    expect(parseVoteMessage({ mode: "NUMBERS", options, message: "9" })).toBeNull();
  });

  it("parses letter mode", () => {
    expect(parseVoteMessage({ mode: "LETTERS", options, message: "a" })?.id).toBe("o1");
    expect(parseVoteMessage({ mode: "LETTERS", options, message: "!vote c" })?.id).toBe("o3");
    expect(parseVoteMessage({ mode: "LETTERS", options, message: "g" })).toBeNull();
  });

  it("parses keyword mode", () => {
    expect(parseVoteMessage({ mode: "KEYWORDS", options, message: "pizza" })?.id).toBe("o1");
    expect(parseVoteMessage({ mode: "KEYWORDS", options, message: "!vote burger" })?.id).toBe("o2");
    expect(parseVoteMessage({ mode: "KEYWORDS", options, message: "unknown" })).toBeNull();
  });

  it("normalizes spacing and casing", () => {
    expect(parseVoteMessage({ mode: "KEYWORDS", options, message: "   PIZZA   " })?.id).toBe("o1");
  });
});

