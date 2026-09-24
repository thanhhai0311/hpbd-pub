# 🎂 Happy Birthday — thiệp sinh nhật tương tác

Trang web thiệp sinh nhật: kéo bật lửa để thắp 23 cây nến, thổi vào mic (hoặc bấm nút) để tắt nến,
sau đó ảnh của người được chúc mừng trượt lên và một chiếc vương miện rơi xuống đội đúng lên đầu.

Không cần build — chỉ là HTML/CSS/JS thuần.

## Chạy thử

Mở bằng một web server tĩnh bất kỳ (nên dùng server thay vì mở trực tiếp `file://`, vì nhạc nền
`hpbd.mp3` và mic cần chạy qua http/https):

```bash
python3 -m http.server 8000
# rồi mở http://localhost:8000
```

> Mẹo xem nhanh màn hình chúc mừng mà không cần thắp hết nến: mở DevTools → Console và chạy
>
> ```js
> document.getElementById("congrats").classList.remove("hidden");
> const f = document.getElementById("photoFrame");
> f.classList.add("photo-in");
> setTimeout(() => f.classList.add("crown-in"), 100);
> ```
>
> Muốn xem lại hiệu ứng rơi thì tải lại trang rồi chạy lại đoạn trên.

## 1. Thay ảnh

1. Copy ảnh của bạn vào cùng thư mục với `index.html`, ví dụ `photo.jpg`.
   - Nên dùng ảnh **dọc (tỉ lệ khoảng 3:4)**, chụp từ ngực trở lên, đầu nằm gần giữa ảnh
     và **phía trên đầu còn khoảng trống** để vương miện đậu vào.
   - Ảnh được hiển thị rộng khoảng 220px, nên chỉ cần rộng khoảng 600–900px là đủ nét.
2. Trong `index.html`, đổi `src` của thẻ `#photoImg`:

   ```html
   <img src="photo.jpg" alt="Ảnh của bạn" id="photoImg" class="photo-img">
   ```

3. (Tuỳ chọn) Xoá file `photo-placeholder.svg` nếu không dùng nữa.

## 2. Căn chỉnh vương miện cho khớp đầu

Vị trí và kích thước vương miện được chỉnh bằng 4 biến CSS trong thuộc tính `style` của
`#photoFrame` trong `index.html`:

```html
<div class="photo-frame" id="photoFrame"
     style="--crown-x: 50%; --crown-y: 26%; --crown-width: 54%; --crown-tilt: 0deg;">
```

| Biến            | Ý nghĩa                                                                                  | Giá trị cho ảnh mẫu |
| --------------- | ---------------------------------------------------------------------------------------- | ------------------- |
| `--crown-x`     | Tâm ngang của đầu, tính theo **% chiều rộng ảnh** (0% = mép trái, 100% = mép phải)       | `50%`               |
| `--crown-y`     | Vị trí **mép dưới** vương miện, tức đỉnh đầu, tính theo **% chiều cao ảnh** (0% = mép trên) | `26%`               |
| `--crown-width` | Độ rộng vương miện, tính theo **% chiều rộng ảnh**, xấp xỉ bề ngang đỉnh đầu               | `54%`               |
| `--crown-tilt`  | Góc nghiêng, dùng khi đầu trong ảnh bị nghiêng (âm = nghiêng trái, dương = nghiêng phải)   | `0deg`              |

Vì mọi giá trị đều tính theo % của ảnh, vương miện vẫn nằm đúng chỗ trên cả máy tính lẫn
điện thoại.

### Cách đo nhanh

1. Mở ảnh bằng một trình xem ảnh bất kỳ có hiện toạ độ con trỏ (Paint, Photoshop, GIMP,
   Preview…) và ghi lại **kích thước ảnh** `W × H`.
2. Đo 3 điểm:
   - **A** = tâm ngang của đầu → `xA`
   - **B** = đường chân tóc hoặc chỗ bạn muốn vành vương miện chạm đầu. Nên đặt thấp hơn
     đỉnh tóc một chút để vương miện trông như đang đội trên đầu → `yB`
   - **Bề ngang đầu** tại độ cao đó (từ mép tóc trái sang mép tóc phải) → `w`
3. Tính:

   ```
   --crown-x     = xA / W × 100%
   --crown-y     = yB / H × 100%
   --crown-width = w  / W × 100%  × 1.1   (to hơn đầu ~10% trông sẽ tự nhiên hơn)
   ```

   Ví dụ: ảnh 900×1200, đầu ở giữa `xA = 470`, vành đội tại `yB = 300`, đầu rộng `w = 420`
   → `--crown-x: 52%; --crown-y: 25%; --crown-width: 51%;`

4. Mở trang, chạy đoạn code trong phần *Chạy thử* để xem kết quả, rồi tinh chỉnh:
   - Vương miện **lơ lửng trên đầu** → tăng `--crown-y`
   - Vương miện **lún vào trán/mặt** → giảm `--crown-y`
   - **Lệch trái/phải** → chỉnh `--crown-x`
   - **Quá to/quá nhỏ** so với đầu → chỉnh `--crown-width`
   - **Đầu nghiêng** → chỉnh `--crown-tilt`, ví dụ `-8deg` hoặc `10deg`

> Mẹo: có thể chỉnh trực tiếp trong DevTools (tab Elements → chọn `#photoFrame` → sửa
> `style`) để thấy thay đổi ngay, ưng rồi mới chép giá trị vào `index.html`.

### Hiệu ứng rơi

Hiệu ứng nằm ở `@keyframes crown-drop` trong `style.css`: vương miện rơi từ trên xuống, chạm
đầu ở mốc **55%** của animation (0.85s), nảy nhẹ lên rồi nằm yên đúng vị trí `--crown-y`. Pháo
giấy và tiếng vỗ tay được bắn ra đúng lúc chạm đầu (`CROWN_HIT_MS` trong `script.js`).

Nếu đổi thời lượng animation (`0.85s`) hoặc mốc chạm (55%), hãy cập nhật lại
`CROWN_HIT_MS = thời lượng × mốc chạm` (ví dụ 850ms × 0.55 ≈ 470ms) để pháo giấy bắn ra khớp
lúc vương miện chạm đầu.

## 3. Tuỳ chỉnh khác

| Muốn đổi                 | Sửa ở đâu                                                        |
| ------------------------ | ---------------------------------------------------------------- |
| Lời chúc, tên            | `index.html`, phần `.congrats`                                   |
| Số nến (tuổi)            | `TOTAL_CANDLES` trong `script.js`                                |
| Nhạc nền                 | Thay file `hpbd.mp3` (giữ nguyên tên) hoặc đổi `BGM_FILE` trong `script.js`. Không có file thì trang tự phát giai điệu Happy Birthday tổng hợp |
| Hình vương miện          | Thay `crown.svg`. Nếu hình mới có tỉ lệ khác thì căn chỉnh lại theo mục 2 |
