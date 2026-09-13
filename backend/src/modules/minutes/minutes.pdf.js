import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { formatMeetingTime } from "../../utils/datetime.js";

/**
 * Xuất biên bản ra PDF.
 *
 * Điểm quan trọng: PDFKit mặc định dùng font Helvetica với bảng mã WinAnsi
 * (1 byte/ký tự) nên các chữ như "ả", "ộ", "ệ" bị vỡ. Vì vậy phải nhúng một
 * font TrueType có đủ ký tự tiếng Việt. Ở đây dùng DejaVu Serif (giấy phép tự
 * do, cho phép nhúng và phát hành lại). PDFKit tự tạo subset và bảng ToUnicode
 * nên file nhẹ và vẫn bôi đen / tìm kiếm được chữ.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fontsDir = path.resolve(__dirname, "../../../assets/fonts");

export const MINUTES_FONT_REGULAR = path.join(fontsDir, "DejaVuSerif.ttf");
export const MINUTES_FONT_BOLD = path.join(fontsDir, "DejaVuSerif-Bold.ttf");

/** Có sẵn font tiếng Việt hay không — dùng để báo lỗi cấu hình sớm. */
export function hasVietnameseFonts() {
  return fs.existsSync(MINUTES_FONT_REGULAR) && fs.existsSync(MINUTES_FONT_BOLD);
}

const PAGE_MARGIN = 56;

function drawHeader(doc, meeting) {
  doc.font("vn-bold").fontSize(11).text("CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM", {
    align: "center"
  });
  doc.font("vn-bold").fontSize(10).text("Độc lập - Tự do - Hạnh phúc", { align: "center" });
  const lineY = doc.y + 3;
  doc
    .moveTo(doc.page.width / 2 - 70, lineY)
    .lineTo(doc.page.width / 2 + 70, lineY)
    .lineWidth(0.8)
    .stroke();

  doc.moveDown(1.6);
  doc.font("vn-bold").fontSize(16).text("BIÊN BẢN CUỘC HỌP", { align: "center" });
  doc.moveDown(0.3);
  doc.font("vn").fontSize(12).text(meeting.title, { align: "center" });
  doc.moveDown(1.2);
}

/** In phần thân: dòng bắt đầu bằng "## " là tiêu đề mục nên in đậm. */
function drawBody(doc, content) {
  const lines = String(content || "").replace(/\r\n/g, "\n").split("\n");
  for (const line of lines) {
    if (line.trim().length === 0) {
      doc.moveDown(0.5);
      continue;
    }
    if (line.startsWith("## ")) {
      doc.moveDown(0.4);
      doc.font("vn-bold").fontSize(12).text(line.slice(3).trim(), { align: "left" });
      doc.moveDown(0.2);
      continue;
    }
    doc.font("vn").fontSize(11).text(line, {
      align: "left",
      indent: line.startsWith("   ") ? 12 : 0
    });
  }
}

/** Khối chữ ký số: ai ký, chức danh, thời điểm và trạng thái kiểm tra. */
function drawSignatures(doc, integrity) {
  doc.moveDown(1.2);
  doc.font("vn-bold").fontSize(12).text("CHỮ KÝ SỐ");
  doc.moveDown(0.4);

  if (!integrity.signed) {
    doc
      .font("vn")
      .fontSize(11)
      .fillColor("#8a5a06")
      .text("Biên bản chưa được ký số.")
      .fillColor("#000000");
    return;
  }

  const columnWidth = (doc.page.width - PAGE_MARGIN * 2) / 2 - 10;
  const startY = doc.y;
  let maxBottom = startY;

  integrity.signatures.forEach((signature, index) => {
    const x = PAGE_MARGIN + (index % 2) * (columnWidth + 20);
    const y = startY + Math.floor(index / 2) * 96;

    doc.font("vn-bold").fontSize(11).text(signature.signerTitle.toUpperCase(), x, y, {
      width: columnWidth,
      align: "center"
    });
    doc
      .font("vn")
      .fontSize(9.5)
      .fillColor(signature.valid ? "#1f6b41" : "#a32f1f")
      .text(
        signature.valid
          ? "(Đã ký số - chữ ký hợp lệ)"
          : `(Chữ ký không hợp lệ: ${signature.reason})`,
        x,
        doc.y + 2,
        { width: columnWidth, align: "center" }
      )
      .fillColor("#000000");
    doc.font("vn").fontSize(9).text(
      `Ký lúc ${formatMeetingTime(signature.signedAt)}`,
      x,
      doc.y + 2,
      { width: columnWidth, align: "center" }
    );
    doc.moveDown(1.4);
    doc.font("vn-bold").fontSize(11).text(signature.signerName, x, doc.y, {
      width: columnWidth,
      align: "center"
    });

    maxBottom = Math.max(maxBottom, doc.y);
    doc.y = y;
  });

  doc.y = maxBottom + 16;
  doc.x = PAGE_MARGIN;
}

