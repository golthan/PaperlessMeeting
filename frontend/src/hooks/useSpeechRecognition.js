import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Nhận dạng giọng nói bằng Web Speech API của trình duyệt.
 *
 * Mỗi người bật nhận dạng trên máy mình, nên đoạn nào cũng biết sẵn ai nói —
 * không phải tách giọng từ luồng audio trộn của cả phòng. Tiếng nói không rời
 * khỏi máy người dùng, chỉ có chữ được gửi về máy chủ.
 *
 * Giới hạn cần biết: chỉ Chrome và Edge có API này (Firefox, Safari chưa có), và
 * trình duyệt đòi trang phải chạy trên HTTPS hoặc localhost.
 */

/** Trình duyệt Chromium để API dưới tiền tố webkit; bản chuẩn thì không. */
function getRecognitionClass() {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export function isSpeechRecognitionSupported() {
  return Boolean(getRecognitionClass());
}

const ERROR_MESSAGES = {
  "not-allowed": "Trình duyệt chưa được cấp quyền dùng micro",
  "service-not-allowed": "Trình duyệt chặn dịch vụ nhận dạng giọng nói",
  "audio-capture": "Không tìm thấy micro nào đang hoạt động",
  network: "Mất kết nối tới dịch vụ nhận dạng giọng nói",
  "language-not-supported": "Trình duyệt không hỗ trợ ngôn ngữ này"
};

export function useSpeechRecognition({ language = "vi-VN", onSegment } = {}) {
  const supported = isSpeechRecognitionSupported();
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState("");

  const recognitionRef = useRef(null);
  // Chrome tự dừng sau một quãng im lặng; cờ này để biết có nên nối lại hay không.
  const wantListeningRef = useRef(false);
  const onSegmentRef = useRef(onSegment);
  onSegmentRef.current = onSegment;

  const stop = useCallback(() => {
    wantListeningRef.current = false;
    setInterim("");
    setListening(false);
    const recognition = recognitionRef.current;
    if (!recognition) return;
    try {
      recognition.stop();
    } catch {
      // Đang không chạy thì stop() ném lỗi — không có gì phải xử lý.
    }
  }, []);

  const start = useCallback(() => {
    if (!supported) {
      setError(
        "Trình duyệt này không hỗ trợ nhận dạng giọng nói. Dùng Chrome hoặc Edge."
      );
      return;
    }
    if (wantListeningRef.current) return;

    const Recognition = getRecognitionClass();
    const recognition = new Recognition();
    recognition.lang = language;
    recognition.continuous = true;
    // Bật kết quả tạm để người nói thấy chữ hiện ngay, đỡ cảm giác treo.
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      let pending = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = (result[0]?.transcript || "").trim();
        if (!text) continue;
        if (result.isFinal) {
          // Chỉ đoạn đã chốt mới gửi về máy chủ; kết quả tạm còn thay đổi liên tục.
          onSegmentRef.current?.({
            content: text,
            confidence: result[0]?.confidence ?? null,
            language,
            spokenAt: new Date().toISOString()
          });
        } else {
          pending += (pending ? " " : "") + text;
        }
      }
      setInterim(pending);
    };

    recognition.onerror = (event) => {
      // "no-speech" và "aborted" là chuyện bình thường khi người ta ngừng nói.
      if (["no-speech", "aborted"].includes(event.error)) return;
      setError(ERROR_MESSAGES[event.error] || `Lỗi nhận dạng giọng nói: ${event.error}`);
      if (["not-allowed", "service-not-allowed", "audio-capture"].includes(event.error)) {
        wantListeningRef.current = false;
        setListening(false);
      }
    };

    recognition.onend = () => {
      setInterim("");
      if (!wantListeningRef.current) {
        setListening(false);
        return;
      }
      // Người dùng vẫn muốn ghi thì nối lại phiên mới.
      try {
        recognition.start();
      } catch {
        wantListeningRef.current = false;
        setListening(false);
      }
    };

    recognitionRef.current = recognition;
    wantListeningRef.current = true;
    setError("");
    try {
      recognition.start();
      setListening(true);
    } catch (err) {
      wantListeningRef.current = false;
      setListening(false);
      setError(err?.message || "Không bật được nhận dạng giọng nói");
    }
  }, [language, supported]);

  const toggle = useCallback(() => {
    if (wantListeningRef.current) stop();
    else start();
  }, [start, stop]);

  // Rời trang thì phải tắt micro, không để phiên nhận dạng chạy ngầm.
  useEffect(
    () => () => {
      wantListeningRef.current = false;
      try {
        recognitionRef.current?.abort();
      } catch {
        // Không sao.
      }
    },
    []
  );

  return { supported, listening, interim, error, start, stop, toggle, setError };
}
