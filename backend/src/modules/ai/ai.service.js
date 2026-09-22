import fs from "fs";
import Anthropic from "@anthropic-ai/sdk";
import { env } from "../../config/env.js";
import { badRequest } from "../../utils/httpError.js";
import { resolveUploadPath } from "../../utils/file.js";

/**
 * Trợ lý AI cho tài liệu cuộc họp: tóm tắt và hỏi đáp có trích dẫn.
 *
 * Cách hoạt động: file PDF được gửi thẳng cho Claude dưới dạng khối "document"
 * (base64), không cần thư viện bóc tách chữ. Với chức năng hỏi đáp, bật
 * `citations` để mô hình trả lời kèm đoạn trích và số trang — người dùng biết
 * câu trả lời lấy từ đâu, tránh việc AI bịa nội dung.
 *
 * Không cấu hình ANTHROPIC_API_KEY thì các API AI trả lỗi rõ ràng, phần còn
 * lại của hệ thống vẫn chạy bình thường.
 */

// Giới hạn của API: 32MB cho một request. Base64 làm phình ~4/3 nên chặn ở 20MB.
const MAX_FILE_BYTES = 20 * 1024 * 1024;

export function isAiConfigured() {
  return Boolean(env.anthropicApiKey);
}

function getClient() {
  if (!isAiConfigured()) {
    throw badRequest(
      "Chưa cấu hình ANTHROPIC_API_KEY trong backend/.env nên chưa dùng được tính năng AI"
    );
  }
  return new Anthropic({ apiKey: env.anthropicApiKey });
}

/** Đọc file trong thư mục uploads và dựng khối nội dung gửi cho mô hình. */
function buildDocumentBlock(document, { withCitations = false } = {}) {
  const absolutePath = resolveUploadPath(document.file_path);
  const stat = fs.statSync(absolutePath);
  if (stat.size > MAX_FILE_BYTES) {
    throw badRequest("Tài liệu quá lớn để gửi cho AI (giới hạn 20MB)");
  }

  const mime = String(document.mime_type || "").toLowerCase();
  const name = String(document.original_name || "").toLowerCase();
  const isPdf = mime === "application/pdf" || name.endsWith(".pdf");
  const isText = mime.startsWith("text/");

  if (!isPdf && !isText) {
    throw badRequest(
      "Hiện chỉ tóm tắt và hỏi đáp được tài liệu PDF hoặc văn bản thuần. " +
        "File Word/PowerPoint/Excel cần chuyển sang PDF trước."
    );
  }

  const block = isPdf
    ? {
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: fs.readFileSync(absolutePath).toString("base64")
        },
        title: document.display_name
      }
    : {
        type: "document",
        source: {
          type: "text",
          media_type: "text/plain",
          data: fs.readFileSync(absolutePath, "utf8")
        },
        title: document.display_name
      };

  if (withCitations) block.citations = { enabled: true };
  return block;
}

/**
 * Gọi Messages API.
 *
 * Bật sẵn cơ chế dự phòng phía máy chủ (server-side fallback): nếu mô hình từ
 * chối trả lời vì lý do an toàn, Anthropic tự chạy lại yêu cầu trên mô hình
 * dự phòng trong cùng lời gọi. Nếu tài khoản chưa bật beta này thì API trả 400,
 * lúc đó thử lại một lần không kèm tham số dự phòng để tính năng vẫn chạy.
 */
/**
 * Đổi lỗi thô của SDK thành thông báo người dùng hiểu được.
 *
 * Không làm việc này thì khoá sai sẽ đẩy nguyên khối JSON của Anthropic ra
 * giao diện, người dùng không biết phải sửa ở đâu.
 */
