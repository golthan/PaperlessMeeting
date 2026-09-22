import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { apiRequest } from "./api";
import {
  EmptyState,
  ErrorState,
  Panel,
  PrimaryButton,
  SecondaryButton,
  SectionTitle,
  StatusPill
} from "./components";
import {
  decodeBase64Text,
  fetchDocumentContent,
  isPreviewableInApp,
  openDocument
} from "./files";
import { formatDateTime } from "./format";
import { ChatPanel, TabStrip, styles as ui } from "./meetingUi";
import { useSocketEvents } from "./realtime";
import { colors, radii, spacing } from "./theme";

const TABS = [
  { key: "content", label: "Nội dung", icon: "document-text-outline" },
  { key: "notes", label: "Ghi chú", icon: "create-outline" },
  { key: "ai", label: "Hỏi AI", icon: "sparkles-outline" },
  { key: "chat", label: "Thảo luận", icon: "chatbubbles-outline" }
];

/**
 * Hộp làm việc của một tài liệu — bản điện thoại của DocumentWorkspace trên web.
 *
 * Ảnh xem được ngay trong app; PDF và file Office giao cho trình đọc của máy vì
 * Android không dựng sẵn khung xem PDF trong WebView.
 */
export function DocumentRoom({
  visible,
  document,
  auth,
  meetingId,
  socket,
  canEditNotes,
  canSummarize,
  aiEnabled,
  onClose
}) {
  const [activeTab, setActiveTab] = useState("content");
  const [messages, setMessages] = useState([]);
  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState("");
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [notes, setNotes] = useState("");
  const [notesMeta, setNotesMeta] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState(null);

  const documentId = document?.id;

  useEffect(() => {
    if (!visible || !documentId) return;
    setActiveTab("content");
    setPreview(null);
    setPreviewError("");
    setError("");
    setQuestion("");
    setSummary(document.ai_summary || null);

    apiRequest(`/documents/${documentId}/notes`, { token: auth.token })
      .then((result) => {
        setNotesMeta(result.data || null);
        setNotes(result.data?.content || "");
      })
      .catch(() => {
        setNotesMeta(null);
        setNotes("");
      });

    apiRequest(`/documents/${documentId}/questions`, { token: auth.token })
      .then((result) => setQuestions(result.data || []))
      .catch(() => setQuestions([]));

    // Thảo luận riêng của tài liệu, tách khỏi chat chung của phòng họp.
    apiRequest(`/meetings/${meetingId}/chat?limit=100&documentId=${documentId}`, {
      token: auth.token
    })
      .then((result) => setMessages(result.data || []))
      .catch(() => setMessages([]));

    // Ảnh thì tải sẵn để xem ngay, file nặng khác chỉ tải khi người dùng bấm mở.
    if (isPreviewableInApp(document.mime_type)) {
      setLoadingPreview(true);
      fetchDocumentContent(documentId, auth.token)
        .then(setPreview)
        .catch((err) => setPreviewError(err.message))
        .finally(() => setLoadingPreview(false));
    }
  }, [visible, documentId]);

  // Tin nhắn, câu hỏi AI và ghi chú do người khác gửi hiện lên ngay, không cần tải lại.
  useSocketEvents(socket, {
    new_chat_message(message) {
      if (message.document_id !== documentId) return;
      setMessages((current) =>
        current.some((item) => item.id === message.id) ? current : [...current, message]
      );
    },
    document_question_added(record) {
      if (record.document_id !== documentId) return;
      setQuestions((current) =>
        current.some((item) => item.id === record.id) ? current : [...current, record]
      );
    },
    document_notes_synced(note) {
      if (note.document_id !== documentId) return;
      setNotesMeta(note);
      setNotes(note.content || "");
    },
    document_updated(updated) {
      if (updated.id !== documentId) return;
      setSummary(updated.ai_summary || null);
    }
  });

  if (!document) return null;

  async function run(action, success) {
    setError("");
    setBusy(true);
    try {
      await action();
      if (success) auth.toast?.success(success);
    } catch (err) {
      setError(err.message);
      auth.toast?.error("Thao tác thất bại", err.message);
    } finally {
      setBusy(false);
    }
  }

  const open = () => run(() => openDocument(document, auth.token));

  const saveNotes = () =>
    run(async () => {
      const result = await apiRequest(`/documents/${documentId}/notes`, {
        method: "PUT",
        token: auth.token,
        body: { content: notes }
      });
      setNotesMeta(result.data || null);
    }, "Đã lưu ghi chú tài liệu");

  const summarize = () =>
    run(async () => {
      const result = await apiRequest(`/documents/${documentId}/summary`, {
        method: "POST",
        token: auth.token
      });
      setSummary(result.data?.ai_summary || null);
    }, "AI đã tóm tắt xong tài liệu");

  const ask = () => {
    const content = question.trim();
    if (!content) return;
    run(async () => {
      const result = await apiRequest(`/documents/${documentId}/ask`, {
        method: "POST",
        token: auth.token,
        body: { question: content }
      });
      setQuestions((current) => [...current, result.data]);
      setQuestion("");
    });
  };

  /**
   * Gửi tin nhắn bằng REST rồi tự chèn bản ghi trả về.
   *
   * Máy chủ cũng phát lại tin qua socket, nhưng chỉ tới những ai đang ở trong
   * phòng realtime — mở tài liệu từ màn hình chi tiết thì không thuộc nhóm đó.
   * Chèn tay ở đây giúp cả hai trường hợp đều thấy tin ngay, và lọc trùng theo
   * id nên không bị hiện hai lần khi socket cũng gửi về.
   */
  async function sendMessage(content) {
    try {
      const result = await apiRequest(`/meetings/${meetingId}/chat`, {
        method: "POST",
        token: auth.token,
        body: { content, documentId }
      });
      const sent = result?.data;
      if (sent) {
        setMessages((current) =>
          current.some((item) => item.id === sent.id) ? current : [...current, sent]
        );
      }
    } catch (err) {
      auth.toast?.error("Không gửi được tin nhắn", err.message);
      // Ném tiếp để ô soạn tin giữ lại nội dung vừa gõ.
      throw err;
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        <View style={styles.bar}>
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Đóng tài liệu">
            <Ionicons name="chevron-down" size={24} color={colors.primaryDark} />
          </Pressable>
          <View style={ui.flex}>
            <Text style={styles.barTitle} numberOfLines={1}>
              {document.display_name}
            </Text>
            <Text style={styles.barMeta} numberOfLines={1}>
              {document.uploaded_by_name} · {formatDateTime(document.created_at)}
            </Text>
          </View>
          <StatusPill
            value={document.status}
            label={document.status === "PENDING" ? "Chờ duyệt" : undefined}
          />
        </View>

        <TabStrip
          tabs={TABS.map((tab) =>
            tab.key === "chat" ? { ...tab, badge: messages.length } : tab
          )}
          active={activeTab}
          onChange={setActiveTab}
        />

        {activeTab === "chat" ? (
          <ChatPanel
            messages={messages}
            currentUserId={auth.user?.id}
            onSend={sendMessage}
            emptyText="Chưa có trao đổi nào về tài liệu này"
          />
        ) : (
          <ScrollView
            style={ui.flex}
            contentContainerStyle={ui.screenContent}
            keyboardShouldPersistTaps="handled"
          >
            <ErrorState message={error} />

            {activeTab === "content" && (
              <>
                <Panel>
                  <SectionTitle title="Xem tài liệu" />
                  {loadingPreview ? (
                    <View style={styles.previewLoading}>
                      <ActivityIndicator color={colors.primary} />
                      <Text style={ui.muted}>Đang tải nội dung...</Text>
                    </View>
                  ) : preview?.base64 && /^image\//.test(preview.mimeType) ? (
                    <Image
                      source={{ uri: `data:${preview.mimeType};base64,${preview.base64}` }}
                      style={styles.previewImage}
                      resizeMode="contain"
                    />
                  ) : preview?.base64 && preview.mimeType === "text/plain" ? (
                    <Text style={ui.minutesText}>{decodeBase64Text(preview.base64)}</Text>
                  ) : (
                    <View style={ui.stack}>
                      <Text style={ui.muted}>
                        {previewError ||
                          "Tệp PDF và tài liệu Office sẽ mở bằng ứng dụng đọc có sẵn trên máy."}
                      </Text>
                      <Text style={ui.muted}>
                        {document.original_name}
                        {document.size
                          ? ` · ${Math.max(1, Math.round(document.size / 1024))} KB`
                          : ""}
                      </Text>
                    </View>
                  )}
                  <View style={[ui.inlineWrap, styles.actions]}>
                    <PrimaryButton
                      icon="open-outline"
                      title={busy ? "Đang mở..." : "Mở tài liệu"}
                      onPress={open}
                      disabled={busy}
                    />
                  </View>
                </Panel>

                <Panel>
                  <SectionTitle
                    title="Tóm tắt của AI"
                    action={
                      aiEnabled && canSummarize ? (
                        <SecondaryButton
                          icon="sparkles-outline"
                          title={busy ? "Đang tóm tắt..." : "Tóm tắt"}
                          onPress={summarize}
                          disabled={busy}
                        />
                      ) : null
                    }
                  />
                  {summary ? (
                    <Text style={ui.minutesText}>{summary}</Text>
                  ) : (
                    <Text style={ui.muted}>
                      {aiEnabled
                        ? "Tài liệu chưa có bản tóm tắt. Chủ tọa hoặc thư ký có thể tạo tóm tắt cho cả phòng họp."
                        : "Hệ thống chưa bật tính năng AI."}
                    </Text>
                  )}
                </Panel>
              </>
            )}

            {activeTab === "notes" && (
              <Panel>
                <SectionTitle
                  title="Ghi chú tài liệu"
                  action={
                    canEditNotes ? (
                      <SecondaryButton
                        icon="save-outline"
                        title={busy ? "Đang lưu..." : "Lưu"}
                        onPress={saveNotes}
                        disabled={busy}
                      />
                    ) : null
                  }
                />
                <Text style={ui.muted}>
                  {canEditNotes
                    ? "Ghi chú này hiển thị cho cả phòng họp."
                    : "Chỉ chủ tọa và thư ký được sửa ghi chú của tài liệu."}
                </Text>
                <TextInput
                  style={ui.textArea}
                  value={notes}
                  onChangeText={setNotes}
                  editable={canEditNotes}
                  placeholder="Chưa có ghi chú cho tài liệu này"
                  placeholderTextColor={colors.subtle}
                  multiline
                />
                {!!notesMeta?.updated_by_name && (
                  <Text style={ui.muted}>
                    Cập nhật bởi {notesMeta.updated_by_name} ·{" "}
                    {formatDateTime(notesMeta.updated_at)}
                  </Text>
                )}
              </Panel>
            )}

            {activeTab === "ai" && (
              <Panel>
                <SectionTitle title="Hỏi AI về tài liệu" />
                {!aiEnabled ? (
                  <EmptyState title="Hệ thống chưa bật tính năng AI" />
                ) : (
                  <View style={ui.stack}>
                    {questions.length === 0 ? (
                      <Text style={ui.muted}>
                        Chưa có câu hỏi nào. Hãy hỏi những gì bạn cần làm rõ trong tài liệu.
                      </Text>
                    ) : (
                      questions.map((item) => (
                        <View key={item.id} style={styles.qaBox}>
                          <Text style={styles.qaWho}>{item.asked_by_name}</Text>
                          <Text style={styles.qaQuestion}>{item.question}</Text>
                          <Text style={ui.minutesText}>{item.answer}</Text>
                        </View>
                      ))
                    )}
                    <TextInput
                      style={styles.askInput}
                      value={question}
                      onChangeText={setQuestion}
                      placeholder="Ví dụ: Tài liệu đề xuất mức kinh phí bao nhiêu?"
                      placeholderTextColor={colors.subtle}
                      multiline
                    />
                    <PrimaryButton
                      icon="sparkles-outline"
                      title={busy ? "AI đang trả lời..." : "Gửi câu hỏi"}
                      onPress={ask}
                      disabled={busy || !question.trim()}
                    />
                  </View>
                )}
              </Panel>
            )}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.background,
    flex: 1
  },
  bar: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  barTitle: {
    color: colors.textStrong,
    fontSize: 16,
    fontWeight: "800"
  },
  barMeta: {
    color: colors.muted,
    fontSize: 12
  },
  actions: {
    marginTop: spacing.sm
  },
  previewLoading: {
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.lg
  },
  previewImage: {
    backgroundColor: colors.surfaceSunken,
    borderRadius: radii.md,
    height: 320,
    width: "100%"
  },
  qaBox: {
    backgroundColor: colors.surfaceSunken,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: 4,
    padding: spacing.md
  },
  qaWho: {
    color: colors.primary,
    fontSize: 11.5,
    fontWeight: "800"
  },
  qaQuestion: {
    color: colors.textStrong,
    fontSize: 14.5,
    fontWeight: "800"
  },
  askInput: {
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
    borderRadius: radii.md,
    borderWidth: 1,
    color: colors.text,
    fontSize: 15,
    minHeight: 80,
    padding: spacing.md,
    textAlignVertical: "top"
  }
});
