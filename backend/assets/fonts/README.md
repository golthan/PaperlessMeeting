# Font dùng để xuất PDF biên bản

`DejaVuSerif.ttf` và `DejaVuSerif-Bold.ttf` thuộc bộ **DejaVu Fonts** (nguồn:
https://dejavu-fonts.github.io), phát hành theo giấy phép Bitstream Vera Fonts
Copyright + Public Domain — cho phép sử dụng, phân phối lại và **nhúng vào tài
liệu PDF** kể cả cho mục đích thương mại.

## Vì sao cần font này

PDFKit mặc định dùng Helvetica với bảng mã WinAnsi, mỗi ký tự một byte. Các chữ
tiếng Việt nằm ngoài Latin-1 như `ả (U+1EA3)`, `ộ (U+1ED9)`, `ệ (U+1EC7)` cần
hai byte nên bị tách thành hai ký tự rác khi in ra PDF. Nhúng một font TrueType
có đủ ký tự tiếng Việt là cách duy nhất để biên bản hiển thị đúng.

PDFKit tự tạo subset (chỉ nhúng những glyph thực sự dùng) và sinh bảng ToUnicode,
nên file PDF chỉ khoảng 37KB mà chữ vẫn bôi đen, sao chép và tìm kiếm được.

## Thay bằng font khác

Muốn dùng Times New Roman cho đúng thể thức văn bản hành chính, chép hai file
`.ttf` vào thư mục này rồi sửa đường dẫn trong
`backend/src/modules/minutes/minutes.pdf.js`. Lưu ý Times New Roman là font có
bản quyền của Microsoft, không được phát hành kèm mã nguồn.
