# Thiết kế ứng dụng nhắn tin hẹn hò tìm hiểu chậm

## 1. Mục tiêu

Xây dựng một MVP có backend thật cho ứng dụng hẹn hò 18+, ưu tiên Android nhưng dùng chung codebase cho iOS, web và Windows. Sản phẩm không dùng luồng quẹt hồ sơ vô hạn. Hệ thống đề xuất một người phù hợp tại một thời điểm, cung cấp đủ tín hiệu để hai bên tự quyết định, rồi mở dần danh tính và tính năng theo mức đồng thuận.

MVP phục vụ tối đa khoảng 10.000 tài khoản và 1.000 người dùng hoạt động đồng thời. Đây là dự án học tập có cấu trúc đủ nghiêm túc để thử nghiệm giữa nhiều thiết bị thật.

## 2. Phạm vi MVP

MVP bao gồm:

- Đăng nhập bằng số điện thoại và OTP; email khôi phục là tùy chọn.
- Giới hạn toàn bộ sản phẩm cho người từ 18 tuổi.
- Xác minh danh tính và đối chiếu ảnh/liveness trước khi tìm kiếm.
- Tạo hồ sơ, ảnh đại diện, ảnh bổ sung, mô tả và dữ liệu cá nhân.
- Chọn tiêu chí giới tính, mục tiêu quan hệ, độ tuổi, khu vực, bán kính và sở thích.
- Đề xuất có giới hạn, đồng thuận hai chiều và một kết nối hoạt động tại một thời điểm.
- Chat realtime với hạn mức và quyền truy cập tăng dần theo ba giai đoạn.
- Push notification, chặn, báo cáo và trang quản trị kiểm duyệt tối thiểu.
- Backend, Oracle XE, MongoDB và object storage chạy được trong môi trường phát triển.

Ngoài phạm vi MVP:

- Người dùng 16–17 tuổi hoặc một chế độ dành cho trẻ vị thành niên.
- Quẹt hồ sơ vô hạn, gọi thoại/video, livestream, thanh toán và quảng cáo.
- Theo dõi GPS nền, hiển thị bản đồ hoặc chia sẻ vị trí thời gian thực.
- Phát nhạc trực tiếp hoặc tích hợp đầy đủ Spotify/Apple Music.
- Tối ưu giao diện riêng cho iOS, web và Windows; MVP chỉ yêu cầu giữ khả năng build kỹ thuật sau Android.

## 3. Công nghệ và kiến trúc

### 3.1 Client

- Flutter/Dart dùng chung codebase.
- Android là nền tảng triển khai và kiểm thử đầu tiên.
- REST dùng cho lệnh và truy vấn nghiệp vụ; WebSocket dùng cho tin nhắn và sự kiện realtime.
- Client không tự quyết định deadline, hạn mức hoặc trạng thái quan hệ. Mọi quyết định dựa trên thời gian và trạng thái do server trả về.

### 3.2 Backend

Backend là một NestJS/TypeScript modular monolith gồm các module:

- `auth`
- `identity`
- `profiles`
- `preferences`
- `locations`
- `matching`
- `connections`
- `chat`
- `media`
- `moderation`
- `notifications`
- `scheduler`

Các module giao tiếp qua interface và domain event. Chưa tách microservice trong MVP.

### 3.3 Lưu trữ

**Oracle XE** là nguồn sự thật cho dữ liệu quan hệ:

- Tài khoản, phiên đăng nhập và kết quả xác minh.
- Hồ sơ, tiêu chí, ảnh và metadata.
- Cây địa giới hành chính.
- Phiên tìm kiếm, đề xuất, kết nối và quyết định.
- Chặn, báo cáo, audit và transactional outbox.

**MongoDB** là nguồn sự thật cho chat:

- `chat_sessions`: giai đoạn, thời gian, cửa sổ, bộ đếm, quyền media và deadline.
- `messages`: mỗi tin là một document riêng, sắp thứ tự trong cuộc trò chuyện.
- Local outbox cho sự kiện chat cần đồng bộ sang Oracle hoặc notification worker.

**Object storage** lưu avatar, ảnh hồ sơ và media. Database chỉ lưu object key, checksum, MIME type, kích thước, trạng thái quét và metadata cần thiết.

Redis không nằm trong MVP. Chỉ bổ sung khi load test cho thấy cần scale nhiều WebSocket instance, cache hoặc presence.

