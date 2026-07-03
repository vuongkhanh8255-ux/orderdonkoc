# 🎥 LIVE AI — Quy trình & Kế hoạch tổng thể

> Tool tự động hoá **livestream bán hàng trên Shopee Live** cho **gian hàng của chính mình**.
> Cập nhật: **3/7/2026**. File này gom toàn bộ: đang ở đâu, chạy được gì, còn thiếu gì, làm tiếp sao.

---

## 1. Ý tưởng 1 câu

Làm sẵn **kho video FAQ** (trả lời giá / ship / size / voucher…) → khi livestream, **phát vòng lặp** lúc không ai hỏi → **có người comment thì tự nhận diện câu hỏi và bật đúng clip trả lời** → xong quay lại vòng lặp. Người xem tưởng có host tư vấn thật.

---

## 2. Sơ đồ tổng thể

```
   NGƯỜI XEM comment trong phòng live Shopee
                    │  (nửa "VÀO" — ĐANG GIẢI)
                    ▼
   [Đọc comment]  ──ws──►  AGENT (máy tính)  ──obs-websocket──►  OBS  ──RTMP──►  Shopee Live
                          nhận diện câu hỏi VN          phát clip trả lời
                                    ▲
                                    │ đọc kho câu hỏi + clip
                          ┌─────────┴──────────┐
                          │  koc-tool (web)     │  ← mình quản mọi thứ ở đây
                          │  + Supabase (data)  │
                          └────────────────────┘
```

Hệ thống có **2 nửa**:
- **Nửa "TRẢ LỜI"** (hiểu câu hỏi → phát clip qua OBS) → ✅ **XONG, chạy thật**.
- **Nửa "VÀO"** (tự đọc comment người xem) → 🔴 **chưa xong** (Shopee không cho đọc dễ).

---

## 3. Các thành phần đã dựng (trong app koc-tool + agent)

| # | Thành phần | Ở đâu | Trạng thái |
|---|---|---|---|
| 1 | **Module 4: Live AI** — kho câu hỏi → clip (thêm/sửa, test nhận diện, xuất faq.json) | Tab web (menu Shopee) | ✅ Xong |
| 2 | **Agent** — nhận diện câu hỏi tiếng Việt + điều khiển OBS | `livestream-ai/agent/` (chạy trên máy phát live) | ✅ Xong + chạy thật với OBS |
| 3 | **Đọc config từ Supabase** — sửa trên web, agent tự lấy | agent | ✅ Xong |
| 4 | **Module 5: Xưởng Clip** — dây chuyền sản xuất clip (kịch bản → ảnh → video → clip cuối) | Tab web | ✅ Làm tay xong · 🟡 Tự động chờ key |
| 5 | **Live AI Studio** — giao diện điều khiển pro (như mockup) | Tab web | ✅ Miếng 1 (giao diện + playlist/script thật) |
| 6 | **Comment reader** — extension Chrome đọc comment | `livestream-ai/comment-reader/` | ⚠️ Web-xem NO-GO, chờ test console host |

---

## 4. Quy trình sản xuất 1 clip (Xưởng Clip)

Mỗi câu hỏi đi qua **4 bước**:

```
① Kịch bản  →  ② Ảnh nhân vật cầm SP  →  ③ Video avatar nói  →  ④ Clip cuối (máy phát live)
  (viết/AI)      (ChatGPT/OpenAI gen)      (HeyGen ảnh→nói)       (tải về, điền đường dẫn OBS)
```

- **① Kịch bản:** viết tay hoặc AI. Tao đã seed sẵn 5 kịch bản mẫu.
- **② Ảnh:** dùng **OpenAI gpt-image-1** (ChatGPT) — tạo người ảo cầm sản phẩm. Có nút **🪄 Tạo ảnh tự động**.
- **③ Video:** dùng **HeyGen** — đưa ảnh + kịch bản → người ảo nói giọng Việt, nhép miệng. Có nút **🎬 Tạo video tự động** + **🔄 Kiểm tra**.
- **④ Clip cuối:** tải mp4 về **máy phát live**, điền đường dẫn (VD `C:/live-clips/gia.mp4`) → agent phát trong OBS.

**Chọn công cụ (đã chốt):** ảnh = **OpenAI (ChatGPT)**, video = **HeyGen** (đi đường **API Pay-As-You-Go**, nạp ví ~$5, KHÔNG mua gói web $29). Điều khiển build thẳng vào koc-tool, **KHÔNG dùng n8n** (n8n không giảm phí API).

---

## 5. Trạng thái chi tiết: XONG / CHỜ / CHƯA

### ✅ ĐÃ XONG + chạy thật
- Kho câu hỏi (Module 4) + nhận diện tiếng Việt (test 16 câu đúng).
- Agent đọc config từ Supabase (khỏi sửa file tay).
- **Agent → OBS phát clip** (đã thấy tận mắt clip chạy trong OBS).
- Xưởng Clip làm tay + giao diện Studio pro.
- Code tự động OpenAI + HeyGen (đã review kỹ, khớp spec 100%, không bug chặn).

### 🟡 CODE XONG — chờ Khánh kích hoạt
- **Xưởng Clip tự động:** cần cắm **2 API key vào Vercel** + nạp ví + Verify OpenAI org.