function friendlyAiError(error) {
  const status = error?.status;
  if (status === 401 || status === 403) {
    return badRequest(
      "ANTHROPIC_API_KEY không hợp lệ. Kiểm tra lại khoá trong backend/.env " +
        "(khoá thật có dạng sk-ant-api03-...) rồi khởi động lại backend."
    );
  }
  if (status === 429) {
    return badRequest("Đã chạm giới hạn gọi API của Anthropic, thử lại sau ít phút");
  }
  if (status === 402) {
    return badRequest("Tài khoản Anthropic hết hạn mức, cần nạp thêm để dùng tính năng AI");
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return badRequest("Không kết nối được tới Anthropic, kiểm tra đường truyền mạng");
  }
  return error;
}

async function callClaude(params) {
  const client = getClient();
  try {
    return await client.beta.messages.create({
      ...params,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default"
    });
  } catch (error) {
    const message = String(error?.message || "");
    const isFallbackIssue =
      error instanceof Anthropic.BadRequestError &&
      /fallback|beta/i.test(message);
    if (!isFallbackIssue) throw friendlyAiError(error);

    try {
      return await client.messages.create(params);
    } catch (retryError) {
      throw friendlyAiError(retryError);
    }
  }
}

/** Gom các khối text trong câu trả lời thành một chuỗi. */
function extractText(response) {
  return response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();
}

/** Lấy trích dẫn (đoạn trích + số trang) để hiển thị dưới câu trả lời. */
function extractCitations(response) {
  const citations = [];
  for (const block of response.content) {
    if (block.type !== "text" || !Array.isArray(block.citations)) continue;
    for (const citation of block.citations) {
      citations.push({
        citedText: citation.cited_text,
        documentTitle: citation.document_title || null,
        startPage: citation.start_page_number ?? null,
        endPage: citation.end_page_number ?? null
      });
    }
  }
  return citations;
}

/** Câu trả lời bị từ chối vì lý do an toàn thì báo cho người dùng biết. */
function assertNotRefused(response) {
  if (response.stop_reason === "refusal") {
    throw badRequest(
      `Mô hình từ chối xử lý tài liệu này${
        response.stop_details?.category ? ` (${response.stop_details.category})` : ""
      }`
    );
  }
}

const SUMMARY_SYSTEM = `Bạn là thư ký cuộc họp của một cơ quan nhà nước Việt Nam.
Nhiệm vụ: tóm tắt tài liệu để đại biểu nắm nhanh trước khi thảo luận.
Yêu cầu:
- Viết bằng tiếng Việt, văn phong hành chính, ngắn gọn.
- Bắt đầu bằng 1-2 câu nêu tài liệu này nói về việc gì.
- Sau đó liệt kê tối đa 6 gạch đầu dòng cho các nội dung chính, số liệu quan trọng và đề xuất cần quyết định.
- Nếu tài liệu có nội dung cần biểu quyết hoặc cần xin ý kiến, nêu rõ ở cuối.
- Chỉ dùng thông tin có trong tài liệu, không suy diễn thêm.`;

const DISCUSSION_SYSTEM = `Bạn là thư ký cuộc họp của một cơ quan nhà nước Việt Nam.
Nhiệm vụ: đọc toàn bộ trao đổi trong phòng họp và dựng phần "Diễn biến và ý kiến thảo luận"
của biên bản.
Yêu cầu:
- Viết bằng tiếng Việt, văn phong hành chính, xưng hô trung lập (không dùng "tôi", "bạn").
- Gom ý kiến theo CHỦ ĐỀ, không thuật lại từng tin nhắn theo thứ tự thời gian.
- Trình bày đúng bốn mục sau, mỗi mục là một đề mục in đậm:
  **Các nội dung đã trao đổi** - mỗi chủ đề một gạch đầu dòng, nêu rõ ai nêu ý kiến gì.
  **Điểm đã thống nhất** - những việc mọi người đồng thuận.
  **Điểm còn ý kiến khác nhau** - nêu các luồng ý kiến trái chiều và người đại diện từng luồng.
  **Việc cần làm tiếp** - đề xuất nhiệm vụ hoặc nội dung cần quyết định, nếu có.
- Mục nào không có dữ liệu thì ghi "Không có".
- CHỈ dùng thông tin có trong trao đổi. Tuyệt đối không suy diễn, không thêm kết luận
  mà không ai nói ra, không bịa số liệu.
- Nêu đúng tên người phát biểu như trong bản ghi.`;

