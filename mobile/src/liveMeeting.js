import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { useKeepAwake } from "expo-keep-awake";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  RefreshControl,
  ScrollView,
  Text,
  View
} from "react-native";
import { apiRequest, defaultLivekitUrl, liveJoinUrl } from "./api";
import {
  BackBar,
  ErrorState,
  LoadingState,
  Panel,
  PrimaryButton,
  SecondaryButton,
  SectionTitle
} from "./components";
import { DocumentRoom } from "./documentRoom";
import { asArray, hasOnlineRoom } from "./format";
import {
  AgendaPanel,
  TranscriptPanel,
  AttendancePanel,
  ChatPanel,
  DocumentsPanel,
  MeetingTopCard,
  NotesPanel,
  ParticipantsPanel,
  TabStrip,
  TasksPanel,
  VotesPanel,
  isCheckedIn,
  styles
} from "./meetingUi";
import { useMeetingRoom, useSocketEvents } from "./realtime";
import { colors } from "./theme";
import { getVideoRoom } from "./video";

const TABS = [
  { key: "room", label: "Phòng họp", icon: "videocam-outline" },
  { key: "people", label: "Người dự", icon: "people-outline" },
  { key: "chat", label: "Trò chuyện", icon: "chatbubbles-outline" },
  { key: "transcript", label: "Lời nói", icon: "mic-outline" },
  { key: "agenda", label: "Chương trình", icon: "list-outline" },
  { key: "documents", label: "Tài liệu", icon: "document-text-outline" },
  { key: "votes", label: "Biểu quyết", icon: "checkbox-outline" },
  { key: "notes", label: "Ghi chú", icon: "create-outline" },
  { key: "attendance", label: "Điểm danh", icon: "checkmark-done-outline" },
  { key: "tasks", label: "Nhiệm vụ", icon: "briefcase-outline" }
];

const UPLOAD_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/*"
];

/**
 * Phòng họp trực tiếp trên điện thoại.
 *
 * Họp trực tuyến thì có camera/micro qua LiveKit; họp tập trung thì vẫn đủ
 * chương trình, tài liệu, điểm danh, biểu quyết, ghi chú và trò chuyện — đúng
 * tinh thần họp không giấy tờ.
 */
