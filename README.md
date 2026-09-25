# substack-to-telegram

Đẩy bài mới từ RSS của Substack sang một kênh Telegram. Chạy bằng GitHub Actions, không cần server, không tốn tiền.

Dựng cho newsletter [Lẩu 1K](https://lau1k.substack.com/), chạy được với bất kỳ publication Substack nào: đổi `SUBSTACK_PUBLICATION` là xong.

Substack không có webhook khi đăng bài, tín hiệu duy nhất là RSS ở `https://<publication>.substack.com/feed`. Repo này quét feed theo lịch, so với danh sách bài đã đăng, thấy bài mới thì gọi Telegram Bot API.

Hướng dẫn cài từng bước, kể cả cách gửi thử một bài có sẵn: [docs/setup.md](docs/setup.md).

## Chuẩn bị

Tạo bot: nhắn `/newbot` cho [@BotFather](https://t.me/BotFather), đặt tên, nhận token dạng `123456:ABC...`.

Cho bot vào kênh: mở kênh Telegram, Administrators, Add Admin, tìm bot vừa tạo, bật quyền Post Messages.

Lấy chat id: kênh public thì dùng luôn `@ten_kenh`. Kênh private thì đăng một tin bất kỳ trong kênh, forward nó vào [@userinfobot](https://t.me/userinfobot), lấy id dạng `-100...`.

## Chạy thử ở máy

```bash
bun install
cp .env.example .env     # điền token và chat id
bun run check            # dry run: in tin nhắn ra màn hình, không gửi
bun run post             # gửi thật
```

`bun run check` không cần token, tiện để xem tin nhắn sẽ trông thế nào trước khi nối vào kênh.

## Cài lên GitHub Actions

Đẩy repo lên GitHub, rồi vào Settings của repo:

Secrets and variables > Actions > Secrets, thêm `TELEGRAM_BOT_TOKEN` và `TELEGRAM_CHAT_ID`.

Cùng trang đó, tab Variables, thêm `SUBSTACK_PUBLICATION` (ví dụ `lau1k`) và `MESSAGE_FOOTER` nếu muốn mỗi tin có một dòng cuối cố định.

Vào tab Actions, chọn workflow, bấm Run workflow với `dry_run` bật để kiểm tra, sau đó tắt đi và chạy thật.

## Lần chạy đầu tiên

Lần chạy đầu chỉ ghi nhận toàn bộ bài đang có vào `state/posted.json` và không gửi gì. Đây là chủ ý: nếu không, bot sẽ dội cả feed cũ vào kênh. Bài kế tiếp bạn đăng trên Substack mới là bài đầu tiên được đẩy sang.

Muốn đăng thử ngay mà không phải chờ bài mới thì xoá một guid khỏi `state/posted.json` rồi chạy lại.

## Về độ trễ

Feed Substack cập nhật ngay khi bài public, nhưng cron của GitHub Actions thường trễ vài phút so với giờ hẹn khi hệ thống bận. Thực tế tin Telegram đến sau email chừng 5 đến 20 phút. Cần đúng lúc thì vào tab Actions bấm Run workflow ngay sau khi nhấn publish.

## Cấu trúc

| File | Việc |
|---|---|
| `src/fetch-substack-feed.ts` | Tải và tách RSS thành danh sách bài |
| `src/format-telegram-message.ts` | Soạn nội dung tin, escape HTML |
| `src/send-telegram-message.ts` | Gọi Telegram Bot API, có chế độ dry run |
| `src/posted-state.ts` | Nhớ bài đã đăng, chống đăng trùng |
| `src/main.ts` | Ghép các bước lại |
| `state/posted.json` | Danh sách guid đã đăng, workflow commit lại sau mỗi lần chạy |

## Vài quyết định trong code

Không dùng thư viện parse XML. Feed chỉ có một nguồn và cần đúng bốn thẻ, thêm dependency chỉ để đọc bốn thẻ là không đáng.

State nằm trong repo chứ không nằm trong cache của Actions, vì cache có thể bị dọn và khi đó bot sẽ đăng lại bài cũ.

Mỗi lần chạy gửi tối đa 3 bài. Nếu state hỏng thì bạn mất 3 tin rác chứ không mất cả kênh.

Gửi hỏng thì dừng ngay và không ghi state, để lần chạy sau thử lại đúng bài đó.
