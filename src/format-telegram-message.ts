/**
 * Soạn nội dung tin nhắn Telegram cho một bài Substack.
 *
 * Telegram đăng ở parse_mode HTML vì nó chỉ cần escape ba ký tự, trong khi
 * MarkdownV2 bắt escape hơn chục ký tự và rất dễ vỡ với tiêu đề tiếng Việt
 * có dấu ngoặc kép hay dấu chấm than.
 */

import type { FeedItem } from "./fetch-substack-feed";

/** Ba ký tự Telegram bắt buộc escape ở parse_mode HTML. */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Cắt chuỗi ở ranh giới từ, không cắt giữa chữ. */
function truncate(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}...`;
}

/**
 * Ngày đăng của bài theo dạng YYYY-MM-DD.
 *
 * Tính theo múi giờ của newsletter chứ không theo UTC: runner của GitHub chạy
 * giờ UTC, nên một bài publish lúc 6h sáng giờ Việt Nam sẽ bị ghi lùi một ngày
 * nếu lấy thẳng ngày UTC.
 */
export function formatDate(publishedAt: string, timeZone: string): string {
  const parsed = new Date(publishedAt);
  if (Number.isNaN(parsed.getTime())) return "";
  // en-CA cho ra sẵn định dạng YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(parsed);
}

export type MessageOptions = {
  /** Câu dẫn tự viết, đè lên đoạn tóm tắt lấy từ feed. */
  blurb?: string;
  /** Dòng cuối cố định. `{date}` được thay bằng ngày đăng của bài. */
  footer?: string;
  /** Múi giờ dùng để tính `{date}`. */
  timeZone?: string;
  /** Độ dài tối đa của đoạn dẫn. Telegram cho 4096 ký tự cả tin nhắn. */
  summaryLimit?: number;
};

export function formatMessage(item: FeedItem, options: MessageOptions = {}): string {
  const { blurb, footer, timeZone = "Asia/Ho_Chi_Minh", summaryLimit = 320 } = options;

  const lines = [`<b>${escapeHtml(item.title)}</b>`];

  const lead = (blurb ?? item.summary).trim();
  if (lead) {
    lines.push("", escapeHtml(truncate(lead, summaryLimit)));
  }

  // Link để trần trên một dòng riêng để Telegram tự dựng preview của bài.
  lines.push("", item.link);

  if (footer?.trim()) {
    // Ngày hỏng thì bỏ luôn placeholder và dấu phân cách đứng trước nó,
    // để footer không còn dính một dấu chấm giữa lơ lửng.
    const date = formatDate(item.publishedAt, timeZone);
    const rendered = (date ? footer.replaceAll("{date}", date) : footer.replace(/[\s·•|-]*\{date\}/g, ""))
      .trim();
    if (rendered) lines.push("", escapeHtml(rendered));
  }

  return lines.join("\n");
}
