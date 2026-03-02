import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NotifyAction, OrchestratorEvent } from "@composio/ao-core";
import { create, manifest } from "./index.js";

function makeEvent(overrides: Partial<OrchestratorEvent> = {}): OrchestratorEvent {
  return {
    id: "evt-1",
    type: "pr.created",
    priority: "action",
    sessionId: "tst-1",
    projectId: "test-project",
    timestamp: new Date("2026-02-22T10:00:00.000Z"),
    message: "Merge request created",
    data: {},
    ...overrides,
  };
}

function mockTelegramOk(messageId = 99) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    text: () => Promise.resolve(JSON.stringify({ ok: true, result: { message_id: messageId } })),
  });
}

describe("notifier-telegram", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("has correct manifest", () => {
    expect(manifest).toEqual({
      name: "telegram",
      slot: "notifier",
      description: "Notifier plugin: Telegram",
      version: "0.1.0",
    });
  });

  it("is noop without token/chatId", async () => {
    const fetchMock = mockTelegramOk();
    vi.stubGlobal("fetch", fetchMock);

    const notifier = create();
    await notifier.notify(makeEvent());

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends notification to Telegram API", async () => {
    const fetchMock = mockTelegramOk();
    vi.stubGlobal("fetch", fetchMock);

    const notifier = create({ token: "abc123", chatId: "100" });
    await notifier.notify(makeEvent());

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.telegram.org/botabc123/sendMessage");

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.chat_id).toBe("100");
    expect(body.text).toContain("pr.created");
  });

  it("sends action buttons", async () => {
    const fetchMock = mockTelegramOk();
    vi.stubGlobal("fetch", fetchMock);

    const actions: NotifyAction[] = [
      { label: "Merge ✅", callbackEndpoint: "/merge/7" },
      { label: "Open MR", url: "https://gitlab.com/group/repo/-/merge_requests/7" },
    ];

    const notifier = create({ token: "abc123", chatId: "100" });
    await notifier.notifyWithActions!(makeEvent(), actions);

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.reply_markup.inline_keyboard).toHaveLength(2);
  });

  it("returns message id from post", async () => {
    const fetchMock = mockTelegramOk(1234);
    vi.stubGlobal("fetch", fetchMock);

    const notifier = create({ token: "abc123", chatId: "100" });
    const result = await notifier.post!("done", { projectId: "test-project", sessionId: "tst-1" });

    expect(result).toBe("1234");
  });
});