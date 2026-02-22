import {
  validateUrl,
  type PluginModule,
  type Notifier,
  type NotifyAction,
  type NotifyContext,
  type OrchestratorEvent,
} from "@composio/ao-core";

export const manifest = {
  name: "telegram",
  slot: "notifier" as const,
  description: "Notifier plugin: Telegram",
  version: "0.1.0",
};

interface TelegramResponse {
  ok: boolean;
  result?: {
    message_id?: number;
  };
  description?: string;
}

function eventToText(event: OrchestratorEvent): string {
  return [
    `🔔 ${event.type}`,
    `Project: ${event.projectId}`,
    `Session: ${event.sessionId}`,
    `Priority: ${event.priority}`,
    "",
    event.message,
  ].join("\n");
}

function actionsToInlineKeyboard(actions: NotifyAction[]): Array<Array<Record<string, string>>> {
  return actions
    .map((action, index) => {
      if (action.url) {
        return [{ text: action.label, url: action.url }];
      }
      if (action.callbackEndpoint) {
        return [{ text: action.label, callback_data: `ao:${index}:${action.callbackEndpoint}` }];
      }
      return [];
    })
    .filter((row) => row.length > 0);
}

async function sendMessage(
  apiUrl: string,
  chatId: string,
  text: string,
  actions?: NotifyAction[],
): Promise<string | null> {
  const payload: Record<string, unknown> = {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
  };

  if (actions && actions.length > 0) {
    const keyboard = actionsToInlineKeyboard(actions);
    if (keyboard.length > 0) {
      payload["reply_markup"] = {
        inline_keyboard: keyboard,
      };
    }
  }

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const rawBody = await response.text();
  let body: TelegramResponse | null = null;
  try {
    body = JSON.parse(rawBody) as TelegramResponse;
  } catch {
    body = null;
  }

  if (!response.ok || !body?.ok) {
    const description = body?.description ?? rawBody;
    throw new Error(`Telegram API request failed (${response.status}): ${description}`);
  }

  return body.result?.message_id !== undefined ? String(body.result.message_id) : null;
}

export function create(config?: Record<string, unknown>): Notifier {
  const token = (config?.["token"] as string | undefined) ?? process.env["TELEGRAM_BOT_TOKEN"];
  const chatId = (config?.["chatId"] as string | undefined) ?? process.env["TELEGRAM_CHAT_ID"];

  if (!token || !chatId) {
    console.warn("[notifier-telegram] Missing token/chatId — notifications will be no-ops");
  }

  const apiUrl = token ? `https://api.telegram.org/bot${token}/sendMessage` : null;
  if (apiUrl) {
    validateUrl(apiUrl, "notifier-telegram");
  }

  return {
    name: "telegram",

    async notify(event: OrchestratorEvent): Promise<void> {
      if (!apiUrl || !chatId) return;
      await sendMessage(apiUrl, chatId, eventToText(event));
    },

    async notifyWithActions(event: OrchestratorEvent, actions: NotifyAction[]): Promise<void> {
      if (!apiUrl || !chatId) return;
      await sendMessage(apiUrl, chatId, eventToText(event), actions);
    },

    async post(message: string, context?: NotifyContext): Promise<string | null> {
      if (!apiUrl || !chatId) return null;

      let text = message;
      if (context?.projectId || context?.sessionId) {
        text = [
          message,
          "",
          context.projectId ? `Project: ${context.projectId}` : "",
          context.sessionId ? `Session: ${context.sessionId}` : "",
        ]
          .filter((line) => line.length > 0)
          .join("\n");
      }

      return sendMessage(apiUrl, chatId, text);
    },
  };
}

export default { manifest, create } satisfies PluginModule<Notifier>;