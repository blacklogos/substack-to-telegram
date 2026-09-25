/**
 * Gửi tin nhắn vào kênh Telegram qua Bot API.
 *
 * Bot phải là admin của kênh thì mới đăng được. Kênh public dùng luôn
 * "@ten_kenh" làm chatId; kênh private phải dùng id dạng số âm.
 */

export type SendResult = {
  ok: boolean;
  messageId?: number;
  error?: string;
};

export type SendOptions = {
  token: string;
  chatId: string;
  text: string;
  /** true thì chỉ in ra màn hình, không gọi API. */
  dryRun?: boolean;
};

export async function sendMessage({
  token,
  chatId,
  text,
  dryRun = false,
}: SendOptions): Promise<SendResult> {
  if (dryRun) {
    console.log("--- DRY RUN, tin nhắn sẽ gửi ---");
    console.log(text);
    console.log("--- hết ---");
    return { ok: true };
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      // Preview của Substack chính là phần nhìn của tin, nên bật.
      link_preview_options: { is_disabled: false },
    }),
  });

  const payload = (await response.json()) as {
    ok: boolean;
    description?: string;
    result?: { message_id: number };
  };

  if (!payload.ok) {
    return { ok: false, error: payload.description ?? `HTTP ${response.status}` };
  }
  return { ok: true, messageId: payload.result?.message_id };
}
