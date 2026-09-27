/**
 * Đường vòng lấy feed khi Substack chặn thẳng.
 *
 * Cloudflare của Substack trả 403 cho mọi request đến từ dải IP datacenter,
 * nên runner của GitHub Actions không đọc feed trực tiếp được, trong khi máy
 * cá nhân thì bình thường. Đã thử feed trực tiếp, API của Substack và
 * r.jina.ai, cả ba đều bị chặn; rss2json là đường duy nhất đi lọt.
 *
 * Đây là dịch vụ bên thứ ba nên chỉ dùng làm phương án dự phòng, không dùng
 * làm mặc định.
 */

import type { FeedItem } from "./fetch-substack-feed";

const ENDPOINT = "https://api.rss2json.com/v1/api.json";

type Rss2JsonResponse = {
  status: string;
  message?: string;
  items?: Array<{
    guid?: string;
    link?: string;
    title?: string;
    description?: string;
    pubDate?: string;
  }>;
};

/** Bỏ thẻ HTML và ép về một dòng, khớp với cách xử lý ở đường trực tiếp. */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * rss2json trả pubDate dạng "2026-09-26 01:30:00" theo giờ UTC nhưng không có
 * hậu tố múi giờ, nên `new Date()` sẽ hiểu thành giờ địa phương. Gắn "Z" vào
 * để ngày trong footer không lệch một ngày so với đường trực tiếp.
 */
function normalizePubDate(pubDate: string): string {
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(pubDate)
    ? `${pubDate.replace(" ", "T")}Z`
    : pubDate;
}

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 2000;

/**
 * rss2json thỉnh thoảng trả 5xx hoặc rớt kết nối vài giây rồi tự hồi phục
 * (run 36263283370 fail vì một lần HTTP 500). Thử lại lỗi tạm thời trước khi
 * bỏ cuộc; lỗi 4xx thì trả ngay vì thử lại cũng vô ích.
 */
async function fetchWithRetry(url: string): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    let reason: string;
    try {
      const response = await fetch(url);
      if (response.ok || response.status < 500) return response;
      reason = `HTTP ${response.status}`;
    } catch (error) {
      reason = error instanceof Error ? error.message : String(error);
    }

    if (attempt >= MAX_ATTEMPTS) {
      throw new Error(`rss2json lỗi sau ${MAX_ATTEMPTS} lần thử: ${reason}`);
    }
    console.log(`rss2json lỗi (${reason}), thử lại lần ${attempt + 1}/${MAX_ATTEMPTS}.`);
    await Bun.sleep(RETRY_DELAY_MS * attempt);
  }
}

export async function fetchViaRss2Json(feedUrl: string): Promise<FeedItem[]> {
  const url = `${ENDPOINT}?rss_url=${encodeURIComponent(feedUrl)}`;
  const response = await fetchWithRetry(url);

  if (!response.ok) {
    throw new Error(`rss2json trả HTTP ${response.status}`);
  }

  const payload = (await response.json()) as Rss2JsonResponse;
  if (payload.status !== "ok") {
    throw new Error(`rss2json báo lỗi: ${payload.message ?? payload.status}`);
  }

  const items: FeedItem[] = [];
  for (const raw of payload.items ?? []) {
    const link = raw.link?.trim() ?? "";
    const guid = raw.guid?.trim() || link;
    const title = raw.title?.trim() ?? "";
    if (!guid || !title) continue;

    items.push({
      guid,
      title,
      link,
      summary: stripHtml(raw.description ?? ""),
      publishedAt: normalizePubDate(raw.pubDate?.trim() ?? ""),
    });
  }

  return items;
}
