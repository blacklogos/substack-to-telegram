/**
 * Điểm vào: đọc feed Substack, tìm bài chưa đăng, đẩy lên kênh Telegram.
 *
 * Chạy tay:   bun run check            (dry run, không gửi gì)
 *             bun run post             (gửi thật)
 * Trên CI:    workflow gọi `bun src/main.ts` theo lịch cron.
 */

import { fetchFeed, type FeedItem } from "./fetch-substack-feed";
import { formatMessage } from "./format-telegram-message";
import { sendMessage } from "./send-telegram-message";
import { hasPosted, loadState, markPosted, saveState, seedFromExisting } from "./posted-state";

/** Trần số bài gửi trong một lần chạy, chặn trường hợp state hỏng gây spam kênh. */
const MAX_PER_RUN = 3;

type Config = {
  publication: string;
  token: string;
  chatId: string;
  statePath: string;
  blurb?: string;
  footer?: string;
  dryRun: boolean;
  /** Gửi thử bài mới nhất rồi thoát, không đụng vào state. */
  sendLatest: boolean;
};

function readConfig(): Config {
  const env = process.env;
  const dryRun = env.DRY_RUN === "1" || process.argv.includes("--dry-run");

  const publication = env.SUBSTACK_PUBLICATION?.trim();
  if (!publication) {
    throw new Error("Thiếu SUBSTACK_PUBLICATION (ví dụ: lau1k, hoặc URL đầy đủ).");
  }

  // Dry run không gọi API nên không cần token, tiện chạy thử ở máy.
  const token = env.TELEGRAM_BOT_TOKEN?.trim() ?? "";
  const chatId = env.TELEGRAM_CHAT_ID?.trim() ?? "";
  if (!dryRun && (!token || !chatId)) {
    throw new Error("Thiếu TELEGRAM_BOT_TOKEN hoặc TELEGRAM_CHAT_ID.");
  }

  return {
    publication,
    token,
    chatId,
    statePath: env.STATE_PATH?.trim() || "state/posted.json",
    blurb: env.MESSAGE_BLURB?.trim() || undefined,
    footer: env.MESSAGE_FOOTER?.trim() || undefined,
    dryRun,
    sendLatest: env.SEND_LATEST === "1" || process.argv.includes("--send-latest"),
  };
}

/** Bài chưa đăng, sắp xếp cũ trước để kênh hiện đúng thứ tự thời gian. */
function pickUnposted(items: FeedItem[], state: ReturnType<typeof seedFromExisting>): FeedItem[] {
  return items.filter((item) => !hasPosted(state, item.guid)).reverse().slice(0, MAX_PER_RUN);
}

async function main(): Promise<number> {
  const config = readConfig();
  const items = await fetchFeed(config.publication);
  console.log(`Feed có ${items.length} bài, mới nhất: ${items[0]!.title}`);

  // Chế độ thử: gửi bài mới nhất rồi dừng. Không ghi state, nên chạy bao
  // nhiêu lần cũng được và không ảnh hưởng tới lịch đăng thật về sau.
  if (config.sendLatest) {
    const latest = items[0]!;
    console.log(`Chế độ gửi thử, không ghi state: "${latest.title}"`);
    const result = await sendMessage({
      token: config.token,
      chatId: config.chatId,
      text: formatMessage(latest, { blurb: config.blurb, footer: config.footer }),
      dryRun: config.dryRun,
    });
    if (!result.ok) {
      console.error(`Gửi hỏng: ${result.error}`);
      return 1;
    }
    console.log("Đã gửi bài thử.");
    return 0;
  }

  let state = await loadState(config.statePath);

  // Lần đầu: chỉ ghi nhận hiện trạng, không đăng lại toàn bộ bài cũ.
  if (state.postedGuids.length === 0) {
    await saveState(config.statePath, seedFromExisting(items.map((i) => i.guid)));
    console.log(`Lần chạy đầu: đã ghi nhận ${items.length} bài hiện có, chưa gửi gì.`);
    console.log("Bài tiếp theo bạn đăng trên Substack sẽ được đẩy sang Telegram.");
    return 0;
  }

  const pending = pickUnposted(items, state);
  if (pending.length === 0) {
    console.log("Không có bài mới.");
    return 0;
  }

  console.log(`Có ${pending.length} bài mới${config.dryRun ? " (dry run)" : ""}.`);

  for (const item of pending) {
    const text = formatMessage(item, { blurb: config.blurb, footer: config.footer });
    const result = await sendMessage({
      token: config.token,
      chatId: config.chatId,
      text,
      dryRun: config.dryRun,
    });

    if (!result.ok) {
      // Dừng ngay và không ghi state, để lần chạy sau thử lại đúng bài này.
      console.error(`Gửi hỏng "${item.title}": ${result.error}`);
      return 1;
    }

    console.log(`Đã gửi: ${item.title}`);
    if (!config.dryRun) {
      state = markPosted(state, item.guid);
      await saveState(config.statePath, state);
    }
  }

  return 0;
}

process.exit(await main());
