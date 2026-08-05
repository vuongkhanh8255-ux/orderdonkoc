# Shopee Live AI — Desktop Agent (Bước 2)

Agent chạy nền trên máy phát live: **nhận comment → nhận diện câu hỏi tiếng Việt → điều khiển OBS phát clip trả lời**, xong tự quay về playlist idle.

```
Extension (Phase 0)  --ws://127.0.0.1:8787-->  Agent  --obs-websocket:4455-->  OBS  --RTMP-->  Shopee Live
                                                  │
                                          faq.json (câu hỏi -> clip)
```

## Cài đặt

```bash
cd livestream-ai/agent
npm install
```

## ⚠️ BẮT BUỘC: khai GIAN HÀNG của máy này (từ 4/8/2026)

Mỗi gian hàng có **kho câu hỏi + bộ clip RIÊNG** (clip là nội dung của chính shop đó: giá, sản phẩm,
chính sách ship, người mẫu). Máy này phát live cho gian nào thì khai đúng gian đó:

1. Vào web koc-tool → **Live AI** → chọn gian hàng ở góc phải → ô **"Mã gian hàng"** → bấm **📋 Copy**.
2. Dán vào `config.json`:

```json
{ "shop": "shopee|eHerb Việt Nam", ... }
```

- Khai **sai** mã gian (gian chưa có câu hỏi nào) → agent **dừng hẳn** kèm thông báo, cố tình không chạy
  để khỏi phát nhầm clip của gian khác khi đang live.
- **Để trống** → agent không nạp được từ web, chỉ dùng `faq.json` tại máy.

**Nhiều gian hàng cùng lúc:** mỗi gian **1 máy riêng** (mỗi máy có OBS + extension + agent riêng, nối
với nhau qua `127.0.0.1` nên máy nào việc máy nấy). Một máy **chưa** chạy được 2 gian: extension ghi cứng
cổng `8787` và OBS chỉ 1 bản/máy.

## Test nhanh KHÔNG cần OBS/Shopee (kiểm tra logic nhận diện)

```bash
npm run mock -- --dry
# hoặc: node src/index.js --mock --dry
```
Gõ thử câu hỏi rồi Enter, xem nó nhận diện đúng intent không:
```
gia bao nhieu shop oi      -> Hỏi giá
ship bao lau                -> Phí ship
con size L k                -> Size
hello                       -> (bỏ qua, không khớp)
```

## Test THẬT với OBS (chưa cần Shopee)

**1. Chuẩn bị OBS:**
- Cài OBS Studio (>= v28, đã có sẵn WebSocket).
- Bật *Tools → WebSocket Server Settings* → Enable, đặt password, port 4455.
- Tạo 2 scene:
  - Scene **IDLE**: thêm 1 *Media Source* (hoặc VLC Source) trỏ playlist clip idle, bật loop.
  - Scene **ANSWER**: thêm 1 *Media Source* đặt tên đúng **ANSWER_PLAYER** (bỏ trống file cũng được, agent sẽ tự đổi file).

**2. Sửa `config.json`:**
- `obs.password` = password vừa đặt trong OBS.
- Tên scene/source khớp với OBS (`IDLE`, `ANSWER`, `ANSWER_PLAYER`).

**3. Tạo `faq.json`** (copy từ `faq.example.json`) và sửa `clip` trỏ tới file mp4 thật trên máy:
```bash
cp faq.example.json faq.json
```

**4. Chạy agent với mock (gõ câu hỏi, xem OBS nhảy scene):**
```bash
npm run mock
```
Gõ "gia bao nhieu" → OBS chuyển sang scene ANSWER, phát clip giá, hết clip tự về IDLE. ✅

## Chạy đầy đủ (nối extension Phase 0)

```bash
npm start
```
Agent mở WebSocket server ở `ws://127.0.0.1:8787`. Extension đọc comment (Phase 0) tự kết nối vào → comment thật từ phòng live sẽ chạy qua nhận diện → OBS phát clip. Badge "agent" trên extension chuyển "đã nối agent".

## Cấu trúc code

| File | Vai trò |
|---|---|
| `src/index.js` | Điểm vào, ráp mọi thứ, xử lý cờ `--mock` / `--dry` |
| `src/intent.js` | Chuẩn hoá tiếng Việt (bỏ dấu, map viết tắt) + keyword match |
| `src/obs.js` | Adapter OBS (obs-websocket v5): đổi file, chuyển scene, nghe sự kiện clip xong |
| `src/orchestrator.js` | Máy trạng thái: khóa "đang trả lời", cooldown, hàng đợi |
| `src/commentSource.js` | WebSocket server nhận từ extension + nguồn mock bàn phím |
| `config.json` | Cấu hình OBS + port + cooldown |
| `faq.json` | Map câu hỏi → clip (bản thật, git-ignore) |

## Tham số logic (`config.json`)

- `cooldownSec` (45): không phát lại cùng 1 clip trong X giây → tránh spam.
- `minConfidence` (1): điểm keyword tối thiểu để phát; thấp hơn thì im lặng.
- `maxQueue` (3): số clip tối đa xếp hàng khi comment dồn.

## Bước tiếp theo (chưa làm)

- **Tầng 2 nhận diện**: embedding cosine cho câu diễn đạt lạ (giờ mới có keyword).
- **Nối Supabase**: đọc faq/config từ dashboard koc-tool thay vì file local.
- **Tab dashboard** trong koc-tool: quản lý kho clip + map câu hỏi bằng UI.