Oracle XE 21c trong môi trường học tập bị giới hạn ở 2 CPU core, 2 GB RAM và 12 GB dữ liệu người dùng. Vì vậy Oracle không lưu binary media hoặc nội dung chat tăng không giới hạn. Hệ thống phải theo dõi dung lượng và có cảnh báo trước khi đạt ngưỡng; nâng cấp Oracle hoặc chuyển dữ liệu quan hệ là công việc vận hành riêng khi sản phẩm vượt quy mô MVP.

### 3.4 Khả năng thay thế database

Mọi truy cập dữ liệu đi qua repository interface. Không phát tán câu SQL, Mongo query hoặc kiểu dữ liệu độc quyền vào domain service. Tin nhắn dùng `MessageRepository`; một implementation khác như ScyllaDB có thể được thêm sau.

Việc chuyển kho dữ liệu vẫn cần sao chép, dual-write, đối chiếu và cutover. Abstraction làm giảm phần code phải sửa, không loại bỏ chi phí migration dữ liệu.

## 4. Người dùng, xác minh và hồ sơ

### 4.1 Điều kiện tham gia

Người dùng phải:

1. Xác minh số điện thoại bằng OTP.
2. Khai ngày sinh và đủ 18 tuổi.
3. Hoàn tất KYC.
4. Hoàn tất video selfie/liveness và đối chiếu với ảnh hồ sơ.
5. Có hồ sơ và tiêu chí bắt buộc trước khi tìm kiếm.

KYC đi qua `IdentityVerificationProvider`. MVP ưu tiên CCCD Việt Nam; giấy tờ nước ngoài là phần mở rộng. Hệ thống chỉ lưu trạng thái xác minh, nhà cung cấp, thời điểm và mã tham chiếu; không lưu ảnh CCCD hoặc video selfie thô nếu nhà cung cấp có thể xử lý thay.

### 4.2 Hồ sơ

Hồ sơ gồm:

- Tên hiển thị.
- Ngày sinh; chỉ tuổi hoặc khoảng tuổi được hiển thị tùy giai đoạn.
- Giới tính và giới tính muốn hẹn hò.
- Mục tiêu quan hệ.
- Chiều cao.
- Quê quán ở cấp tỉnh/thành phố.
- Khu vực đang sinh sống, có thể khai đến phường/xã.
- Vị trí GPS tùy chọn chỉ dùng làm snapshot khi tìm kiếm.
- Mô tả bản thân.
- Sở thích theo danh mục chuẩn hóa.
- Một bài nhạc yêu thích gồm tên bài và nghệ sĩ.
- Các câu trả lời cho prompt do hệ thống cung cấp.
- Một avatar và các ảnh hồ sơ bổ sung.

Prompt, tên bài nhạc và nội dung tự do không được chứa thông tin liên hệ, URL hoặc thông tin thanh toán.

## 5. Khu vực và tiêu chí ghép đôi

### 5.1 Cây địa giới

Khu vực dùng cấu trúc cha–con:

`Tỉnh/thành phố → quận/huyện → phường/xã`

Mỗi node có mã ổn định, loại và `parent_id`. Nếu người tìm chọn cấp tỉnh, mọi hồ sơ có khu vực sinh sống ở quận/phường thuộc tỉnh đó đều phù hợp. Logic tương tự áp dụng ở cấp quận/huyện.

Quê quán là trường hồ sơ; khu vực đang sinh sống là trường dùng để ghép đôi. Vị trí chi tiết không hiển thị cho đối phương.

### 5.2 GPS và bán kính tùy chọn

- Ứng dụng chỉ yêu cầu quyền vị trí khi người dùng chủ động bật tìm kiếm theo khoảng cách.
- Chỉ dùng quyền khi ứng dụng đang được sử dụng; MVP không xin quyền vị trí nền.
- Người dùng có thể cấp vị trí chính xác hoặc gần đúng theo khả năng của hệ điều hành.
- Người dùng chọn bán kính `5 / 10 / 25 / 50 / 100 km`.
- Snapshot vị trí hết hạn sau 24 giờ; muốn tiếp tục tìm theo khoảng cách phải cập nhật lại.
- Backend lưu geohash dùng lọc sơ bộ và tọa độ snapshot được bảo vệ dùng tính khoảng cách cho tập ứng viên đã rút gọn. Tọa độ không được đưa vào API thẻ hoặc log.
- Tọa độ snapshot bị xóa khi search session kết thúc, đề xuất được giải quyết hoặc hết hạn; proposal chỉ giữ dải khoảng cách đã tính.
- Nếu người dùng từ chối GPS, hệ thống tiếp tục dùng cây tỉnh/quận/phường.
- Không hiển thị tọa độ, bản đồ, hướng đi hoặc vị trí hành chính chi tiết của đối phương.