/** Chân trang xác thực: mã tra cứu, mã băm và QR trỏ tới trang kiểm tra. */
function drawVerification(doc, { minutes, integrity, verificationUrl, qrBuffer }) {
  doc.moveDown(0.8);
  const boxTop = doc.y;
  const boxHeight = 96;
  if (boxTop + boxHeight > doc.page.height - PAGE_MARGIN) {
    doc.addPage();
  }

  const top = doc.y;
  const width = doc.page.width - PAGE_MARGIN * 2;
  doc
    .roundedRect(PAGE_MARGIN, top, width, boxHeight, 6)
    .lineWidth(0.8)
    .strokeColor("#c7d7dd")
    .stroke()
    .strokeColor("#000000");

  if (qrBuffer) {
    doc.image(qrBuffer, PAGE_MARGIN + 10, top + 10, { fit: [76, 76] });
  }

  const textX = PAGE_MARGIN + 100;
  const textWidth = width - 110;
  doc.font("vn-bold").fontSize(10).text("XÁC THỰC BIÊN BẢN ĐIỆN TỬ", textX, top + 12, {
    width: textWidth
  });
  doc.font("vn").fontSize(9).text(
    `Mã tra cứu: ${minutes.verification_code || "(chưa ban hành)"}`,
    textX,
    doc.y + 2,
    { width: textWidth }
  );
  doc.font("vn").fontSize(8).text(`Mã băm SHA-256: ${integrity.currentHash}`, textX, doc.y + 2, {
    width: textWidth
  });
  doc.font("vn").fontSize(8).text(
    `Quét mã QR hoặc truy cập ${verificationUrl} để kiểm tra tính toàn vẹn.`,
    textX,
    doc.y + 2,
    { width: textWidth }
  );

  doc.y = top + boxHeight + 8;
}

/**
 * Sinh PDF và ghi thẳng vào response.
 * Phải chuẩn bị QR trước vì tạo QR là thao tác bất đồng bộ.
 */
export async function streamMinutesPdf(res, { minutes, meeting, integrity, verificationUrl }) {
  const qrBuffer = verificationUrl
    ? await QRCode.toBuffer(verificationUrl, { margin: 1, width: 240 })
    : null;

  const doc = new PDFDocument({ margin: PAGE_MARGIN, size: "A4", bufferPages: true });
  doc.registerFont("vn", MINUTES_FONT_REGULAR);
  doc.registerFont("vn-bold", MINUTES_FONT_BOLD);

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="bien-ban-${minutes.verification_code || minutes.id}.pdf"`
  );
  doc.pipe(res);

  drawHeader(doc, meeting);
  drawBody(doc, minutes.content);

  if (minutes.conclusion) {
    doc.moveDown(0.6);
    doc.font("vn-bold").fontSize(12).text("KẾT LUẬN");
    doc.font("vn").fontSize(11).text(minutes.conclusion);
  }

  drawSignatures(doc, integrity);
  drawVerification(doc, { minutes, integrity, verificationUrl, qrBuffer });

  // Đánh số trang ở chân mỗi trang.
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    doc
      .font("vn")
      .fontSize(8)
      .fillColor("#647b86")
      .text(
        `Trang ${i - range.start + 1}/${range.count}`,
        PAGE_MARGIN,
        doc.page.height - PAGE_MARGIN + 12,
        { width: doc.page.width - PAGE_MARGIN * 2, align: "right" }
      )
      .fillColor("#000000");
  }

  doc.end();
}