const ASK_SYSTEM = `Bạn là trợ lý tra cứu tài liệu trong phòng họp.
Trả lời câu hỏi của đại biểu chỉ dựa trên nội dung tài liệu được cung cấp.
Yêu cầu:
- Trả lời bằng tiếng Việt, đi thẳng vào ý chính, tối đa 5 câu.
- Nếu tài liệu không có thông tin để trả lời, nói rõ "Tài liệu không đề cập nội dung này" thay vì đoán.
- Khi nêu số liệu, trích đúng con số trong tài liệu.`;

/** Tóm tắt một tài liệu. */
export async function summarizeDocument(document) {
  const response = await callClaude({
    model: env.aiModel,
    max_tokens: 16000,
    system: SUMMARY_SYSTEM,
    // Tóm tắt là việc đơn giản nên dùng mức suy luận thấp cho nhanh và rẻ.
    output_config: { effort: "low" },
    messages: [
      {
        role: "user",
        content: [
          buildDocumentBlock(document),
          {
            type: "text",
            text: `Tóm tắt tài liệu "${document.display_name}" phục vụ cuộc họp.`
          }
        ]
      }
    ]
  });

  assertNotRefused(response);
  return { summary: extractText(response), model: response.model };
}

/**
 * Tổng hợp thảo luận trong phòng họp thành phần "Diễn biến và ý kiến" của biên bản.
 *
 * Đây là phần duy nhất của biên bản mà bộ tự sinh không lắp ráp được: ý kiến nằm
 * rải rác trong chat dạng văn xuôi, không có cấu trúc để đếm hay xếp bảng.
 * Kết quả luôn là BẢN NHÁP — thư ký đọc lại rồi mới đưa vào biên bản, vì biên bản
 * có ký số và giá trị pháp lý.
 */
export async function summarizeDiscussion({ meeting, agenda = [], messages }) {
  const transcript = messages
    .map((item) => {
      const at = item.created_at
        ? new Date(item.created_at).toLocaleTimeString("vi-VN", {
            hour: "2-digit",
            minute: "2-digit"
          })
        : "";
      return `[${at}] ${item.sender_name || item.sender_email}: ${item.content}`;
    })
    .join("\n");

  // Chương trình nghị sự giúp mô hình gom ý kiến đúng theo từng nội dung đã định.
  const agendaBlock = agenda.length
    ? `Chương trình nghị sự:\n${agenda
        .map((item, index) => `${index + 1}. ${item.title}`)
        .join("\n")}\n\n`
    : "";

  const response = await callClaude({
    model: env.aiModel,
    max_tokens: 16000,
    system: DISCUSSION_SYSTEM,
    // Gom ý kiến trái chiều cần suy luận kỹ hơn tóm tắt tài liệu.
    output_config: { effort: "medium" },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              `Cuộc họp: "${meeting.title}"\n` +
              (meeting.description ? `Nội dung chính: ${meeting.description}\n` : "") +
              "\n" +
              agendaBlock +
              `Bản ghi trao đổi trong phòng họp (${messages.length} tin nhắn):\n` +
              transcript
          }
        ]
      }
    ]
  });

  assertNotRefused(response);
  return { summary: extractText(response), model: response.model };
}

/** Hỏi đáp về nội dung tài liệu, có trích dẫn nguồn. */
export async function askAboutDocument(document, question) {
  const response = await callClaude({
    model: env.aiModel,
    max_tokens: 16000,
    system: ASK_SYSTEM,
    output_config: { effort: "medium" },
    messages: [
      {
        role: "user",
        content: [
          buildDocumentBlock(document, { withCitations: true }),
          { type: "text", text: question }
        ]
      }
    ]
  });

  assertNotRefused(response);
  return {
    answer: extractText(response),
    citations: extractCitations(response),
    model: response.model
  };
}