Khoảng cách phải nằm trong bán kính của cả hai người. Trên thẻ tương thích chỉ hiển thị một dải: dưới 2 km, 2–5 km, 5–10 km, 10–25 km, 25–50 km hoặc trên 50 km. Dải này chỉ xuất hiện khi cân nhắc đề xuất và không còn truy cập được sau khi kết nối được tạo.

### 5.3 Điều kiện cứng

Ứng viên phải vượt qua toàn bộ điều kiện sau theo thứ tự:

1. Cả hai đủ 18 tuổi, đã xác minh và có trạng thái hợp lệ.
2. Cả hai chưa có kết nối hoặc đề xuất độc quyền đang hoạt động.
3. Giới tính mong muốn tương thích hai chiều.
4. Mục tiêu quan hệ tương thích hai chiều.
5. Nếu cả hai bật GPS, khoảng cách thuộc bán kính của cả hai; nếu không, khu vực hành chính của mỗi người phải tương thích với tiêu chí người kia.
6. Khoảng tuổi mong muốn tương thích hai chiều.
7. Hai tài khoản chưa từng chặn nhau và không thuộc trường hợp an toàn bị loại.

Giới tính là tiêu chí nghiệp vụ được kiểm tra ưu tiên như yêu cầu sản phẩm, nhưng không thể bỏ qua các điều kiện bắt buộc còn lại.

### 5.4 Xếp hạng

Trong tập ứng viên hợp lệ, hệ thống tính điểm dựa trên:

- Số sở thích chung.
- Mức phù hợp của prompt và các tiêu chí mềm được bổ sung sau.
- Mức khớp địa lý nhưng không ưu tiên vị trí chính xác.
- Thời gian chờ, dùng làm tie-breaker để tăng tính công bằng.

Không hiển thị phần trăm tương thích giả chính xác. UI giải thích bằng các lý do cụ thể như “cùng muốn mối quan hệ lâu dài” hoặc “có ba sở thích chung”.

## 6. Tìm kiếm, đề xuất và đồng thuận ban đầu

### 6.1 Hàng chờ

Khi nhấn tìm kiếm:

1. Backend xác thực tài khoản đủ điều kiện.
2. Tạo snapshot tiêu chí trong `search_session`.
3. Tìm ứng viên hợp lệ và xếp hạng.
4. Nếu chưa có ai, giữ người dùng trong hàng chờ và tự tìm lại khi có ứng viên mới.
5. Khi có ứng viên, Oracle transaction khóa hai search session và tạo đúng một đề xuất độc quyền.

Thay đổi tiêu chí sẽ hủy search session cũ và tạo lượt tìm mới. Người dùng có thể hủy tìm bất cứ lúc nào.

### 6.2 Thẻ tương thích

Trước khi kết nối, mỗi người nhìn thấy:

- Huy hiệu đã xác minh 18+.
- Huy hiệu ảnh hồ sơ đã đối chiếu.
- Khoảng tuổi.
- Tỉnh/thành phố, không hiện quận/phường.
- Dải khoảng cách gần đúng tại thời điểm tạo đề xuất nếu cả hai dùng GPS.
- Mục tiêu quan hệ.
- Danh sách sở thích chọn lọc.
- Một bài nhạc yêu thích dưới dạng metadata, không tự phát nhạc.
- Một hoặc hai câu trả lời prompt.
- Các lý do cụ thể hệ thống đưa ra đề xuất.

Tên, avatar, ảnh khác, tọa độ, vị trí nhỏ hơn cấp tỉnh, chiều cao, quê quán, bio đầy đủ và thông tin liên hệ vẫn bị ẩn. Dải khoảng cách chỉ phục vụ quyết định trên thẻ; sau khi kết nối được tạo, nó biến mất khỏi UI và API chat.

### 6.3 Quyết định

