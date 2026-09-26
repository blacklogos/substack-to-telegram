/**
 * Đọc RSS của một publication Substack và trả về danh sách bài, mới nhất trước.
 *
 * Substack không có webhook khi đăng bài, feed là tín hiệu duy nhất. Feed có
 * cấu trúc cố định và chỉ phục vụ một publication, nên tách thẻ bằng regex là
 * đủ và tránh kéo thêm một thư viện XML chỉ để đọc bốn thẻ.
 */

import { fetchViaRss2Json } from "./fetch-via-rss2json";

export type FeedItem = {
  /** Định danh ổn định của bài, dùng để biết bài nào đã đăng rồi. */
  guid: string;
  title: string;
  link: string;
  /** Đoạn mở đầu Substack sinh ra, đã bỏ hết thẻ HTML. Có thể rỗng. */
  summary: string;
  /** Thời điểm đăng, giữ nguyên chuỗi của feed để ghi log. */
  publishedAt: string;
};

/**
 * Trả các thực thể về ký tự gốc: tên, thập phân (&#8217;) và thập lục (&#x2019;).
 * `&amp;` xử lý cuối cùng để không vô tình giải mã hai lần trong một lượt.
 */
function decodeEntities(raw: string): string {
  return raw
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number.parseInt(dec, 10)))
    .replace(/&amp;/g, "&");
}

/**
 * Gỡ lớp CDATA rồi giải mã ở tầng XML.
 *
 * Substack bọc nội dung trong CDATA nhưng bên trong lại là HTML đã escape sẵn,
 * nên dấu nháy cong về tới đây vẫn còn ở dạng `&amp;#8217;`. Tầng HTML được
 * giải mã riêng ở `decodeHtmlText`, đừng gộp hai bước làm một.
 */
function decodeXmlText(raw: string): string {
  return decodeEntities(raw.replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, "$1")).trim();
}

/** Giải mã nốt tầng HTML nằm bên trong giá trị đã qua `decodeXmlText`. */
function decodeHtmlText(text: string): string {
  return decodeEntities(text).trim();
}

/** Lấy nội dung thẻ đầu tiên có tên `tag` bên trong một khối XML. */
function extractTag(block: string, tag: string): string {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return match ? decodeXmlText(match[1]!) : "";
}

/** Bỏ thẻ HTML trong phần mô tả, giải mã entity còn lại và ép về một dòng. */
function stripHtml(html: string): string {
  return decodeHtmlText(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

export function parseFeed(xml: string): FeedItem[] {
  const blocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? [];
  const items: FeedItem[] = [];

  for (const block of blocks) {
    const link = extractTag(block, "link");
    // guid của Substack đôi khi trống; link là định danh ổn định thay thế.
    const guid = extractTag(block, "guid") || link;
    const title = decodeHtmlText(extractTag(block, "title"));
    if (!guid || !title) continue;

    items.push({
      guid,
      title,
      link,
      summary: stripHtml(extractTag(block, "description")),
      publishedAt: extractTag(block, "pubDate"),
    });
  }

  return items;
}

/** Chuẩn hoá tên publication hoặc URL thành địa chỉ feed. */
export function feedUrlFor(publication: string): string {
  const trimmed = publication.trim().replace(/\/+$/, "");
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed.endsWith("/feed") ? trimmed : `${trimmed}/feed`;
  }
  return `https://${trimmed}.substack.com/feed`;
}

/**
 * Substack trả 403 cho request đến từ IP datacenter kèm user-agent kiểu bot,
 * nên runner của GitHub Actions bị chặn trong khi máy cá nhân thì không.
 * Gửi kèm bộ header của một trình duyệt thật để qua được lớp lọc đó.
 */
const BROWSER_HEADERS: Record<string, string> = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  accept: "application/rss+xml, application/xml, text/xml, */*;q=0.8",
  "accept-language": "en-US,en;q=0.9,vi;q=0.8",
  "cache-control": "no-cache",
};

/** Đọc thẳng feed. Ném lỗi nếu bị chặn hoặc feed rỗng. */
async function fetchDirect(url: string): Promise<FeedItem[]> {
  const response = await fetch(url, { headers: BROWSER_HEADERS });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const items = parseFeed(await response.text());
  if (items.length === 0) {
    throw new Error("feed không có item nào");
  }
  return items;
}

/**
 * Lấy feed, ưu tiên đọc thẳng và chỉ đi vòng khi bị chặn.
 *
 * Ở máy cá nhân đường thẳng luôn chạy. Trên GitHub Actions nó bị Cloudflare
 * của Substack trả 403 vì IP datacenter, lúc đó mới chuyển sang rss2json.
 * Thứ tự này giữ cho dịch vụ bên thứ ba ở vai dự phòng chứ không thành
 * đường đi mặc định.
 */
export async function fetchFeed(publication: string): Promise<FeedItem[]> {
  const url = feedUrlFor(publication);

  try {
    return await fetchDirect(url);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`Đọc thẳng ${url} không được (${reason}), thử qua rss2json.`);
  }

  const items = await fetchViaRss2Json(url);
  if (items.length === 0) {
    throw new Error(`Không đọc được feed ${url} bằng cả hai đường.`);
  }
  console.log(`Lấy được ${items.length} bài qua rss2json.`);
  return items;
}
