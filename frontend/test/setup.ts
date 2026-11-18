import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";

afterEach(async () => {
  // Component tests run in a browser-like page; unmount between tests there.
  if (typeof document !== "undefined") {
    const { cleanup } = await import("@testing-library/react");
    cleanup();
  }
  vi.unstubAllGlobals();
});