- Mỗi người có thể chọn “Bắt đầu tìm hiểu” hoặc “Bỏ qua”.
- UI hỗ trợ cả nút bấm và cử chỉ: quẹt phải tương đương “Bắt đầu tìm hiểu”, quẹt trái tương đương “Bỏ qua”.
- “Bắt đầu tìm hiểu” yêu cầu một lời mở đầu tối đa 280 ký tự dựa trên sở thích, bài nhạc hoặc prompt.
- Lời mở đầu được kiểm duyệt và chỉ chuyển khi cả hai đồng ý.
- Chỉ khi cả hai đồng ý mới tạo kết nối độc quyền và rời hàng chờ.
- Tối đa ba đề xuất mỗi người trong 24 giờ; chỉ có một đề xuất chờ tại một thời điểm.
- Bỏ qua kết thúc đề xuất, không cho biết ai đã bỏ qua và không đề xuất lại cặp đó trong MVP.

### 6.4 Chờ phản hồi

Người đã đồng ý thấy “Đang chờ người kia phản hồi.” Sau mỗi 24 giờ, họ được hỏi có muốn chờ tiếp không:

- Nếu chưa bên nào đồng ý sau 24 giờ đầu, đề xuất tự hết hạn; không có quyền gia hạn vì chưa có người chủ động chờ.
- Chọn có: gia hạn thêm 24 giờ.
- Chọn không: hủy đề xuất và quay lại trạng thái chưa kết nối.
- Không trả lời câu hỏi gia hạn trong 24 giờ: coi như không và hủy đề xuất.
- Tổng thời gian từ lúc đề xuất được tạo không vượt quá 72 giờ, gồm cửa sổ ban đầu và tối đa hai lần gia hạn.

Khi đề xuất bị hủy, người còn lại thấy thông báo “Người được ghép nối với bạn đã hủy kết nối” vào lần tiếp theo mở ứng dụng và được hỏi có muốn tiếp tục tìm kiếm hay không.

Vì lời mở đầu là bắt buộc khi đồng ý, sau khi người thứ hai đồng ý thì cả hai đã có tin đầu tiên. Backend đặt `started_at`, chuyển hai lời mở đầu vào chat và hiển thị:

> Thời gian 2 ngày tìm hiểu của 2 bạn bắt đầu, hãy tận hưởng nhé.

Hai lời mở đầu được tính vào hạn mức của cửa sổ đầu tiên.

## 7. Máy trạng thái cuộc trò chuyện

### 7.1 Giai đoạn 1 — Ẩn danh

- Hai cửa sổ liên tiếp, mỗi cửa sổ 24 giờ tính từ `started_at`.
- Mỗi người được gửi tối đa 10 tin nhắn văn bản trong mỗi cửa sổ.
- Không gửi ảnh, file, URL hoặc thông tin liên hệ.
- Không hiện tên, avatar hoặc hồ sơ; chỉ hiện huy hiệu xác minh và nội dung thẻ tương thích đã được phép.
- Khi một người hết 10 tin, chỉ phía đó bị khóa gửi nhưng vẫn đọc được tin mới.
- Hiển thị: “Hãy kiên nhẫn, chậm lại và dành thời gian ngẫm nghĩ thêm về đối phương”.
- Hết cửa sổ đầu tiên, bộ đếm được đặt lại dù chưa dùng hết.
- Trong cửa sổ thứ hai, nếu cả hai đều gửi đủ 10 tin thì mở quyết định ngay. Nếu chưa, mở quyết định khi kết thúc cửa sổ thứ hai.

Trong lúc quyết định, chat chỉ đọc. Mỗi người có 24 giờ để chọn có hoặc không và thấy cảnh báo:

> Nếu một trong hai người không trả lời trong vòng 24 giờ, cuộc hội thoại sẽ tự động kết thúc và cả hai sẽ trở về trạng thái chưa kết nối.

Một câu trả lời không hoặc thiếu bất kỳ câu trả lời nào khi hết hạn sẽ kết thúc kết nối. Chỉ hai câu trả lời có mới chuyển giai đoạn.

### 7.2 Giai đoạn 2 — Mở avatar

- Avatar đã đối chiếu của hai người được hiển thị.
- Ba cửa sổ liên tiếp, mỗi cửa sổ 24 giờ.
- Mỗi người được gửi tối đa 30 tin nhắn trong mỗi cửa sổ.
- Các thông tin hồ sơ khác và media vẫn bị khóa.
- Trong cửa sổ thứ ba, nếu cả hai cùng gửi đủ 30 tin thì hỏi ngay: “Hai bạn có muốn nâng cấp mối quan hệ không?”. Nếu chưa đủ, hỏi khi kết thúc 72 giờ.
- Chat chuyển sang chỉ đọc và áp dụng deadline quyết định 24 giờ như giai đoạn 1.
- Một câu trả lời không hoặc thiếu câu trả lời khi hết hạn sẽ kết thúc kết nối.

