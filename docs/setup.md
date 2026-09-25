# Cài đặt từng bước

Làm theo đúng thứ tự. Phần A và B mất chừng 5 phút, phần C là gửi thử, phần D bật chạy tự động.

## A. Tạo bot Telegram

1. Mở Telegram, tìm `@BotFather`, bấm Start.
2. Gõ `/newbot`.
3. BotFather hỏi tên hiển thị: gõ `Lẩu 1K`.
4. BotFather hỏi username, phải kết thúc bằng `bot`: gõ `lau1k_feed_bot` (nếu trùng thì thêm số).
5. BotFather trả về một dòng token dạng `8123456789:AAH...`. Copy và giữ lại, đây là `TELEGRAM_BOT_TOKEN`.

Token này cho phép đăng bài dưới danh nghĩa bot, đừng dán nó vào chat hay commit vào repo. Lỡ lộ thì gõ `/revoke` cho BotFather để lấy token mới.

## B. Tạo kênh và cho bot vào

1. Telegram, New Channel, đặt tên `Lẩu 1K`.
2. Chọn Public Channel, đặt link `t.me/lau1k` (tên nào còn trống cũng được).
3. Vào kênh, bấm tên kênh trên cùng, Administrators, Add Admin.
4. Tìm username bot vừa tạo, chọn nó.
5. Chỉ cần bật quyền Post Messages, các quyền khác tắt hết. Bấm Done.

`TELEGRAM_CHAT_ID` chính là `@lau1k`, có dấu @ ở đầu.

Nếu bạn muốn kênh private: bỏ qua bước 2, sau đó đăng một tin bất kỳ trong kênh, forward tin đó cho `@userinfobot`, nó trả về id dạng `-1001234567890`. Dùng số đó làm chat id.

## C. Nạp secret vào repo

Chạy ở máy, mỗi lệnh sẽ hỏi giá trị rồi bạn dán vào:

```bash
cd ~/projects/oss/substack-to-telegram
gh secret set TELEGRAM_BOT_TOKEN
gh secret set TELEGRAM_CHAT_ID
```

Kiểm tra đã vào chưa:

```bash
gh secret list
```

Hai biến còn lại đã set sẵn, xem bằng `gh variable list`:

| Biến | Giá trị | Sửa khi nào |
|---|---|---|
| `SUBSTACK_PUBLICATION` | `lau1k` | Đổi tên publication |
| `MESSAGE_FOOTER` | `Lẩu 1K · thư thứ Bảy` | Muốn dòng cuối khác, hoặc để trống thì bỏ đi |

## D. Gửi thử một bài có sẵn

Chế độ gửi thử lấy bài mới nhất trên feed, gửi vào kênh, và **không ghi state**. Nghĩa là chạy bao nhiêu lần cũng được, và không ảnh hưởng tới lịch đăng thật sau này.

Thử ở máy trước, chưa gửi đi đâu cả:

```bash
cp .env.example .env     # điền token và chat id vào .env
bun run check            # xem feed đọc có ra không
SEND_LATEST=1 DRY_RUN=1 bun src/main.ts    # xem tin nhắn sẽ trông thế nào
```

Ưng rồi thì gửi thật vào kênh:

```bash
bun run test-send
```

Mở kênh Telegram kiểm tra: tiêu đề in đậm, một dòng dẫn, link, dòng cuối. Link phải tự bung preview của Substack.

Muốn thử từ GitHub thay vì từ máy: vào tab Actions, chọn workflow, Run workflow, tick `send_latest`, bấm nút xanh.

## E. Bật chạy tự động

Workflow đã có sẵn lịch cron 30 phút một lần, không cần bật gì thêm. Chỉ còn một bước chuẩn bị:

```bash
bun run post
```

Lần chạy này ghi nhận 20 bài đang có trên feed vào `state/posted.json` và **không gửi gì**. Không có bước này thì lần cron đầu tiên sẽ dội cả feed cũ vào kênh.

```bash
git add state/posted.json
git commit -m "chore(state): seed posted entries"
git push
```

Xong. Từ giờ mỗi khi bạn publish trên Substack, trong vòng khoảng 30 phút bot sẽ tự đăng vào kênh.

## Khi vừa publish và muốn đăng ngay

Cron của GitHub hay trễ vài phút khi hệ thống bận. Cần đăng ngay thì vào tab Actions, Run workflow, không tick gì cả, bấm nút xanh. Nó chạy trong khoảng 30 giây.

## Kiểm tra khi có trục trặc

| Triệu chứng | Nguyên nhân thường gặp |
|---|---|
| Log báo `chat not found` | Chat id sai, hoặc bot chưa được thêm làm admin kênh |
| Log báo `not enough rights` | Bot là admin nhưng chưa bật quyền Post Messages |
| Chạy xong nhưng kênh không có gì | Đang bật `dry_run`, xem lại ô tick lúc Run workflow |
| Bot đăng lại bài cũ | `state/posted.json` bị mất hoặc chưa được commit sau khi chạy |
| Không thấy job chạy theo lịch | GitHub tạm dừng cron ở repo không có hoạt động gì suốt 60 ngày, đẩy một commit bất kỳ là chạy lại |

Xem log các lần chạy:

```bash
gh run list --limit 5
gh run view --log
```
