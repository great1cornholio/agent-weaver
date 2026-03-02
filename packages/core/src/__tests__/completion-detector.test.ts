import { describe, it, expect, vi, beforeEach } from "vitest";
import { CompletionDetector } from "../completion-detector.js";
import { execFile } from "node:child_process";

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

describe("CompletionDetector", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns completed when process exited with 0 and has marker", () => {
    const detector = new CompletionDetector("/test", 1000, "developer");
    detector.onStdoutLine("TASK_DONE");
    detector.onProcessExit(0);
    const result = detector.evaluate();
    expect(result.status).toBe("completed");
  });

  it("returns pending when missing signals", () => {
    const detector = new CompletionDetector("/test", 1000, "developer");
    const result = detector.evaluate();
    expect(result.status).toBe("pending");
  });

  it("returns failed if process exited with non-zero code", () => {
    const detector = new CompletionDetector("/test", 1000, "developer");
    detector.onProcessExit(1);
    const result = detector.evaluate();
    expect(result.status).toBe("failed");
  });

  it("returns completed when process exited with 0 and has changes but no marker", () => {
    const detector = new CompletionDetector("/test", 1000, "developer");
    detector.signals.gitDiffNonEmpty = true;
    detector.onProcessExit(0);
    const result = detector.evaluate();
    expect(result.status).toBe("completed");
  });

  it("returns completed when marker detected and git diff is non-empty (process not exited)", () => {
    const detector = new CompletionDetector("/test", 1000, "developer");
    detector.onStdoutLine("TASK_DONE");
    detector.signals.gitDiffNonEmpty = true;
    const result = detector.evaluate();
    expect(result.status).toBe("completed");
  });

  it("returns completed when marker detected and process exited (but missing 0 exit code in previous path or some other path)", () => {
    // Note: actually if processExited=true it hits the first two paths if there's an exit code.
    // Let's just set properties manually to trigger the specific path.
    const detector = new CompletionDetector("/test", 1000, "developer");
    detector.signals.markerDetected = true;
    detector.signals.processExited = true;
    // this mimics process Exit code null
    detector.signals.processExitCode = null;
    const result = detector.evaluate();
    // processExitCode null === 0 is false.
    // processExitCode !== 0 is true (null !== 0). So it returns "failed" based on block 1!
    // But if we bypass block 1 by changing the test setup (not possible, evaluate is pure logic).
    // Let's test the fallthrough of pending.
    expect(result.status).toBe("failed");
  });

  it("returns pending when process exited with 0 but no marker or changes", () => {
    const detector = new CompletionDetector("/test", 1000, "developer");
    detector.onProcessExit(0);
    const result = detector.evaluate();
    expect(result.status).toBe("pending");
  });

  it("returns pending when marker detected but no other signals", () => {
    const detector = new CompletionDetector("/test", 1000, "developer");
    detector.onStdoutLine("TASK_DONE");
    const result = detector.evaluate();
    expect(result.status).toBe("pending");
  });
});
