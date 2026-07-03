# Livestream AI cho Shopee Live

Module tự động hoá livestream bán hàng cho gian hàng Shopee của mình: phát video FAQ làm sẵn qua OBS, đọc comment realtime và tự bật clip trả lời tương ứng.

> Kế hoạch tổng thể chi tiết: xem file `PLAN_Livestream_AI_Shopee.md` trên Desktop.

## Trạng thái từng phần

| Phần | Trạng thái | Thư mục |
|---|---|---|
| **Phase 0 — Đọc comment** (go/no-go) | ✅ Đã build, chờ test thực tế | `comment-reader/` |
| **Bước 2 — Desktop Agent (OBS)** | ✅ Đã build, chạy được (mock/dry) | `agent/` |
| Bước 3 — Tab dashboard trong koc-tool | ⏳ Chưa làm | (sẽ ở `src/components/`) |
| Bước 4 — Xưởng làm video AI | ⏳ Chưa làm | — |

## Luồng tổng thể

```
┌────────────────────┐   ws://127.0.0.1:8787   ┌──────────────┐   obs-websocket   ┌─────┐   RTMP   ┌────────────┐
│ comment-reader     │ ──────────────────────> │    agent     │ ────────────────> │ OBS │ ──────>  │ Shopee Live│
│ (Chrome extension) │      comment JSON       │ (Node)       │   phat clip       │     │          │            │
└────────────────────┘                         └──────────────┘                   └─────┘          └────────────┘
       đọc DOM                              nhận diện câu hỏi VN
   phòng live Shopee                        -> chọn clip trả lời
```

## Thứ tự làm việc

1. **Test Phase 0 trước** (`comment-reader/README.md`) — đây là go/no-go. Nếu đọc comment không ổn định thì các bước sau vô nghĩa.
2. Nếu Phase 0 GO → test agent với OBS (`agent/README.md`), rồi nối 2 phần lại.
3. Sau đó mới làm dashboard + xưởng video.

## Lưu ý quan trọng (từ PLAN)

- Gian hàng cần **≥ ~10.000 follower** mới đẩy được OBS/RTMP lên Shopee (cần verify cho VN) — kiểm tra điều kiện này TRƯỚC.
- Shopee **cho phép** livestream AI nhưng phải **xin duyệt + gắn nhãn "AI-generated"**. Đi đường hợp lệ.
- Đọc comment là phần mong manh nhất (không có API chính thức VN) — chấp nhận bảo trì + test bằng tài khoản phụ.
