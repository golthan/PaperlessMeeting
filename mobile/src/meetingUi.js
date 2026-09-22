import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import {
  FlatList,
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
import { openMinutesPdf } from "./files";
import {
  asArray,
  attendanceMethodLabel,
  attendanceSummary,
  formatDate,
  formatDateTime,
  meetingPlaceLabel,
  percent,
  voteAnswerLabel
} from "./format";
import { colors, radii, shadow, spacing } from "./theme";

const CHECKED_IN = ["PRESENT", "LATE"];

/** Nhãn vai trò trong cuộc họp. */
const MEETING_ROLE_LABELS = {
  CHAIRMAN: "Chủ tọa",
  SECRETARY: "Thư ký",
  MEMBER: "Thành viên"
};

export function isCheckedIn(participant) {
  return CHECKED_IN.includes(participant?.attendance_status);
}

function initials(value) {
  const parts = String(value || "?").trim().split(/\s+/);
  return (parts[parts.length - 1] || "?").slice(0, 1).toUpperCase();
}

function normalizeOptions(options) {
  if (Array.isArray(options)) return options;
  try {
    return JSON.parse(options || "[]");
  } catch {
    return [];
  }
}

/** Dải tab cuộn ngang dùng chung cho màn hình chi tiết và phòng họp. */
export function TabStrip({ tabs, active, onChange }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBar}>
      {tabs.map((tab) => {
        const isActive = active === tab.key;
        return (
          <Pressable
            key={tab.key}
            style={[styles.tabChip, isActive && styles.tabChipActive]}
            onPress={() => onChange(tab.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
          >
            <Ionicons
              name={tab.icon}
              size={16}
              color={isActive ? colors.primary : colors.muted}
            />
            <Text style={[styles.tabChipText, isActive && styles.tabChipTextActive]}>
              {tab.label}
            </Text>
            {tab.badge > 0 && (
              <View style={styles.tabCount}>
                <Text style={styles.tabCountText}>{tab.badge > 99 ? "99+" : tab.badge}</Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function ProgressBar({ value, total }) {
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${percent(value, total)}%` }]} />
    </View>
  );
}

export function SearchBox({ value, onChangeText, placeholder }) {
  return (
    <View style={styles.searchBox}>
      <Ionicons name="search" size={15} color={colors.muted} />
      <TextInput
        style={styles.searchInput}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.subtle}
      />
      {!!value && (
        <Pressable onPress={() => onChangeText("")} hitSlop={8} accessibilityLabel="Xoá tìm kiếm">
          <Ionicons name="close-circle" size={16} color={colors.subtle} />
        </Pressable>
      )}
    </View>
  );
}

/** Thẻ tóm tắt cuộc họp đặt trên cùng mọi màn hình liên quan. */
export function MeetingTopCard({
  meeting,
  realtimeStatus,
  roleInMeeting,
  note,
  children
}) {
  return (
    <Panel>
      <View style={styles.rowBetween}>
        <Text style={styles.meetingTitle}>{meeting.title}</Text>
        <StatusPill value={meeting.status} />
      </View>
      <Text style={styles.muted}>{formatDateTime(meeting.start_time)}</Text>
      <Text style={styles.muted}>{meetingPlaceLabel(meeting)}</Text>
      <View style={styles.rowWrap}>
        <StatusPill value={meeting.meeting_type} />
        {!!roleInMeeting && <StatusPill value={roleInMeeting} />}
        {!!realtimeStatus && (
          <View style={styles.signal}>
            <View
              style={[
                styles.signalDot,
                realtimeStatus === "online" ? styles.signalOn : styles.signalOff
              ]}
            />
            <Text style={styles.signalText}>
              {realtimeStatus === "online"
                ? "Realtime đã kết nối"
                : realtimeStatus === "connecting"
                  ? "Đang kết nối realtime"
                  : "Mất kết nối realtime"}
            </Text>
          </View>
        )}
      </View>
      {!!note && <Text style={styles.noteLine}>{note}</Text>}
      {children}
    </Panel>
  );
}

/**
 * Danh sách người tham dự.
 *
 * Trong phòng họp thì tách rõ ai đang trong phòng / chưa vào; ở màn hình chi tiết
 * (cuộc họp chưa diễn ra) chỉ cần một danh sách phẳng kèm trạng thái lời mời.
 */
export function ParticipantsPanel({
  participants,
  currentUserId,
  organizerName,
  showPresence = false
}) {
  const [query, setQuery] = useState("");
  const people = asArray(participants);
  const keyword = query.trim().toLowerCase();
  const matched = people.filter(
    (item) =>
      !keyword ||
      (item.full_name || "").toLowerCase().includes(keyword) ||
      (item.email || "").toLowerCase().includes(keyword) ||
      (item.department_name || "").toLowerCase().includes(keyword)
  );

  function renderRow(participant) {
    const mine = participant.user_id === currentUserId;
    return (
      <View key={participant.user_id} style={styles.participantRow}>
        <View style={[styles.avatar, participant.is_online && styles.avatarOnline]}>
          <Text style={styles.avatarText}>{initials(participant.full_name)}</Text>
          {showPresence && participant.is_online && <View style={styles.onlineDot} />}
        </View>
        <View style={styles.flex}>
          <Text style={styles.itemTitle}>
            {participant.full_name}
            {mine ? " (bạn)" : ""}
          </Text>
          <Text style={styles.muted}>
            {MEETING_ROLE_LABELS[participant.role_in_meeting] || "Thành viên"}
            {participant.department_name ? ` · ${participant.department_name}` : ""}
          </Text>
        </View>
        <View style={styles.stackSmall}>
          {!!participant.is_hand_raised && <StatusPill value="LATE" label="Giơ tay" />}
          {showPresence ? (
            <StatusPill value={participant.attendance_status || "ABSENT"} />
          ) : (
            <StatusPill value={participant.invitation_status} />
          )}
        </View>
      </View>
    );
  }

  const joined = matched.filter((item) => item.is_online);
  const away = matched.filter((item) => !item.is_online);

  return (
    <Panel>
      <SectionTitle
        title="Người tham dự"
        action={
          <Text style={styles.muted}>
            {showPresence
              ? `${people.filter((item) => item.is_online).length}/${people.length} trong phòng`
              : `${people.length} người`}
          </Text>
        }
      />
      <View style={styles.stack}>
        {people.length > 6 && (
          <SearchBox
            value={query}
            onChangeText={setQuery}
            placeholder="Tìm theo tên, email, đơn vị..."
          />
        )}
        {!!organizerName && (
          <Text style={styles.muted}>Chủ tọa: {organizerName}</Text>
        )}
        {matched.length === 0 ? (
          <EmptyState title="Không tìm thấy người tham dự" />
        ) : showPresence ? (
          <>
            <Text style={styles.groupLabel}>Đang trong phòng ({joined.length})</Text>
            {joined.length === 0 ? (
              <Text style={styles.muted}>Chưa có ai vào phòng họp.</Text>
            ) : (
              joined.map(renderRow)
            )}
            <Text style={styles.groupLabel}>Chưa vào phòng ({away.length})</Text>
            {away.length === 0 ? (
              <Text style={styles.muted}>Tất cả đã vào phòng.</Text>
            ) : (
              away.map(renderRow)
            )}
          </>
        ) : (
          matched.map(renderRow)
        )}
      </View>
    </Panel>
  );
}

/** Chương trình nghị sự, có làm nổi mục chủ tọa đang trình bày. */
export function AgendaPanel({ agenda }) {
  const items = asArray(agenda);
  const current = items.find((item) => item.status === "CURRENT");

  return (
    <Panel>
      <SectionTitle title="Chương trình họp" />
      {items.length === 0 ? (
        <EmptyState title="Cuộc họp chưa có chương trình nghị sự" />
      ) : (
        <View style={styles.stack}>
          {!!current && (
            <View style={styles.focusCard}>
              <Text style={styles.focusLabel}>Đang trình bày</Text>
              <Text style={styles.focusTitle}>{current.title}</Text>
              <Text style={styles.focusMeta}>
                {current.presenter_name || "Chưa chỉ định người trình bày"}
              </Text>
            </View>
          )}
          {items.map((item, index) => (
            <View
              key={item.id}
              style={[styles.agendaRow, item.status === "CURRENT" && styles.agendaRowCurrent]}
            >
              <Text style={styles.agendaIndex}>{index + 1}</Text>
              <View style={styles.flex}>
                <Text style={styles.itemTitle}>{item.title}</Text>
                {!!item.description && <Text style={styles.muted}>{item.description}</Text>}
                <View style={styles.inlineWrap}>
                  <StatusPill value={item.status} />
                  <Text style={styles.muted}>
                    {item.presenter_name || "Chưa chọn"} · {item.duration_minutes || 0} phút
                  </Text>
                </View>
              </View>
            </View>
          ))}
        </View>
      )}
    </Panel>
  );
}

/** Danh sách tài liệu: chạm vào một dòng để mở hộp tài liệu đầy đủ. */
export function DocumentsPanel({
  documents,
  canUpload,
  uploading,
  onUpload,
  onOpenDocument,
  note
}) {
  const items = asArray(documents);

  return (
    <Panel>
      <SectionTitle
        title="Tài liệu"
        action={
          canUpload ? (
            <SecondaryButton
              icon="cloud-upload-outline"
              title={uploading ? "Đang gửi..." : "Gửi tài liệu"}
              onPress={onUpload}
              disabled={uploading}
            />
          ) : null
        }
      />
      {!!note && <Text style={styles.muted}>{note}</Text>}
      {items.length === 0 ? (
        <EmptyState title="Chưa có tài liệu" />
      ) : (
        <View style={styles.stack}>
          {items.map((document) => (
            <Pressable
              key={document.id}
              onPress={() => onOpenDocument(document)}
              style={[styles.docRow, document.is_presenting && styles.docRowPresenting]}
              accessibilityRole="button"
            >
              <View style={styles.docIcon}>
                <Ionicons
                  name={
                    /pdf/.test(document.mime_type || "")
                      ? "document-text"
                      : /image/.test(document.mime_type || "")
                        ? "image"
                        : "document-attach"
                  }
                  size={19}
                  color={colors.primary}
                />
              </View>
              <View style={styles.flex}>
                <Text style={styles.itemTitle} numberOfLines={2}>
                  {document.display_name}
                </Text>
                <Text style={styles.muted} numberOfLines={1}>
                  {document.uploaded_by_name} · {formatDate(document.created_at)}
                </Text>
                <View style={styles.inlineWrap}>
                  <StatusPill
                    value={document.status}
                    label={document.status === "PENDING" ? "Chờ duyệt" : undefined}
                  />
                  {!!document.is_presenting && (
                    <StatusPill value="CURRENT" label="Đang trình chiếu" />
                  )}
                  {!!document.ai_summary && <StatusPill value="OPEN" label="Có tóm tắt AI" />}
                </View>
              </View>
              <Ionicons name="chevron-forward" size={17} color={colors.subtle} />
            </Pressable>
          ))}
        </View>
      )}
    </Panel>
  );
}

/** Điểm danh: người dự tự bấm, kèm bảng theo dõi cả phòng họp. */
export function AttendancePanel({ meeting, currentUserId, busy, onCheckIn }) {
  const summary = attendanceSummary(meeting.participants);
  const me = asArray(meeting.participants).find((item) => item.user_id === currentUserId);
  const ongoing = meeting.status === "ONGOING";
  const already = isCheckedIn(me);

  return (
    <Panel>
      <SectionTitle title="Điểm danh" />
      <View style={styles.stack}>
        <View style={styles.summaryGrid}>
          <SummaryTile label="Có mặt" value={summary.present} />
          <SummaryTile label="Đi muộn" value={summary.late} />
          <SummaryTile label="Chưa điểm danh" value={summary.absent} />
          <SummaryTile label="Tỉ lệ" value={`${percent(summary.checkedIn, summary.total)}%`} />
        </View>

        <PrimaryButton
          icon={already ? "checkmark-done-outline" : "checkmark-outline"}
          title={already ? "Bạn đã điểm danh" : "Điểm danh"}
          onPress={onCheckIn}
          disabled={!ongoing || already || busy}
        />

        <Text style={styles.muted}>
          {ongoing
            ? "Vào phòng họp lúc đang diễn ra sẽ tự điểm danh. Muộn hơn 10 phút so với giờ bắt đầu được ghi nhận là đi muộn."
            : "Chỉ điểm danh được khi cuộc họp đang diễn ra."}
        </Text>

        {asArray(meeting.participants).map((participant) => (
          <View key={participant.user_id} style={styles.participantRow}>
            <View style={styles.flex}>
              <Text style={styles.itemTitle}>
                {participant.full_name}
                {participant.user_id === currentUserId ? " (bạn)" : ""}
              </Text>
              <Text style={styles.muted}>
                {attendanceMethodLabel(participant.attendance_method)}
                {participant.checked_in_at ? ` · ${formatDateTime(participant.checked_in_at)}` : ""}
              </Text>
            </View>
            <StatusPill value={participant.attendance_status || "ABSENT"} />
          </View>
        ))}
      </View>
    </Panel>
  );
}

function SummaryTile({ label, value }) {
  return (
    <View style={styles.summaryTile}>
      <Text style={styles.summaryTileLabel}>{label}</Text>
      <Text style={styles.summaryTileValue}>{value}</Text>
    </View>
  );
}

/** Biểu quyết: bỏ phiếu khi đang mở, xem kết quả khi đã chốt. */
export function VotesPanel({ meeting, results, busy, onAnswer, onLoadResults }) {
  const votes = asArray(meeting.votes);
  const totalPeople = asArray(meeting.participants).length;
  const requested = useRef(new Set());

  // Biểu quyết đã chốt thì hiện kết quả luôn, không bắt người dùng bấm thêm.
  useEffect(() => {
    votes
      .filter(
        (vote) =>
          vote.status === "CLOSED" && !results[vote.id] && !requested.current.has(vote.id)
      )
      .forEach((vote) => {
        requested.current.add(vote.id);
        Promise.resolve(onLoadResults(vote.id)).catch(() =>
          requested.current.delete(vote.id)
        );
      });
  }, [votes, results, onLoadResults]);

  return (
    <Panel>
      <SectionTitle title="Biểu quyết" />
      {votes.length === 0 ? (
        <EmptyState title="Chủ tọa sẽ mở biểu quyết khi cần lấy ý kiến" />
      ) : (
        <View style={styles.stack}>
          {votes.map((vote) => {
            const options = normalizeOptions(vote.options);
            const result = results[vote.id];
            const voted = result?.summary?.totalResponses ?? Number(vote.response_count || 0);
            const total = result?.summary?.eligibleVoters || totalPeople;

            return (
              <View key={vote.id} style={styles.voteBox}>
                <View style={styles.rowBetween}>
                  <Text style={styles.itemTitle}>{vote.title}</Text>
                  <StatusPill value={vote.status} />
                </View>
                {!!vote.description && <Text style={styles.muted}>{vote.description}</Text>}
                {!!vote.is_anonymous && (
                  <Text style={styles.muted}>Biểu quyết kín — không ai biết bạn chọn gì.</Text>
                )}

                <Text style={styles.muted}>
                  {voted}/{total} người đã bỏ phiếu
                </Text>
                <ProgressBar value={voted} total={total} />

                {vote.my_answer ? (
                  <Text style={styles.answerText}>
                    Bạn đã chọn: {voteAnswerLabel(vote.my_answer)}
                  </Text>
                ) : vote.status === "OPEN" ? (
                  <View style={styles.inlineWrap}>
                    {options.map((option) => (
                      <SecondaryButton
                        key={option}
                        title={voteAnswerLabel(option)}
                        onPress={() => onAnswer(vote.id, option)}
                        disabled={busy}
                      />
                    ))}
                  </View>
                ) : (
                  <Text style={styles.muted}>
                    {vote.status === "DRAFT"
                      ? "Chủ tọa chưa mở biểu quyết này."
                      : "Biểu quyết đã chốt."}
                  </Text>
                )}

                {vote.status === "CLOSED" && !!result?.results && (
                  <View style={styles.stackSmall}>
                    {result.results.map((item) => (
                      <View key={item.answer}>
                        <View style={styles.summaryRow}>
                          <Text style={styles.muted}>{voteAnswerLabel(item.answer)}</Text>
                          <Text style={styles.summaryCount}>
                            {item.count} · {percent(item.count, voted || 1)}%
                          </Text>
                        </View>
                        <ProgressBar value={item.count} total={voted || 1} />
                      </View>
                    ))}
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}
    </Panel>
  );
}

/** Nhiệm vụ được giao cho chính người đang đăng nhập. */
export function TasksPanel({ tasks, busy, onStatus }) {
  const items = asArray(tasks);

  return (
    <Panel>
      <SectionTitle title="Nhiệm vụ của tôi" />
      {items.length === 0 ? (
        <EmptyState title="Bạn chưa có nhiệm vụ trong cuộc họp này" />
      ) : (
        <View style={styles.stack}>
          {items.map((task) => (
            <View key={task.id} style={styles.voteBox}>
              <View style={styles.rowBetween}>
                <Text style={styles.itemTitle}>{task.title}</Text>
                <StatusPill value={task.status} />
              </View>
              {!!task.description && <Text style={styles.muted}>{task.description}</Text>}
              <Text style={styles.muted}>
                Hạn: {formatDate(task.deadline)} · Giao bởi {task.assigned_by_name || "chủ tọa"}
              </Text>
              <View style={styles.inlineWrap}>
                <StatusPill value={task.priority} />
                {task.status === "TODO" && (
                  <SecondaryButton
                    icon="play-outline"
                    title="Bắt đầu làm"
                    onPress={() => onStatus(task.id, "IN_PROGRESS")}
                    disabled={busy}
                  />
                )}
                {task.status !== "DONE" && (
                  <PrimaryButton
                    icon="checkmark-outline"
                    title="Hoàn thành"
                    onPress={() => onStatus(task.id, "DONE")}
                    disabled={busy}
                  />
                )}
              </View>
            </View>
          ))}
        </View>
      )}
    </Panel>
  );
}

/** Ghi chú chung của phòng họp (chủ tọa / thư ký) và ghi chú riêng của mỗi người. */
export function NotesPanel({
  publicNotes,
  personalNotes,
  canEditPublic,
  savingPublic,
  savingPersonal,
  onChangePublic,
  onChangePersonal,
  onSavePublic,
  onSavePersonal
}) {
  return (
    <View style={styles.stack}>
      <Panel>
        <SectionTitle
          title="Ghi chú chung"
          action={
            canEditPublic ? (
              <SecondaryButton
                icon="save-outline"
                title={savingPublic ? "Đang lưu..." : "Lưu"}
                onPress={onSavePublic}
                disabled={savingPublic}
              />
            ) : null
          }
        />
        {!canEditPublic && (
          <Text style={styles.muted}>Chỉ chủ tọa và thư ký được sửa phần này.</Text>
        )}
        <TextInput
          style={styles.textArea}
          value={publicNotes}
          onChangeText={onChangePublic}
          editable={canEditPublic}
          placeholder="Nội dung trao đổi, kết luận của cuộc họp..."
          placeholderTextColor={colors.subtle}
          multiline
        />
      </Panel>
      <Panel>
        <SectionTitle
          title="Ghi chú cá nhân"
          action={
            <SecondaryButton
              icon="save-outline"
              title={savingPersonal ? "Đang lưu..." : "Lưu"}
              onPress={onSavePersonal}
              disabled={savingPersonal}
            />
          }
        />
        <Text style={styles.muted}>Chỉ mình bạn nhìn thấy nội dung này.</Text>
        <TextInput
          style={styles.textArea}
          value={personalNotes}
          onChangeText={onChangePersonal}
          placeholder="Ghi chú riêng của bạn"
          placeholderTextColor={colors.subtle}
          multiline
        />
      </Panel>
    </View>
  );
}

function MessageBubble({ message, mine }) {
  return (
    <View style={[styles.messageBubble, mine && styles.messageBubbleMine]}>
      {!mine && (
        <Text style={styles.messageAuthor}>{message.sender_name || message.sender_email}</Text>
      )}
      <Text style={styles.messageText}>{message.content}</Text>
      <Text style={styles.messageTime}>{formatDateTime(message.created_at)}</Text>
    </View>
  );
}

/**
 * Khung trò chuyện chiếm hết chiều cao còn lại: danh sách tự cuộn xuống tin mới
 * và ô soạn tin luôn nằm dưới cùng, không bị bàn phím che.
 */
export function ChatPanel({ messages, currentUserId, onSend, sending, emptyText }) {
  const [draft, setDraft] = useState("");
  const listRef = useRef(null);
  const items = asArray(messages);

  function send() {
    const content = draft.trim();
    if (!content || sending) return;
    setDraft("");
    Promise.resolve(onSend(content)).catch(() => setDraft(content));
  }

  return (
    <View style={styles.chatShell}>
      <FlatList
        ref={listRef}
        data={items}
        style={styles.chatList}
        contentContainerStyle={styles.chatListContent}
        keyExtractor={(item, index) =>
          String(item.id || `${item.sender_id}-${item.created_at}-${index}`)
        }
        renderItem={({ item }) => (
          <MessageBubble message={item} mine={item.sender_id === currentUserId} />
        )}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        ListEmptyComponent={<EmptyState title={emptyText || "Chưa có tin nhắn nào"} />}
        keyboardShouldPersistTaps="handled"
      />
      <View style={styles.chatComposer}>
        <TextInput
          style={styles.chatInput}
          value={draft}
          onChangeText={setDraft}
          placeholder="Nhập tin nhắn..."
          placeholderTextColor={colors.subtle}
          multiline
        />
        <Pressable
          onPress={send}
          disabled={!draft.trim() || sending}
          style={[styles.sendButton, (!draft.trim() || sending) && styles.sendButtonOff]}
          accessibilityLabel="Gửi tin nhắn"
          accessibilityRole="button"
        >
          <Ionicons name="send" size={18} color={colors.onPrimary} />
        </Pressable>
      </View>
    </View>
  );
}

/**
 * Hồ sơ biên bản điện tử.
 *
 * Người tham dự chỉ thấy biên bản đã ban hành. Ai là thư ký của cuộc họp thì ký
 * số được ngay trên điện thoại; chữ ký gắn với mã băm nội dung nên biên bản bị
 * sửa sau khi ký sẽ bị báo ngay.
 */
export function MinutesPanel({
  meetingId,
  auth,
  canSign,
  canDraft = false,
  aiEnabled = false,
  onNotice,
  onError
}) {
  const [minutes, setMinutes] = useState(null);
  const [notes, setNotes] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [error, setError] = useState("");
  // Tách riêng để lỗi của khối AI không hiện lặp ở khối biên bản.
  const [aiError, setAiError] = useState("");

  async function load() {
    const [minutesResult, notesResult] = await Promise.all([
      apiRequest(`/meetings/${meetingId}/minutes`, { token: auth.token }),
      apiRequest(`/meetings/${meetingId}/public-notes`, { token: auth.token }).catch(
        () => ({ data: null })
      )
    ]);
    setMinutes(minutesResult.data);
    setNotes(notesResult.data);
  }

  useEffect(() => {
    setLoading(true);
    load()
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [meetingId]);

  /** AI đọc chat phòng họp, dựng bản nháp mục diễn biến thảo luận của biên bản. */
  async function summarizeDiscussion() {
    setSummarizing(true);
    setAiError("");
    try {
      const result = await apiRequest(`/meetings/${meetingId}/public-notes/ai-summary`, {
        method: "POST",
        token: auth.token
      });
      setNotes(result.data);
      onNotice?.("AI đã tổng hợp xong ý kiến thảo luận");
    } catch (err) {
      setAiError(err.message);
      onError?.(err.message);
    } finally {
      setSummarizing(false);
    }
  }

  /** Xác nhận đã đọc bản nháp rồi mới đưa vào ghi chú chung — mục VI lấy từ đó. */
  async function useSummaryAsNotes() {
    setAiError("");
    try {
      const result = await apiRequest(`/meetings/${meetingId}/public-notes`, {
        method: "PUT",
        token: auth.token,
        body: { content: notes.ai_summary }
      });
      setNotes((current) => ({ ...current, content: result.data.content }));
      onNotice?.("Đã đưa bản tổng hợp vào ghi chú chung");
    } catch (err) {
      setAiError(err.message);
      onError?.(err.message);
    }
  }

  async function run(action, success) {
    setError("");
    setBusy(true);
    try {
      await action();
      if (success) onNotice?.(success);
      await load();
    } catch (err) {
      setError(err.message);
      onError?.(err.message);
    } finally {
      setBusy(false);
    }
  }

  const sign = () =>
    run(
      () =>
        apiRequest(`/minutes/${minutes.id}/sign`, { method: "POST", token: auth.token }),
      "Đã ký số biên bản"
    );

  const openPdf = () =>
    run(() => openMinutesPdf(minutes, auth.token));

  if (loading) {
    return (
      <Panel>
        <Text style={styles.muted}>Đang tải biên bản...</Text>
      </Panel>
    );
  }

  const aiBlock =
    canDraft && (aiEnabled || notes?.ai_summary) ? (
      <Panel>
        <SectionTitle
          title="AI tổng hợp thảo luận"
          action={
            aiEnabled ? (
              <SecondaryButton
                icon="sparkles-outline"
                title={summarizing ? "Đang tổng hợp..." : "Tổng hợp"}
                onPress={summarizeDiscussion}
                disabled={summarizing}
              />
            ) : null
          }
        />
        <View style={styles.stack}>
          <Text style={styles.muted}>
            Mục "Diễn biến và ý kiến thảo luận" của biên bản là phần duy nhất máy không
            lắp ráp được từ dữ liệu — AI đọc chat phòng họp và dựng bản nháp.
          </Text>
          {notes?.ai_summary ? (
            <>
              <Text style={styles.muted}>
                {notes.ai_summary_message_count || 0} ý kiến ·{" "}
                {formatDateTime(notes.ai_summary_updated_at)}
              </Text>
              <Text style={styles.minutesText}>{notes.ai_summary}</Text>
              <Text style={styles.warnText}>
                Đây là bản nháp — đọc lại rồi mới đưa vào biên bản.
              </Text>
              <SecondaryButton
                icon="arrow-down-outline"
                title="Dùng làm ghi chú chung"
                onPress={useSummaryAsNotes}
              />
            </>
          ) : (
            <Text style={styles.muted}>Chưa có bản tổng hợp nào.</Text>
          )}
          <ErrorState message={aiError} />
        </View>
      </Panel>
    ) : null;

  if (!minutes) {
    return (
      <View style={styles.stack}>
        {aiBlock}
        <Panel>
          <SectionTitle title="Biên bản" />
          <EmptyState title="Biên bản chưa được ban hành" />
          <Text style={styles.muted}>
            Sau khi chủ tọa chốt và ban hành, biên bản sẽ hiện tại đây kèm chữ ký số và mã tra cứu.
          </Text>
        </Panel>
      </View>
    );
  }

  const integrity = minutes.integrity;
  const signatures = asArray(integrity?.signatures);
  const signedByMe = signatures.some((item) => item.signerId === auth.user?.id);

  return (
    <View style={styles.stack}>
      {aiBlock}
      <Panel>
        <SectionTitle
          title="Biên bản điện tử"
          action={<StatusPill value={minutes.status} />}
        />
        <View style={styles.stack}>
          <View style={styles.inlineWrap}>
            <StatusPill
              value={integrity?.intact ? "APPROVED" : integrity?.signed ? "REJECTED" : "PENDING"}
              label={
                integrity?.intact
                  ? "Chữ ký hợp lệ"
                  : integrity?.signed
                    ? "Chữ ký không còn hợp lệ"
                    : "Chưa ký số"
              }
            />
            {!!minutes.verification_code && (
              <Text style={styles.codeText}>Mã tra cứu: {minutes.verification_code}</Text>
            )}
          </View>

          <View style={styles.inlineWrap}>
            <PrimaryButton
              icon="download-outline"
              title={busy ? "Đang xử lý..." : "Mở PDF biên bản"}
              onPress={openPdf}
              disabled={busy}
            />
            {canSign && !signedByMe && (
              <SecondaryButton
                icon="create-outline"
                title="Ký số biên bản"
                onPress={sign}
                disabled={busy}
              />
            )}
          </View>

          <ErrorState message={error} />
          <Text style={styles.minutesText}>{minutes.content}</Text>
          {!!minutes.conclusion && (
            <>
              <Text style={styles.groupLabel}>Kết luận</Text>
              <Text style={styles.minutesText}>{minutes.conclusion}</Text>
            </>
          )}
        </View>
      </Panel>

      <Panel>
        <SectionTitle title="Chữ ký số" />
        {signatures.length === 0 ? (
          <EmptyState title="Biên bản chưa có chữ ký" />
        ) : (
          <View style={styles.stack}>
            {signatures.map((item) => (
              <View key={item.id} style={styles.participantRow}>
                <View style={styles.avatar}>
                  <Ionicons
                    name={item.valid ? "shield-checkmark" : "shield-outline"}
                    size={18}
                    color={item.valid ? colors.success : colors.danger}
                  />
                </View>
                <View style={styles.flex}>
                  <Text style={styles.itemTitle}>{item.signerName}</Text>
                  <Text style={styles.muted}>
                    {item.signerTitle} · {formatDateTime(item.signedAt)}
                  </Text>
                  {!!item.reason && <Text style={styles.warnText}>{item.reason}</Text>}
                </View>
                <StatusPill
                  value={item.valid ? "APPROVED" : "REJECTED"}
                  label={item.valid ? "Hợp lệ" : "Không hợp lệ"}
                />
              </View>
            ))}
          </View>
        )}
      </Panel>
    </View>
  );
}

export const styles = StyleSheet.create({
  /* Bố cục chung */
  screen: { flex: 1 },
  screenContent: { gap: spacing.md, padding: spacing.md },
  stack: { gap: spacing.sm },
  stackSmall: { gap: spacing.xs },
  flex: { flex: 1 },
  rowBetween: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between"
  },
  rowWrap: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.sm
  },
  inlineWrap: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs
  },
  detailShell: { flex: 1 },
  videoFullScreen: {
    backgroundColor: "#07222d",
    flex: 1,
    padding: spacing.xs
  },
  nestedBackBar: {
    backgroundColor: colors.surface,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm
  },

  /* Chữ */
  meetingTitle: {
    color: colors.textStrong,
    flex: 1,
    fontSize: 21,
    fontWeight: "800",
    letterSpacing: -0.5
  },
  itemTitle: {
    color: colors.text,
    flexShrink: 1,
    fontSize: 15,
    fontWeight: "800"
  },
  muted: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19
  },
  noteLine: {
    color: colors.warning,
    fontSize: 12.5,
    fontWeight: "700",
    marginTop: spacing.xs
  },
  warnText: {
    color: colors.danger,
    fontSize: 12.5,
    fontWeight: "700"
  },
  codeText: {
    color: colors.primaryDark,
    fontSize: 12.5,
    fontWeight: "800"
  },
  groupLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.6,
    marginTop: spacing.xs,
    textTransform: "uppercase"
  },
  minutesText: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 24
  },

  /* Tab ngang */
  tabBar: {
    backgroundColor: colors.surface,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexGrow: 0
  },
  tabChip: {
    alignItems: "center",
    borderBottomColor: "transparent",
    borderBottomWidth: 2.5,
    flexDirection: "row",
    gap: 5,
    minHeight: 46,
    paddingHorizontal: spacing.md
  },
  tabChipActive: { borderBottomColor: colors.primary },
  tabChipText: {
    color: colors.muted,
    fontSize: 13.5,
    fontWeight: "700"
  },
  tabChipTextActive: {
    color: colors.primary,
    fontWeight: "800"
  },
  tabCount: {
    backgroundColor: colors.primarySoft,
    borderRadius: radii.full,
    paddingHorizontal: 5,
    paddingVertical: 1
  },
  tabCountText: {
    color: colors.primaryDark,
    fontSize: 10,
    fontWeight: "800"
  },

  /* Tín hiệu realtime */
  signal: {
    alignItems: "center",
    flexDirection: "row",
    gap: 5
  },
  signalDot: {
    borderRadius: radii.full,
    height: 7,
    width: 7
  },
  signalOn: { backgroundColor: colors.success },
  signalOff: { backgroundColor: colors.warning },
  signalText: {
    color: colors.muted,
    fontSize: 11.5,
    fontWeight: "700"
  },

  /* Người tham dự */
  participantRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm
  },
  avatar: {
    alignItems: "center",
    backgroundColor: colors.surfaceSoft,
    borderColor: colors.primarySoft,
    borderRadius: radii.full,
    borderWidth: 1,
    height: 40,
    justifyContent: "center",
    width: 40
  },
  avatarOnline: {
    borderColor: colors.primary,
    borderWidth: 2
  },
  avatarText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: "800"
  },
  onlineDot: {
    backgroundColor: colors.success,
    borderColor: colors.surface,
    borderRadius: radii.full,
    borderWidth: 1.5,
    bottom: 0,
    height: 11,
    position: "absolute",
    right: 0,
    width: 11
  },

  /* Ô tìm kiếm */
  searchBox: {
    alignItems: "center",
    backgroundColor: colors.surfaceSunken,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm
  },
  searchInput: {
    color: colors.text,
    flex: 1,
    fontSize: 14.5,
    paddingVertical: spacing.sm
  },

  /* Chương trình */
  focusCard: {
    backgroundColor: colors.surfaceSoft,
    borderColor: colors.primarySoft,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: 2,
    padding: spacing.md
  },
  focusLabel: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase"
  },
  focusTitle: {
    color: colors.textStrong,
    fontSize: 16,
    fontWeight: "800"
  },
  focusMeta: {
    color: colors.muted,
    fontSize: 13
  },
  agendaRow: {
    borderRadius: radii.md,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.xs
  },
  agendaRowCurrent: {
    backgroundColor: colors.surfaceSoft
  },
  agendaIndex: {
    backgroundColor: colors.surfaceSoft,
    borderRadius: radii.full,
    color: colors.primary,
    fontSize: 13,
    fontWeight: "800",
    height: 28,
    lineHeight: 28,
    overflow: "hidden",
    textAlign: "center",
    width: 28
  },

  /* Tài liệu */
  docRow: {
    alignItems: "center",
    backgroundColor: colors.surfaceSunken,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.sm
  },
  docRowPresenting: {
    backgroundColor: colors.surfaceSoft,
    borderColor: colors.primary
  },
  docIcon: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.primarySoft,
    borderRadius: radii.md,
    borderWidth: 1,
    height: 40,
    justifyContent: "center",
    width: 40
  },

  /* Thống kê */
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  summaryTile: {
    backgroundColor: colors.surfaceSunken,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    flexGrow: 1,
    minWidth: 96,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  summaryTileLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "700"
  },
  summaryTileValue: {
    color: colors.primaryDark,
    fontSize: 20,
    fontWeight: "800"
  },
  summaryRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 2
  },
  summaryCount: {
    color: colors.primaryDark,
    fontSize: 14,
    fontWeight: "800"
  },
  progressTrack: {
    backgroundColor: colors.surfaceSunken,
    borderRadius: radii.full,
    height: 8,
    overflow: "hidden",
    width: "100%"
  },
  progressFill: {
    backgroundColor: colors.primary,
    borderRadius: radii.full,
    height: "100%"
  },

  /* Biểu quyết & nhiệm vụ */
  voteBox: {
    backgroundColor: colors.surfaceSunken,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md
  },
  answerText: {
    color: colors.success,
    fontWeight: "800"
  },

  /* Ghi chú */
  textArea: {
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
    borderRadius: radii.md,
    borderWidth: 1,
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
    minHeight: 150,
    marginTop: spacing.xs,
    padding: spacing.md,
    textAlignVertical: "top"
  },

  /* Trò chuyện */
  chatShell: {
    flex: 1,
    gap: spacing.sm
  },
  chatList: {
    flex: 1
  },
  chatListContent: {
    gap: spacing.xs,
    padding: spacing.md
  },
  chatComposer: {
    alignItems: "flex-end",
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: spacing.xs,
    padding: spacing.sm
  },
  chatInput: {
    backgroundColor: colors.surfaceSunken,
    borderColor: colors.borderStrong,
    borderRadius: radii.lg,
    borderWidth: 1,
    color: colors.text,
    flex: 1,
    fontSize: 15,
    maxHeight: 110,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  sendButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radii.full,
    height: 44,
    justifyContent: "center",
    width: 44,
    ...shadow(1)
  },
  sendButtonOff: {
    opacity: 0.45
  },
  messageBubble: {
    alignSelf: "flex-start",
    backgroundColor: colors.surface,
    borderBottomLeftRadius: radii.sm,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    maxWidth: "88%",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  messageBubbleMine: {
    alignSelf: "flex-end",
    backgroundColor: colors.surfaceSoft,
    borderBottomLeftRadius: radii.lg,
    borderBottomRightRadius: radii.sm,
    borderColor: colors.primarySoft
  },
  messageAuthor: {
    color: colors.primary,
    fontSize: 11.5,
    fontWeight: "800",
    marginBottom: 2
  },
  messageText: {
    color: colors.text,
    fontSize: 14.5,
    lineHeight: 21
  },
  messageTime: {
    color: colors.subtle,
    fontSize: 10.5,
    marginTop: 3,
    textAlign: "right"
  }
});