### 7.3 Giai đoạn 3 — Đã nâng cấp

Khi cả hai đồng ý:

- Hiển thị tên, tuổi, chiều cao, quê quán cấp tỉnh/thành phố, bio, mục tiêu quan hệ và các ảnh hồ sơ còn lại.
- Không hiển thị số điện thoại, email, CCCD, địa chỉ chính xác, phường/xã đang sống hoặc vị trí thời gian thực.
- Cho phép media hợp lệ sau khi quét.
- Mỗi người được gửi tối đa 50 tin nhắn trong từng cửa sổ 24 giờ tính từ thời điểm nâng cấp.
- Giai đoạn kéo dài không giới hạn ngày và không còn câu hỏi nâng cấp định kỳ.
- Kết nối tồn tại đến khi một người chủ động kết thúc, chặn hoặc bị xử lý an toàn.

### 7.4 Kết thúc, chặn và báo cáo

Người dùng có thể kết thúc kết nối bất cứ lúc nào và chọn một lý do ngắn. Chặn hoặc báo cáo luôn khả dụng ở mọi giai đoạn. Hai tài khoản đã chặn nhau không bao giờ được ghép lại.

Việc đóng kết nối và giải phóng trạng thái hai thành viên là một Oracle transaction. Client nhận trạng thái đã đóng qua REST/WebSocket và không được tiếp tục gửi.

## 8. Tính nhất quán và xử lý lỗi

### 8.1 Nguyên tắc

- Mỗi thao tác có đúng một nguồn sự thật.
- Mọi command quan trọng có `idempotency_key`.
- Oracle và MongoDB có local transactional outbox riêng.
- Worker đồng bộ sự kiện ít nhất một lần; consumer phải idempotent.
- Deadline và cửa sổ dùng UTC từ server.

### 8.2 Các trường hợp bắt buộc

- Nhấn tìm nhiều lần chỉ tạo một search session hiệu lực.
- Hai tiến trình không thể ghép cùng một người nhờ constraint và transaction Oracle.
- Retry gửi tin không tạo tin trùng hoặc trừ hạn mức hai lần.
- MongoDB transaction kiểm tra phase, kiểm tra/tăng counter, cấp sequence và ghi message nguyên tử.
- Client hiển thị `pending`, `sent`, `failed`; khi reconnect truy vấn bằng idempotency key.
- WebSocket reconnect lấy mọi message sau `last_sequence` qua REST.
- Scheduler và job hết hạn chạy lại không tạo quyết định/thông báo trùng.
- Khi Oracle chưa kịp nhận phase mới, MongoDB vẫn là nguồn quyết định quyền chat.
- Gateway kiểm tra block trước mỗi lần gửi, kể cả khi sự kiện khóa chat chưa tới MongoDB.
- OTP/KYC lỗi giữ trạng thái chờ và không cấp quyền tìm kiếm.
- Media ở `processing` chỉ người gửi thấy; đối phương chỉ nhận sau khi quét thành công.

Lỗi phía người dùng phải có hành động cụ thể, ví dụ “Tin chưa được gửi, chạm để thử lại”, không hiển thị stack trace hoặc lỗi database.

## 9. An toàn, kiểm duyệt và quyền riêng tư

- Access token ngắn hạn; refresh token có thể thu hồi theo thiết bị.
- Rate limit OTP, đăng nhập, tìm kiếm, WebSocket và upload.
- HTTPS/WSS cho dữ liệu truyền; secret không nằm trong source code.
- Số điện thoại, email và định danh được mã hóa hoặc băm theo mục đích truy vấn.
- Hai giai đoạn đầu chặn URL, số điện thoại, email, tài khoản mạng xã hội và thông tin thanh toán.
- Nội dung liên quan đến xin tiền, OTP, tiền mã hóa hoặc kéo ra khỏi nền tảng được cảnh báo/chặn để kiểm tra.
- Phát hiện spam qua nội dung lặp, tốc độ thao tác, danh tính, số điện thoại và tín hiệu thiết bị.
- Media được kiểm tra MIME thực, kích thước, malware và nội dung không phù hợp.
- Báo cáo có thể gắn với message cụ thể; chặn có hiệu lực ngay.
- Trang quản trị cho phép xử lý hàng đợi báo cáo, khóa tài khoản và lưu audit.
- Moderator chỉ thấy dữ liệu cần cho vụ việc; mọi truy cập dữ liệu nhạy cảm được audit.
- Công bố điều khoản, quyền riêng tư, tiêu chuẩn chống xâm hại trẻ em, cơ chế báo cáo và đầu mối an toàn trước khi phát hành.

