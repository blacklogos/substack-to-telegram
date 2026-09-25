/**
 * Nhớ những bài đã đăng lên Telegram.
 *
 * GitHub Actions không giữ trạng thái giữa hai lần chạy, nên state nằm trong
 * chính repo dưới dạng một file JSON và workflow commit lại sau mỗi lần đăng.
 * Đơn giản hơn cache của Actions (có thể bị dọn) và đọc được bằng mắt khi cần
 * sửa tay.
 */

const MAX_REMEMBERED = 50;

export type PostedState = {
  /** guid của các bài đã đăng, mới nhất đứng đầu. */
  postedGuids: string[];
  /** Lần chạy gần nhất có đăng gì đó, để tiện soi log. */
  updatedAt?: string;
};

const EMPTY: PostedState = { postedGuids: [] };

export async function loadState(path: string): Promise<PostedState> {
  const file = Bun.file(path);
  if (!(await file.exists())) return { ...EMPTY };

  try {
    const parsed = (await file.json()) as Partial<PostedState>;
    return { postedGuids: parsed.postedGuids ?? [], updatedAt: parsed.updatedAt };
  } catch {
    // File hỏng thì coi như chưa đăng gì; vòng chạy sau sẽ tự dựng lại.
    console.warn(`State ở ${path} không đọc được, bỏ qua và bắt đầu lại.`);
    return { ...EMPTY };
  }
}

export async function saveState(path: string, state: PostedState): Promise<void> {
  const trimmed: PostedState = {
    postedGuids: state.postedGuids.slice(0, MAX_REMEMBERED),
    updatedAt: new Date().toISOString(),
  };
  await Bun.write(path, `${JSON.stringify(trimmed, null, 2)}\n`);
}

export function hasPosted(state: PostedState, guid: string): boolean {
  return state.postedGuids.includes(guid);
}

export function markPosted(state: PostedState, guid: string): PostedState {
  return { ...state, postedGuids: [guid, ...state.postedGuids.filter((g) => g !== guid)] };
}

/**
 * Lần chạy đầu tiên: ghi nhận toàn bộ bài đang có mà không đăng cái nào.
 * Thiếu bước này thì bot sẽ dội cả feed cũ vào kênh ngay lần chạy đầu.
 */
export function seedFromExisting(guids: string[]): PostedState {
  return { postedGuids: guids.slice(0, MAX_REMEMBERED), updatedAt: new Date().toISOString() };
}
