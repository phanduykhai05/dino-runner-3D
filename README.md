# 3D Dino Runner

Game khủng long chạy bộ dùng Three.js và Vite.

## Nhân vật

- **T-Rex Sọc**: thân liền, đầu lớn, da nâu cam sọc đen và móng vuốt.
- **Rex Rừng**: biến thể T-Rex với màu da xanh ô liu.
- **Ba Sừng**: Triceratops có yếm cổ đỏ, sừng ngà và da sần.
- **Cổ Dài**: Brachiosaurus với cổ cao và da có đốm.
- **Gai Tấm**: Stegosaurus với các phiến lưng và gai đuôi.

Mô hình GLB có texture màu, normal và độ nhám. Mỗi mẫu được tối ưu còn
khoảng 55.000 tam giác; bốn mẫu khủng long khoảng 9 MB. Game nạp chúng trước khi
chơi, hiển thị tiến trình tải và dùng tài nguyên cục bộ. Khớp xương điều khiển
chân, cổ và đuôi trên cùng một bề mặt liền. Góc chọn nhân vật nhìn từ phía
trước; khi bắt đầu, camera chuyển ra phía sau để nhìn đường chạy.

Chim bay Pteranodon dùng mô hình có bộ xương và hoạt cảnh bay sẵn, phối hợp
đập cánh và lượn, nghiêng thân nhẹ, mỗi con một nhịp. Mẫu chim và hoạt cảnh khoảng 4 MB
được lưu cùng game; dùng cho cả đàn trên trời và chướng ngại vật bay sát đường.
Vùng va chạm nằm ở thân, ổn định trong lúc cánh vỗ. Nguồn và giấy phép CC BY 4.0
của Chistodrako._. / Oscar López Riviello nằm trong trang nguồn mô hình của game.

Xương rồng có thân và nhánh cong bo tròn, gân nổi, da sần, cụm gai nhỏ và màu xanh
tự nhiên. Phần thân dùng cùng vùng va chạm trong chơi đơn và online; gai mảnh là
chi tiết trang trí. Mây dùng thể tích 3D với mật độ không đều, viền mềm và ánh sáng
theo độ dày, trôi chậm theo gió và đổi sắc khi chuyển ngày/đêm. Các chi tiết này
được tạo trong game, không cần tải thêm mô hình hay hình ảnh từ bên ngoài.

Đường chạy dùng đất nện với hạt cát, sạn nhỏ và vệt mòn. Mép đường hòa vào nền đất
hai bên thay vì kết thúc ở một dải phẳng. Texture giữ kích thước hạt đất và cuộn
theo quãng đường chạy, kể cả khi chuyển từ chơi đơn sang 5 làn. Sỏi nhỏ có hình
dáng, màu khoáng và kích thước khác nhau; đá lớn nằm ngoài lề. Đá là chi tiết
trang trí, không tham gia va chạm. Các viên đá được vẽ theo nhóm để giảm số lượt vẽ.

Trên đường có các vũng nước nông với mép đất ướt, gợn sóng và phản chiếu màu trời,
ánh mặt trời theo chu kỳ ngày/đêm. Chạy qua nước vẫn tiếp tục cộng điểm và giữ tốc
độ bình thường. Nước là chi tiết mặt đường, được sinh giống nhau theo vị trí thế
giới cho mọi người trong phòng, và không thuộc danh sách vật cản gây chết.