export function LiveMeetingScreen({ auth, meetingId, socket, realtimeStatus, onBack }) {
  const [meeting, setMeeting] = useState(null);
  const [config, setConfig] = useState(null);
  const [chat, setChat] = useState([]);
  // Ban ghi loi noi cua phong hop; dien thoai chi doc, viec ghi lam tren web.
  const [transcript, setTranscript] = useState([]);
  const [publicNotes, setPublicNotes] = useState("");
  const [personalNotes, setPersonalNotes] = useState("");
  const [voteResults, setVoteResults] = useState({});
  const [aiEnabled, setAiEnabled] = useState(false);
  const [activeTab, setActiveTab] = useState("room");
  const [expanded, setExpanded] = useState(false);
  const [openedDocument, setOpenedDocument] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [savingPublic, setSavingPublic] = useState(false);
  const [savingPersonal, setSavingPersonal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Đang họp thì không để màn hình tự tắt.
  useKeepAwake();

  const VideoRoom = useMemo(() => getVideoRoom(), []);

  const load = useCallback(async () => {
    const [
      meetingResult,
      configResult,
      chatResult,
      publicResult,
      personalResult,
      transcriptResult
    ] = await Promise.all([
      apiRequest(`/meetings/${meetingId}`, { token: auth.token }),
      apiRequest(`/meetings/${meetingId}/live-config`, { token: auth.token }),
      // scope=room: bỏ qua tin thảo luận nằm trong từng hộp tài liệu.
      apiRequest(`/meetings/${meetingId}/chat?limit=120&scope=room`, { token: auth.token }),
      apiRequest(`/meetings/${meetingId}/public-notes`, { token: auth.token }),
      apiRequest(`/meetings/${meetingId}/personal-notes`, { token: auth.token }),
      apiRequest(`/meetings/${meetingId}/transcript?limit=100`, { token: auth.token })
    ]);

    setMeeting(meetingResult.data);
    setConfig(configResult.data);
    setChat(chatResult.data || []);
    setPublicNotes(publicResult.data?.content || "");
    setPersonalNotes(personalResult.data?.content || "");
    setTranscript(transcriptResult.data || []);
  }, [meetingId, auth.token]);

  useEffect(() => {
    setLoading(true);
    setError("");
    load()
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    apiRequest("/documents/ai/status", { token: auth.token })
      .then((result) => setAiEnabled(Boolean(result.data?.configured)))
      .catch(() => setAiEnabled(false));
  }, [auth.token]);

  // Vào phòng realtime: máy chủ ghi nhận đang online và tự điểm danh hộ.
  useMeetingRoom(socket, meetingId, {
    onJoined(reply) {
      if (!reply.autoAttendance) return;
      auth.toast?.success(
        reply.autoAttendance.status === "LATE"
          ? "Đã ghi nhận bạn vào họp (đi muộn)"
          : "Đã ghi nhận bạn có mặt"
      );
    },
    onError(message) {
      setError(message);
    }
  });

  function patchParticipant(userId, patch) {
    setMeeting((current) =>
      current
        ? {
            ...current,
            participants: asArray(current.participants).map((item) =>
              item.user_id === userId ? { ...item, ...patch } : item
            )
          }
        : current
    );
  }

  useSocketEvents(socket, {
    // Loi noi duoc nhan dang tren may nguoi phat bieu (web) roi phat lai cho ca
    // phong, nen dien thoai theo duoc ban ghi ngay luc hop.
    transcript_segment(segment) {
      setTranscript((current) =>
        current.some((item) => item.id === segment.id) ? current : [...current, segment]
      );
    },
    transcript_updated(segment) {
      setTranscript((current) =>
        current.map((item) => (item.id === segment.id ? { ...item, ...segment } : item))
      );
    },
    transcript_removed({ id: segmentId }) {
      setTranscript((current) => current.filter((item) => item.id !== segmentId));
    },
    new_chat_message(message) {
      // Tin của hộp tài liệu do màn hình tài liệu tự xử lý.
      if (message.document_id) return;
      setChat((current) =>
        current.some((item) => item.id === message.id) ? current : [...current, message]
      );
    },
    hand_status_updated({ userId, isHandRaised }) {
      patchParticipant(userId, { is_hand_raised: isHandRaised });
    },
    participant_status_updated({ userId, isOnline }) {
      patchParticipant(userId, { is_online: isOnline });
    },
    attendance_updated({ userId, status, method, checkedInAt }) {
      patchParticipant(userId, {
        attendance_status: status,
        attendance_method: method,
        checked_in_at: checkedInAt || undefined
      });
    },
    meeting_status_updated(next) {
      setMeeting((current) => (current ? { ...current, ...next } : current));
      if (next.status === "FINISHED") auth.toast?.info("Cuộc họp đã kết thúc");
      if (next.status === "CANCELLED") auth.toast?.warning("Cuộc họp đã bị huỷ");
    },
    online_room_updated({ enabled }) {
      auth.toast?.info(
        enabled ? "Chủ tọa đã mở phòng họp trực tuyến" : "Phòng họp trực tuyến đã tắt"
      );
      // Phải lấy lại token LiveKit mới sau khi phòng được bật / tắt.
      load().catch(() => {});
    },
    speaker_mode_updated({ mode }) {
      setConfig((current) => (current ? { ...current, speakerMode: mode } : current));
      auth.toast?.info(
        mode === "MODERATED"
          ? "Chủ tọa đang điều hành lượt phát biểu"
          : "Đã chuyển sang tự do phát biểu"
      );
      load().catch(() => {});
    },
    speaker_updated({ userId }) {
      setConfig((current) =>
        current ? { ...current, currentSpeakerId: userId } : current
      );
      if (userId === auth.user?.id) {
        auth.toast?.success("Chủ tọa mời bạn phát biểu", "Bạn đã được bật micro.");
      }
      load().catch(() => {});
    },
    speak_permission_updated({ userId, canSpeak }) {
      patchParticipant(userId, { can_speak: canSpeak });
      // Quyền của chính mình đổi thì phải lấy vé LiveKit mới cho khớp.
      if (userId === auth.user?.id) load().catch(() => {});
    },
    chairman_changed({ fullName }) {
      auth.toast?.info("Đổi chủ tọa", `${fullName} đang điều hành cuộc họp`);
      load().catch(() => {});
    },
    public_notes_synced(note) {
      setPublicNotes(note?.content || "");
    },
    current_agenda_updated() {
      load().catch(() => {});
    },
    current_document_updated() {
      load().catch(() => {});
    },
    document_added(document) {
      auth.toast?.info("Tài liệu mới", document.display_name);
      load().catch(() => {});
    },
    document_updated() {
      load().catch(() => {});
    },
    document_removed() {
      load().catch(() => {});
    },
    vote_opened(vote) {
      auth.toast?.warning("Biểu quyết đang mở", vote?.title);
      load().catch(() => {});
    },
    vote_closed(vote) {
      if (vote?.results) {
        setVoteResults((current) => ({
          ...current,
          [vote.id]: { results: vote.results, summary: vote.summary }
        }));
      }
      load().catch(() => {});
    },
    vote_result_updated({ voteId, results, summary }) {
      setVoteResults((current) => ({
        ...current,
        [voteId]: { results, summary: summary || current[voteId]?.summary }
      }));
    }
  });

  async function run(action, success) {
    setError("");
    setBusy(true);
    try {
      await action();
      if (success) auth.toast?.success(success);
      await load();
    } catch (err) {
      setError(err.message);
      auth.toast?.error("Thao tác thất bại", err.message);
    } finally {
      setBusy(false);
    }
  }

  async function refresh() {
    setRefreshing(true);
    setError("");
    try {
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setRefreshing(false);
    }
  }

  const permissions = config?.permissions || {};
  const canEditSharedNotes = permissions.canEditSharedNotes === true;
  const moderated = config?.speakerMode === "MODERATED";
  const me = asArray(meeting?.participants).find((item) => item.user_id === auth.user?.id);
  const onlineRoomOn = hasOnlineRoom(meeting) && Boolean(config?.roomName);
  const livekitUrl = config?.livekitUrl || defaultLivekitUrl();

  function toggleHand() {
    if (!socket?.connected) {
      auth.toast?.warning("Mất kết nối realtime", "Không gửi được tín hiệu giơ tay.");
      return;
    }
    socket.emit(me?.is_hand_raised ? "lower_hand" : "raise_hand", { meetingId });
  }

  /**
   * Gửi qua REST để vẫn hoạt động khi socket chập chờn; máy chủ phát lại cho cả
   * phòng. Tự chèn bản ghi trả về để tin của mình hiện ngay cả lúc mất realtime,
   * lọc trùng theo id nên không bị nhân đôi khi socket gửi về.
   */
  async function sendChat(content) {
    try {
      const result = await apiRequest(`/meetings/${meetingId}/chat`, {
        method: "POST",
        token: auth.token,
        body: { content }
      });
      const sent = result?.data;
      if (sent) {
        setChat((current) =>
          current.some((item) => item.id === sent.id) ? current : [...current, sent]
        );
      }
    } catch (err) {
      auth.toast?.error("Không gửi được tin nhắn", err.message);
      // Ném tiếp để ô soạn tin giữ lại nội dung vừa gõ.
      throw err;
    }
  }

  const checkIn = () =>
    run(
      () =>
        apiRequest(`/meetings/${meetingId}/attendance/checkin`, {
          method: "POST",
          token: auth.token,
          body: {}
        }),
      "Bạn đã điểm danh"
    );

  const answerVote = (voteId, answer) =>
    run(
      () =>
        apiRequest(`/votes/${voteId}/responses`, {
          method: "POST",
          token: auth.token,
          body: { answer }
        }),
      "Đã gửi phiếu biểu quyết"
    );

  const loadVoteResults = useCallback(
    async (voteId) => {
      const result = await apiRequest(`/votes/${voteId}/results`, { token: auth.token });
      setVoteResults((current) => ({
        ...current,
        [voteId]: { results: result.data.results || [], summary: result.data.summary }
      }));
    },
    [auth.token]
  );

  const updateTask = (taskId, status) =>
    run(
      () =>
        apiRequest(`/tasks/${taskId}/status`, {
          method: "PUT",
          token: auth.token,
          body: { status }
        }),
      status === "DONE" ? "Đã hoàn thành nhiệm vụ" : "Đã cập nhật nhiệm vụ"
    );

  async function savePublicNotes() {
    setSavingPublic(true);
    try {
      const result = await apiRequest(`/meetings/${meetingId}/public-notes`, {
        method: "PUT",
        token: auth.token,
        body: { content: publicNotes }
      });
      // Báo cho những người đang mở phòng họp cập nhật theo.
      socket?.emit("public_notes_updated", {
        meetingId,
        content: result.data?.content ?? publicNotes
      });
      auth.toast?.success("Đã lưu ghi chú chung");
    } catch (err) {
      setError(err.message);
      auth.toast?.error("Không lưu được ghi chú chung", err.message);
    } finally {
      setSavingPublic(false);
    }
  }

  async function savePersonalNotes() {
    setSavingPersonal(true);
    try {
      await apiRequest(`/meetings/${meetingId}/personal-notes`, {
        method: "PUT",
        token: auth.token,
        body: { content: personalNotes }
      });
      auth.toast?.success("Đã lưu ghi chú cá nhân");
    } catch (err) {
      setError(err.message);
      auth.toast?.error("Không lưu được ghi chú cá nhân", err.message);
    } finally {
      setSavingPersonal(false);
    }
  }

  async function uploadDocument() {
    const picked = await DocumentPicker.getDocumentAsync({
      type: UPLOAD_TYPES,
      copyToCacheDirectory: true
    });
    if (picked.canceled) return;

    const file = picked.assets[0];
    const form = new FormData();
    form.append("file", {
      uri: file.uri,
      name: file.name,
      type: file.mimeType || "application/octet-stream"
    });
    form.append("displayName", file.name);

    setUploading(true);
    try {
      await run(
        () =>
          apiRequest(`/meetings/${meetingId}/documents`, {
            method: "POST",
            token: auth.token,
            body: form,
            multipart: true
          }),
        "Đã gửi tài liệu cho phòng họp"
      );
    } finally {
      setUploading(false);
    }
  }

  async function openInBrowser() {
    if (!config?.livekitToken) {
      auth.toast?.warning("Chưa có phòng online", "Cuộc họp này chưa bật phòng trực tuyến.");
      return;
    }
    await Linking.openURL(liveJoinUrl(meetingId, config.livekitToken));
  }

  if (loading) return <LoadingState />;

  if (!meeting || !config) {
    return (
      <View style={styles.screenContent}>
        {!!onBack && <BackBar label="Rời phòng họp" onPress={onBack} />}
        <ErrorState message={error || "Không mở được phòng họp"} />
      </View>
    );
  }

  const videoStage =
    onlineRoomOn && config.livekitToken && VideoRoom ? (
      <VideoRoom
        serverUrl={livekitUrl}
        token={config.livekitToken}
        canSpeak={permissions.canSpeak !== false}
        canShareScreen={Boolean(permissions.canShareScreen)}
        expanded={expanded}
        onToggleExpand={() => setExpanded((value) => !value)}
        onError={(message) => setError(message)}
        onLeave={onBack}
      />
    ) : null;

  // Toàn màn hình: chỉ còn khung video, các tab tạm ẩn đi.
  if (expanded && videoStage) {
    return <View style={styles.videoFullScreen}>{videoStage}</View>;
  }

  const openVotes = asArray(meeting.votes).filter(
    (vote) => vote.status === "OPEN" && !vote.my_answer
  ).length;
  const tabs = TABS.map((tab) => {
    if (tab.key === "chat") return { ...tab, badge: chat.length };
    if (tab.key === "votes") return { ...tab, badge: openVotes };
    if (tab.key === "documents") return { ...tab, badge: asArray(meeting.documents).length };
    return tab;
  });

  return (
    <View style={styles.detailShell}>
      {!!onBack && (
        <View style={styles.nestedBackBar}>
          <BackBar label="Rời phòng họp" onPress={onBack} />
        </View>
      )}
      <TabStrip tabs={tabs} active={activeTab} onChange={setActiveTab} />

      {activeTab === "chat" ? (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ChatPanel
            messages={chat}
            currentUserId={auth.user?.id}
            onSend={sendChat}
            emptyText="Chưa có tin nhắn nào trong phòng họp"
          />
        </KeyboardAvoidingView>
      ) : (
        <ScrollView
          style={styles.screen}
          contentContainerStyle={styles.screenContent}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        >
          <ErrorState message={error} />

          {activeTab === "room" && (
            <>
              <MeetingTopCard
                meeting={meeting}
                realtimeStatus={realtimeStatus}
                roleInMeeting={permissions.roleInMeeting}
                note={
                  moderated
                    ? "Cuộc họp đang do chủ tọa điều hành lượt phát biểu."
                    : null
                }
              />

              {videoStage}

              {!videoStage && (
                <Panel>
                  <SectionTitle title="Phòng họp" />
                  <View style={styles.stack}>
                    {!onlineRoomOn ? (
                      <Text style={styles.muted}>
                        Cuộc họp tập trung tại {meeting.room_name || "phòng họp"}. Chủ tọa chưa
                        bật phòng trực tuyến — bạn vẫn theo dõi chương trình, tài liệu, biểu
                        quyết và ghi chú ngay tại đây.
                      </Text>
                    ) : !VideoRoom ? (
                      <>
                        <Text style={styles.muted}>
                          Phòng họp trực tuyến đang bật nhưng bản cài đặt này chưa kèm module
                          video (đang chạy trên Expo Go). Dùng bản APK đã build để bật
                          camera/micro ngay trong app, hoặc mở tạm bằng trình duyệt.
                        </Text>
                        <PrimaryButton
                          icon="open-outline"
                          title="Mở phòng video bằng trình duyệt"
                          onPress={openInBrowser}
                        />
                      </>
                    ) : (
                      <Text style={styles.muted}>
                        Chưa lấy được vé vào phòng video. Kéo màn hình xuống để tải lại.
                      </Text>
                    )}
                  </View>
                </Panel>
              )}

              <Panel>
                <SectionTitle title="Tham gia của bạn" />
                <View style={styles.stack}>
                  <View style={styles.inlineWrap}>
                    <PrimaryButton
                      icon={me?.is_hand_raised ? "hand-left" : "hand-left-outline"}
                      title={me?.is_hand_raised ? "Hạ tay" : "Giơ tay phát biểu"}
                      onPress={toggleHand}
                    />
                    <SecondaryButton
                      icon="checkmark-outline"
                      title={isCheckedIn(me) ? "Đã điểm danh" : "Điểm danh"}
                      onPress={() => checkIn(null)}
                      disabled={meeting.status !== "ONGOING" || isCheckedIn(me) || busy}
                    />
                  </View>

                  <PermissionRow
                    icon="mic-outline"
                    granted={permissions.canSpeak !== false}
                    onText="Được phát biểu"
                    offText={
                      moderated
                        ? "Giơ tay và chờ chủ tọa mời phát biểu"
                        : "Chủ tọa chưa cấp quyền phát biểu"
                    }
                  />
                  <PermissionRow
                    icon="phone-portrait-outline"
                    granted={Boolean(permissions.canShareScreen)}
                    onText="Được chia sẻ màn hình"
                    offText="Không được chia sẻ màn hình"
                  />
                  <PermissionRow
                    icon="cloud-upload-outline"
                    granted={Boolean(permissions.canUploadDocument)}
                    onText="Được gửi tài liệu"
                    offText="Không được gửi tài liệu trong phòng"
                  />
                </View>
              </Panel>
            </>
          )}

          {activeTab === "people" && (
            <ParticipantsPanel
              participants={meeting.participants}
              currentUserId={auth.user?.id}
              organizerName={meeting.organizer_name}
              showPresence
            />
          )}

          {activeTab === "transcript" && (
            <TranscriptPanel meetingId={meetingId} auth={auth} segments={transcript} />
          )}

          {activeTab === "agenda" && <AgendaPanel agenda={meeting.agenda} />}

          {activeTab === "documents" && (
            <DocumentsPanel
              documents={meeting.documents}
              canUpload={Boolean(permissions.canUploadDocument)}
              uploading={uploading}
              onUpload={uploadDocument}
              onOpenDocument={setOpenedDocument}
              note={
                permissions.canUploadDocument
                  ? "Chạm vào tài liệu để xem, ghi chú, hỏi AI và trao đổi cùng phòng họp."
                  : "Chủ tọa chưa cho phép bạn gửi tài liệu trong phòng họp này."
              }
            />
          )}

          {activeTab === "votes" && (
            <VotesPanel
              meeting={meeting}
              results={voteResults}
              busy={busy}
              onAnswer={answerVote}
              onLoadResults={loadVoteResults}
            />
          )}

          {activeTab === "notes" && (
            <NotesPanel
              publicNotes={publicNotes}
              personalNotes={personalNotes}
              canEditPublic={canEditSharedNotes}
              savingPublic={savingPublic}
              savingPersonal={savingPersonal}
              onChangePublic={setPublicNotes}
              onChangePersonal={setPersonalNotes}
              onSavePublic={savePublicNotes}
              onSavePersonal={savePersonalNotes}
            />
          )}

          {activeTab === "attendance" && (
            <AttendancePanel
              meeting={meeting}
              currentUserId={auth.user?.id}
              busy={busy}
              onCheckIn={checkIn}
            />
          )}

          {activeTab === "tasks" && (
            <TasksPanel tasks={meeting.tasks} busy={busy} onStatus={updateTask} />
          )}
        </ScrollView>
      )}

      <DocumentRoom
        visible={Boolean(openedDocument)}
        document={openedDocument}
        auth={auth}
        meetingId={meetingId}
        socket={socket}
        canEditNotes={canEditSharedNotes}
        canSummarize={canEditSharedNotes}
        aiEnabled={aiEnabled}
        onClose={() => setOpenedDocument(null)}
      />
    </View>
  );
}

function PermissionRow({ icon, granted, onText, offText }) {
  return (
    <View style={styles.participantRow}>
      <Ionicons name={icon} size={18} color={granted ? colors.success : colors.muted} />
      <Text style={[styles.itemTitle, styles.flex]}>{granted ? onText : offText}</Text>
      <Ionicons
        name={granted ? "checkmark-circle" : "close-circle-outline"}
        size={18}
        color={granted ? colors.success : colors.subtle}
      />
    </View>
  );
}
