// Sinh tệp dữ liệu cho kiểm thử: PDF tiếng Việt 2 trang (kiểm tra trích dẫn trang 1 và trang 2),
// PDF 21 MB (vượt giới hạn) và một tệp .exe giả.
import { createRequire } from "module";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const require = createRequire(path.join(ROOT, "backend/package.json"));
const PDFDocument = require("pdfkit");
const FONT = path.join(ROOT, "backend/assets/fonts/DejaVuSerif.ttf");
const BOLD = path.join(ROOT, "backend/assets/fonts/DejaVuSerif-Bold.ttf");

function writePdf(file, pages) {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ size: "A4", margin: 60 });
    const stream = fs.createWriteStream(file);
    stream.on("finish", resolve);
    doc.pipe(stream);
    pages.forEach((page, index) => {
      if (index > 0) doc.addPage();
      doc.font(BOLD).fontSize(15).text(page.title, { align: "center" }).moveDown();
      doc.font(FONT).fontSize(12);
      page.lines.forEach((line) => doc.text(line, { lineGap: 4 }).moveDown(0.4));
    });
    doc.end();
  });
}

export async function generateFixtures(outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  await writePdf(path.join(outDir, "bao-cao-tien-do.pdf"), [
    {
      title: "BÁO CÁO TIẾN ĐỘ TRIỂN KHAI PHÒNG HỌP KHÔNG GIẤY TỜ",
      lines: [
        "Đơn vị báo cáo: Phòng Công nghệ thông tin.",
        "1. Thiết bị: Đã lắp đặt 40 máy tính bảng tại phòng A101.",
        "2. Kinh phí đã sử dụng: 420 triệu đồng / 600 triệu đồng dự toán.",
        "3. Đào tạo: Đã tập huấn sử dụng hệ thống cho 35 cán bộ của Khoa Công nghệ thông tin."
      ]
    },
    {
      title: "ĐỀ XUẤT KẾ HOẠCH QUÝ IV",
      lines: [
        "4. Đề xuất mở rộng mô hình phòng họp không giấy tờ sang phòng B202 trong quý IV.",
        "5. Kinh phí dự kiến cho phòng B202: 180 triệu đồng, lấy từ phần dự toán còn lại.",
        "6. Thời gian dự kiến hoàn thành lắp đặt tại phòng B202: ngày 15/11/2026.",
        "Nội dung cần xin ý kiến: thông qua kế hoạch mở rộng sang phòng B202."
      ]
    }
  ]);
  await writePdf(path.join(outDir, "ke-hoach-chuyen-doi-so.pdf"), [
    {
      title: "KẾ HOẠCH CHUYỂN ĐỔI SỐ QUÝ IV NĂM 2026",
      lines: [
        "1. Số hoá 100% hồ sơ cuộc họp cấp khoa trước ngày 31/12/2026.",
        "2. Áp dụng biên bản điện tử có ký số cho các cuộc họp giao ban.",
        "3. Tổ chức 2 đợt tập huấn cho cán bộ, giảng viên trong tháng 10 và tháng 11."
      ]
    }
  ]);
  // Đầu tệp vẫn là chữ ký %PDF để chắc bị chặn vì dung lượng chứ không vì định dạng.
  const big = Buffer.alloc(21 * 1024 * 1024, 0x20);
  Buffer.from("%PDF-1.4\n").copy(big);
  fs.writeFileSync(path.join(outDir, "qua-lon-21mb.pdf"), big);
  fs.writeFileSync(path.join(outDir, "cai-dat.exe"), Buffer.from("MZ fake executable"));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await generateFixtures(path.join(HERE, "files"));
  console.log("Đã sinh tệp kiểm thử vào", path.join(HERE, "files"));
}
