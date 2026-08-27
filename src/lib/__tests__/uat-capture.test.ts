// @ts-ignore — vitest types available after `npm install`
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { captureEvidence } from "../uat-capture";

const BASE_ARGS = {
  agent: "test-agent",
  model: "claude-sonnet-4-6",
  provider: "anthropic",
  params: { temperature: 0, max_tokens: 1024 },
  systemPrompt: "You are a PM assistant.",
  userPrompt: "Summarize this project.",
  latencyMs: 123,
};

describe("captureEvidence", () => {
  let tmpDir: string;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "uat-test-"));
  });

  afterEach(() => {
    // restore env
    process.env.UAT_CAPTURE = originalEnv.UAT_CAPTURE;
    process.env.UAT_CAPTURE_DIR = originalEnv.UAT_CAPTURE_DIR;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("is a no-op when UAT_CAPTURE is not set", () => {
    delete process.env.UAT_CAPTURE;
    captureEvidence(BASE_ARGS);
    expect(fs.readdirSync(tmpDir)).toHaveLength(0);
  });

  it("is a no-op when UAT_CAPTURE is '0'", () => {
    process.env.UAT_CAPTURE = "0";
    captureEvidence(BASE_ARGS);
    expect(fs.readdirSync(tmpDir)).toHaveLength(0);
  });

  it("writes a JSON file when UAT_CAPTURE=1", () => {
    process.env.UAT_CAPTURE = "1";
    process.env.UAT_CAPTURE_DIR = tmpDir;
    captureEvidence(BASE_ARGS);
    const files = fs.readdirSync(tmpDir);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/\.json$/);
  });

  it("written record has correct shape and agent field", () => {
    process.env.UAT_CAPTURE = "1";
    process.env.UAT_CAPTURE_DIR = tmpDir;
    captureEvidence({ ...BASE_ARGS, inputId: "proj-123", retrievedContext: "ctx" });
    const files = fs.readdirSync(tmpDir);
    const record = JSON.parse(fs.readFileSync(path.join(tmpDir, files[0]), "utf8"));
    expect(record.agent).toBe("test-agent");
    expect(record.model).toBe("claude-sonnet-4-6");
    expect(record.provider).toBe("anthropic");
    expect(record.params.temperature).toBe(0);
    expect(record.input_id).toBe("proj-123");
    expect(record.retrieved_context).toBe("ctx");
    expect(record.latency_ms).toBe(123);
    expect(typeof record.run_id).toBe("string");
    expect(typeof record.timestamp).toBe("string");
  });

  it("swallows errors and never throws", () => {
    process.env.UAT_CAPTURE = "1";
    // Point at a path that cannot be created (non-existent drive on Windows)
    process.env.UAT_CAPTURE_DIR = "Z:\\nonexistent\\uat\\path";
    expect(() => captureEvidence(BASE_ARGS)).not.toThrow();
  });

  it("captures error field when provided", () => {
    process.env.UAT_CAPTURE = "1";
    process.env.UAT_CAPTURE_DIR = tmpDir;
    captureEvidence({ ...BASE_ARGS, error: "timeout" });
    const files = fs.readdirSync(tmpDir);
    const record = JSON.parse(fs.readFileSync(path.join(tmpDir, files[0]), "utf8"));
    expect(record.error).toBe("timeout");
  });
});