### 9.1 Lưu giữ dữ liệu

- Kết nối đang hoạt động giữ lịch sử để hai bên xem lại.
- Kết nối kết thúc bị ẩn ngay và dữ liệu chat mã hóa được giữ tối đa 90 ngày để xử lý khiếu nại, sau đó tự xóa.
- Dữ liệu thuộc báo cáo được giữ đến khi vụ việc hoàn tất hoặc hết thời hạn lưu giữ áp dụng.
- Xóa tài khoản kích hoạt xóa/anonymize; dữ liệu phục vụ điều tra được tách bằng `legal_hold`.
- Log kỹ thuật không chứa nội dung chat, OTP hoặc định danh nhạy cảm.

## 10. Thông báo

Notification provider là interface. Android có thể dùng FCM khi triển khai. Thông báo cần có cho:

- Có đề xuất mới.
- Đang chờ hoặc sắp hết hạn phản hồi.
- Đề xuất/kết nối bị hủy.
- Có tin nhắn mới nhưng không lộ nội dung nhạy cảm trên màn hình khóa theo mặc định.
- Mở quyết định quan hệ và sắp hết deadline.
- Media xử lý thành công hoặc thất bại.
- Báo cáo đã được tiếp nhận hoặc xử lý.

## 11. Kiểm thử

### 11.1 Các lớp kiểm thử

- Unit test cho matching, cây khu vực, counter, deadline và state machine.
- Repository integration test chạy trên Oracle XE và MongoDB dành riêng cho kiểm thử; không thay database bằng mock trong nhóm test này.
- API/WebSocket contract test dùng schema chung giữa Flutter và NestJS.
- Flutter widget test cho onboarding, thẻ tương thích, chat, chờ và quyết định.
- Android end-to-end test với hai tài khoản và backend thật.
- Concurrency test cho ghép đôi và tin cuối của từng hạn mức.
- Fake clock cho toàn bộ cửa sổ 24/48/72 giờ và deadline.
- Failure-recovery test khi Oracle, MongoDB, WebSocket hoặc worker ngắt giữa thao tác.
- Security test cho OTP brute force, token cũ, IDOR, upload giả MIME, liên hệ bị cấm và RBAC quản trị.
- Load test khoảng 1.000 WebSocket đồng thời trước khi quyết định thêm Redis.
- Migration test có thể dựng database trống và nâng cấp từ schema trước.

Unit test được phép dùng mock/fake để chạy nhanh. Yêu cầu database thật chỉ áp dụng cho repository integration test và end-to-end test liên quan.

### 11.2 Tiêu chí hoàn thành

- Android chạy trên emulator và ít nhất một thiết bị thật.
- Hai thiết bị đăng ký, xác minh, nhận đề xuất và chat realtime qua backend thật.
- Không tài khoản nào có hơn một đề xuất/kết nối độc quyền đang hoạt động.
- Các mốc 10 → 30 → 50 và quyền hiển thị hoạt động đúng.
- Retry/mất mạng không tạo message trùng hoặc trừ lượt hai lần.
- Chặn và báo cáo có hiệu lực ngay.
- Worker phục hồi outbox và deadline sau restart.
- Web và Windows build được ở mức kỹ thuật.
- Codebase giữ khả năng build iOS; build/ký/phát hành iOS cần macOS và Xcode.

## 12. Thứ tự triển khai dự kiến

1. Workspace, CI, cấu hình môi trường và schema migration.
2. Auth, OTP giả lập cho development và session.
3. Hồ sơ, cây khu vực, tiêu chí và KYC provider abstraction.
4. Matching, hàng chờ, thẻ tương thích và đồng thuận.
5. Chat text realtime, state machine, counter và scheduler.
6. Avatar/profile progressive disclosure.
7. Media/object storage và scanning pipeline.
8. Chặn, báo cáo, trang quản trị và audit.
9. Push notification, kiểm thử tải và hardening.
10. Android release candidate; sau đó xác nhận build web, Windows và iOS.

Chi tiết task, file và câu lệnh kiểm thử sẽ được xác định trong implementation plan sau khi đặc tả này được duyệt.