Nguồn mô hình: [Grab3D](https://grab3d.com/), giấy phép **CC0 1.0**.
Đây là các mô hình có hỗ trợ AI theo công bố của nguồn. Chi tiết nguồn,
giấy phép và các thay đổi nằm trong [public/models/CREDITS.md](public/models/CREDITS.md).

## Điều khiển

- **Chọn nhân vật**: các nút ở dưới màn hình.
- **Đổi làn**: ← / → hoặc A / D; có thể đổi làn khi đang nhảy.
- **Nhảy**: Space, ↑, W hoặc chạm màn hình.
- **Cúi**: giữ ↓ / S. Dùng chuột có thể giữ phần dưới màn hình để cúi.
- **Điện thoại**: vuốt trái/phải để đổi làn, vuốt lên để nhảy, vuốt xuống để cúi 0,65 giây.
- **Đổi góc nhìn**: V hoặc nút Góc nhìn.
- **Tạm dừng / tiếp tục**: P.
- **Chơi lại**: Space hoặc nút chơi lại.

Chơi đơn có 3 làn; online có 5 làn chung. Nhân vật chuyển ngang trong khoảng
0,22 giây, không dịch chuyển tức thời. Chướng ngại vật nằm ở từng làn và mỗi hàng
luôn chừa ít nhất một làn trống. Va chạm dùng vị trí ngang thực tế, kể cả khi
nhân vật đang chuyển giữa hai làn. Người chơi không va chạm với nhau; nhân vật
khác hiện mờ khi trùng vị trí để vẫn nhìn rõ nhân vật của mình.

Container thép cao chặn từng làn, có gân thép, cửa khóa, sơn cũ và sọc cảnh báo.
Phải đổi làn để né container; nhảy hoặc cúi không vượt qua được. Container xuất
hiện từ những hàng đầu và nhiều hơn khi độ khó tăng. Tốc độ tăng đều từ 1× đến
tối đa 2,75× trong khoảng 90 giây chạy liên tục; mức tốc độ hiện cạnh tên buổi trời.
Các hàng chướng ngại vật cũng dày dần theo thời gian. Mỗi hàng vẫn chừa ít nhất
một làn trống, và khoảng cách giữa các hàng tính theo tốc độ cùng chiều dài
container để còn đủ thời gian phản ứng và đổi làn. Chơi đơn và online dùng chung
luật tăng tốc, sinh chướng ngại vật và va chạm container.

Bầu trời chuyển mượt theo chu kỳ 4 phút: **bình minh → ban ngày → hoàng hôn → đêm
→ bình minh**. Mặt trời chạy theo vòng cung, ánh sáng và bóng đổ thay đổi, bầu trời
đổi màu dần, rồi trăng và sao xuất hiện. Khi chơi đơn, phím P dừng cả đồng hồ trời.
Trong phòng online, mọi người dùng chung thời gian trận từ máy chủ; chu kỳ trời
vẫn tiếp tục khi một người đang chờ hồi sinh hoặc đang xem người khác.

## Chạy

```sh
npm install
npm run dev
```

Mở `http://localhost:5173`. Lệnh này chạy cả Vite và máy chủ WebSocket `/ws`.
Nếu cổng đã được dùng, đổi bằng `PORT=5180 npm run dev`.

## Chơi online qua Internet

1. Mỗi người mở cùng địa chỉ game, nhập tên và chọn khủng long.
2. Một người chọn **Tạo phòng mới**, gửi mã 6 ký tự cho tối đa 4 người bạn.
3. Các bạn nhập mã, nhấn **Vào phòng** rồi **Sẵn sàng**. Chủ phòng nhấn **Bắt đầu**.
4. Sau đếm ngược 3 giây, mỗi người xuất phát ở một làn rồi được đổi giữa 5 làn.
   Cùng phòng dùng chung chướng ngại vật, tốc độ, thời điểm bắt đầu và chu kỳ trời.
5. Bảng hạng cập nhật điểm, thứ hạng, trạng thái từng người trong ván hiện tại.
   Nhấn tên để theo dõi góc nhìn của người đó; **Về tôi** quay về nhân vật của mình.
   Phím **V** đổi giữa toàn cảnh, theo người chơi và sau lưng.

Đây là chế độ chạy liên tục để tích điểm. Ai va chạm sẽ chờ **3 giây** rồi tự hồi
sinh trên đường chạy hiện tại, giữ nguyên điểm đã kiếm được. Trong lúc chờ,
người đó không được cộng điểm; những người còn sống vẫn chạy và cộng điểm bình
thường. Kể cả khi tất cả cùng chết, cuộc đua vẫn tiếp tục và từng người hồi sinh
theo thời điểm của mình. Khi hồi sinh có 1 giây bảo vệ để tránh xuất hiện ngay
trong chướng ngại vật. Camera tự trở về nhân vật của bạn khi hồi sinh.
Người vào giữa cuộc đua chơi ngay từ 0 điểm. Bảng hạng dựa trên điểm thực kiếm
được, không cộng quãng đường bỏ lỡ lúc chết. Ván online không tạm dừng bằng phím P.
Mất mạng sẽ tự kết nối lại, giữ chỗ trong 30 giây. Chủ phòng rời/mất kết nối thì
quyền chủ phòng chuyển cho người đang kết nối.

Máy chủ tính chuyển động, va chạm, điểm và hạng ở 60 bước/giây, gửi trạng thái
20 lần/giây. Trình duyệt dự đoán chuyển động của mình và nội suy người khác để
giảm giật khi có độ trễ. Client chỉ gửi thao tác, không gửi điểm. Phòng và hạng
của cuộc đua nằm trong bộ nhớ; khởi động lại máy chủ sẽ xóa các phòng. Chưa có tài khoản
hay bảng hạng tích lũy qua nhiều ván.

### Máy chủ công khai

```sh
npm ci
npm run build
PORT=3001 npm start
```

Phục vụ HTTPS và chuyển tiếp WebSocket `/ws` đến cùng máy chủ Node, giữ nguyên
header `Host`. Khi truy cập bằng HTTPS, game tự dùng `wss://` trên cùng tên miền.
Không dùng hosting chỉ hỗ trợ file tĩnh cho phần online. `/health` dùng để kiểm tra
dịch vụ. Máy chủ production chỉ phục vụ thư mục `dist`, không phục vụ mã nguồn.

Cũng có thể build/chạy bằng Docker:

```sh
docker build -t dino-runner .
docker run --rm -p 3001:3001 dino-runner
```

Để thử qua Internet khi chưa có tên miền, cài `cloudflared` theo
[hướng dẫn Cloudflare](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/),
chạy bản production ở trên, rồi mở terminal khác:

```sh
cloudflared tunnel --url http://localhost:3001
```

Gửi địa chỉ HTTPS được in ra cho bạn bè. Đây là link thử tạm thời, cần giữ máy chủ
và `cloudflared` chạy; địa chỉ thay đổi khi mở tunnel mới. Bản dùng lâu dài cần
máy chủ luôn bật và một tên miền cố định.

Biến môi trường: `PORT` (mặc định 3001 production, 5173 dev), `HOST` (mặc định
`0.0.0.0`), `ALLOWED_ORIGINS` (danh sách HTTPS origin cách nhau bằng dấu phẩy nếu
proxy đổi Host). Chỉ đặt `VITE_WS_URL` lúc build khi WebSocket chạy ở địa chỉ khác;
thông thường để trống để dùng cùng origin với trang game.

## Build

```sh
npm run build
npm run preview
```

Kiểm tra hoạt cảnh chim, hình học và va chạm xương rồng, phòng 5 người, quyền chủ phòng, đếm ngược,
hồi sinh sau 3 giây, giữ điểm lúc chờ, xếp hạng, kết nối lại, lề đường và cuộn sỏi đá:

```sh
npm test
```