### 🔴 CHƯA làm / phần khó
- **Đọc comment thật** (nửa "VÀO") — web-xem NO-GO; đích thật = **console live Seller Center khi mình là host** (cần đang phát live để test).
- Nút "Điều khiển nhanh" ở Studio bấm thật (cần agent 2 chiều).
- Preview OBS trong web (khó — bắt luồng OBS).
- Thống kê Shopee realtime (cần data live).

---

## 6. Kế hoạch làm tiếp (theo thứ tự đề xuất)

1. **Cắm key + test Xưởng Clip tự động** → làm ra kho clip FAQ thật. *(Khánh đang lo)*
2. **Giải đọc comment ở console host** → cần Khánh thử 1 phiên live thật để tao soi cấu trúc trang (có WebSocket / khung chat không).
3. **Agent 2 chiều** → nút điều khiển ở Studio bấm được thật + agent báo trạng thái về web.
4. **Preview OBS + thống kê realtime** (Phase B, khó, để sau).

---

## 7. Cách KÍCH HOẠT phần tự động (Khánh làm)

1. **Lấy 2 API key:**
   - OpenAI: platform.openai.com → API keys → tạo key + **Billing nạp ~$5-10** + **Verify Organization** (Settings → Organization).
   - HeyGen: Settings → API → tạo key + **nạp ví ~$5-10** (Pay-As-You-Go).
2. **Cắm vào Vercel:** vercel.com → project **orderdonkoc** → Settings → Environment Variables → thêm `OPENAI_API_KEY` và `HEYGEN_API_KEY` (chọn cả 3 môi trường) → Save.
3. **Redeploy** (Deployments → Redeploy bản mới nhất).
4. Xong → vào **Module 5: Xưởng Clip** bấm 🪄 Tạo ảnh → 🎬 Tạo video → 🔄 Kiểm tra.

> ⚠️ 2 key này Khánh tự dán vào Vercel, tao KHÔNG cầm key thô — an toàn.

---

## 8. Chi phí (ước tính)

| Khoản | Giá |
|---|---|
| OpenAI tạo ảnh | ~$0.2–0.35/ảnh (chất lượng cao) · ~$0.01–0.02 (nháp) |
| HeyGen tạo video | tính theo lượt (Pay-As-You-Go) |
| **Cả kho ~20 clip FAQ** | **≈ vài đô tổng** (làm 1 lần xài nhiều tháng) |
| Vercel + Supabase | 0đ (đã có sẵn) |

---

## 9. Ràng buộc quan trọng (phải nhớ)

1. **Điều kiện đẩy OBS lên Shopee:** gian hàng cần **~10.000 follower** mới bật stream OBS/RTMP (cần verify). Chưa đủ thì tool xong cũng không đẩy live thật được.
2. **Luật Shopee:** CHO PHÉP livestream AI nhưng phải **xin duyệt + gắn nhãn "AI-generated"**. (TikTok thì CẤM → bản này CHỈ làm cho Shopee.)
3. **Đọc comment là phần mong manh nhất:** Shopee không có API comment chính thức → đọc DOM/WebSocket, dễ gãy khi Shopee đổi giao diện. Test bằng **tài khoản phụ**.
4. **DeepSeek KHÔNG tạo ảnh** (chỉ chữ) — ảnh phải OpenAI/Gemini.

---

## 10. Kỹ thuật (cho AI/dev đọc — Khánh bỏ qua được)

**Bảng Supabase:**
- `livestream_intents` (id, label, keywords[jsonb], clip, enabled, sort_order) — kho câu hỏi→clip.
- `livestream_config` (cooldown_sec, min_confidence, max_queue) — logic agent.
- `livestream_clip_prod` (intent_id, script, img_prompt, image_url, video_url, video_id, voice_id, status) — sản xuất clip.
- Storage bucket `live-assets` (public) — ảnh gen.

**File chính:**
- Web: `src/components/LivestreamAiTab.jsx` (M4), `LiveClipFactoryTab.jsx` (M5), `LiveStudioTab.jsx` (Studio).
- Backend tự động: `lib/liveai.js` (ngoài api/ để né trần 12 function Vercel) + 4 route `live_*` trong `api/tiktok-shop/analytics.js`.
- Agent: `livestream-ai/agent/src/{index,intent,orchestrator,obs,commentSource,faqSource}.js` + `config.json`.
- Extension: `livestream-ai/comment-reader/{manifest,content}.js`.

**API tự động (spec đã verify qua workflow):**
- OpenAI ảnh: `POST api.openai.com/v1/images/generations` (gpt-image-1, b64_json) · `/v1/images/edits` (ghép sản phẩm thật, input_fidelity=high).
- HeyGen (auth `X-Api-Key`): upload `POST upload.heygen.com/v1/talking_photo` (raw bytes) → `talking_photo_id`; tạo `POST api.heygen.com/v2/video/generate` → `video_id`; poll `GET api.heygen.com/v1/video_status.get?video_id=` → `video_url`; giọng `GET /v2/voices` lọc `language==='Vietnamese'`.

**OBS agent:** 2 scene `IDLE`/`ANSWER` + media source `ANSWER_PLAYER`; WebSocket bật (tắt auth); `is_local_file:true` bắt buộc để phát file local.

**Cách test agent nhanh:** `cd livestream-ai/agent && npm install && node src/index.js --mock` (gõ câu hỏi, nối OBS thật) hoặc thêm `--dry` (không cần OBS).

---

*File bàn giao ngắn: `TIEP-TUC.md`. Plan gốc: `PLAN_Livestream_AI_Shopee.md` (Desktop máy chủ).*
