import * as DocumentPicker from "expo-document-picker";
import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { apiRequest } from "./api";
import {
  BackBar,
  ErrorState,
  LoadingState,
  Panel,
  PrimaryButton,
  SecondaryButton,
  SectionTitle,
  StatusPill
} from "./components";
import { DocumentRoom } from "./documentRoom";
import { asArray, hasOnlineRoom } from "./format";
import {
  AgendaPanel,
  AttendancePanel,
  DocumentsPanel,
  MeetingTopCard,
  MinutesPanel,
  ParticipantsPanel,
  TabStrip,
  TranscriptPanel,
  TasksPanel,
  VotesPanel,
  styles
} from "./meetingUi";
import { useSocketEvents } from "./realtime";

const TABS = [
  { key: "overview", label: "Tổng quan", icon: "information-circle-outline" },
  { key: "documents", label: "Tài liệu", icon: "document-text-outline" },
  { key: "transcript", label: "Lời nói", icon: "mic-outline" },
  { key: "agenda", label: "Chương trình", icon: "list-outline" },
  { key: "attendance", label: "Điểm danh", icon: "checkmark-done-outline" },
  { key: "votes", label: "Biểu quyết", icon: "checkbox-outline" },
  { key: "minutes", label: "Biên bản", icon: "reader-outline" },
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
 * Hồ sơ đầy đủ của một cuộc họp: thành phần, tài liệu, chương trình, điểm danh,
 * biểu quyết, biên bản và nhiệm vụ — đúng những gì người tham dự thấy trên web.
 *
 * Màn hình vẫn nghe realtime dù chưa vào phòng họp, nên lời mời, tài liệu mới hay
 * biểu quyết vừa mở đều hiện lên ngay.
 */
export function MeetingDetailScreen({
  auth,
  meetingId,
  socket,
  realtimeStatus,
  onBack,
  onOpenLive
}) {
  const [meeting, setMeeting] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [voteResults, setVoteResults] = useState({});
  const [aiEnabled, setAiEnabled] = useState(false);
  const [openedDocument, setOpenedDocument] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const result = await apiRequest(`/meetings/${meetingId}`, { token: auth.token });
    setMeeting(result.data);
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

  /**
   * Màn hình này cố tình KHÔNG vào phòng realtime của cuộc họp: vào phòng là bị
   * ghi nhận đang online và tự điểm danh, trong khi người dùng mới chỉ xem hồ sơ.
   *
   * Bù lại, mọi việc đáng chú ý (duyệt tài liệu, mở/chốt biểu quyết, đổi lịch,
   * ban hành biên bản, giao nhiệm vụ) đều sinh thông báo gửi riêng cho từng
   * người — nhận được thông báo của đúng cuộc họp này thì tải lại hồ sơ.
   */
  useSocketEvents(socket, {
    "notification:new"(notification) {
      if (notification?.meeting_id !== meetingId) return;
      load().catch(() => {});
    }
  });

  async function run(action, success) {
    setError("");
    setBusy(true);
    try {
      await action();
      if (success) auth.toast?.success(success);
      await load();
      return true;
    } catch (err) {
      setError(err.message);
      auth.toast?.error("Thao tác thất bại", err.message);
      return false;
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

  async function respondInvitation(action) {
    await run(
      () =>
        apiRequest(`/meetings/${meetingId}/invitation/${action}`, {
          method: "PUT",
          token: auth.token
        }),
      action === "accept" ? "Đã xác nhận tham dự" : "Đã từ chối lời mời"
    );
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
        "Đã gửi tài liệu, chờ chủ tọa duyệt"
      );
    } finally {
      setUploading(false);
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

  if (loading) return <LoadingState />;

  if (!meeting) {
    return (
      <View style={styles.screenContent}>
        {!!onBack && <BackBar label="Danh sách cuộc họp" onPress={onBack} />}
        <ErrorState message={error || "Không tìm thấy cuộc họp"} />
      </View>
    );
  }

  const me = asArray(meeting.participants).find((item) => item.user_id === auth.user?.id);
  // Máy chủ đã tính sẵn quyền theo vai trò trong cuộc họp.
  const perm = meeting.permissions || {};
  const canJoinRoom = ["ONGOING", "UPCOMING"].includes(meeting.status);
  const tabs = TABS.map((tab) => {
    if (tab.key === "documents") return { ...tab, badge: asArray(meeting.documents).length };
    if (tab.key === "tasks") return { ...tab, badge: asArray(meeting.tasks).length };
    if (tab.key === "votes") {
      return {
        ...tab,
        badge: asArray(meeting.votes).filter(
          (vote) => vote.status === "OPEN" && !vote.my_answer
        ).length
      };
    }
    return tab;
  });

  return (
    <View style={styles.detailShell}>
      {!!onBack && (
        <View style={styles.nestedBackBar}>
          <BackBar label="Danh sách cuộc họp" onPress={onBack} />
        </View>
      )}
      <TabStrip tabs={tabs} active={activeTab} onChange={setActiveTab} />

      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.screenContent}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      >
        <MeetingTopCard
          meeting={meeting}
          realtimeStatus={realtimeStatus}
          roleInMeeting={me?.role_in_meeting}
        >
          <View style={styles.rowWrap}>
            {!!onOpenLive && canJoinRoom && (
              <PrimaryButton
                icon={hasOnlineRoom(meeting) ? "videocam-outline" : "easel-outline"}
                title={meeting.status === "ONGOING" ? "Vào phòng họp" : "Vào phòng chờ"}
                onPress={onOpenLive}
              />
            )}
            {me?.invitation_status === "PENDING" && (
              <>
                <SecondaryButton
                  icon="checkmark-outline"
                  title="Nhận lời"
                  onPress={() => respondInvitation("accept")}
                  disabled={busy}
                />
                <SecondaryButton
                  icon="close-outline"
                  title="Từ chối"
                  onPress={() => respondInvitation("decline")}
                  disabled={busy}
                />
              </>
            )}
          </View>
        </MeetingTopCard>

        <ErrorState message={error} />

        {activeTab === "overview" && (
          <>
            <Panel>
              <SectionTitle title="Thông tin chung" />
              <View style={styles.stack}>
                <InfoRow label="Chủ tọa" value={meeting.organizer_name} />
                <InfoRow label="Hình thức" value={<StatusPill value={meeting.meeting_type} />} />
                <InfoRow
                  label="Lời mời của bạn"
                  value={<StatusPill value={me?.invitation_status || "PENDING"} />}
                />
                <InfoRow
                  label="Điểm danh"
                  value={<StatusPill value={me?.attendance_status || "ABSENT"} />}
                />
                {!!meeting.description && (
                  <Text style={styles.muted}>{meeting.description}</Text>
                )}
              </View>
            </Panel>
            <ParticipantsPanel
              participants={meeting.participants}
              currentUserId={auth.user?.id}
              organizerName={meeting.organizer_name}
            />
          </>
        )}

        {activeTab === "documents" && (
          <DocumentsPanel
            documents={meeting.documents}
            canUpload={perm.canUploadDocument !== false}
            uploading={uploading}
            onUpload={uploadDocument}
            onOpenDocument={setOpenedDocument}
            note={
              perm.canReviewDocument
                ? "Tài liệu bạn đăng hiển thị ngay cho cả phòng họp."
                : "Tài liệu bạn gửi sẽ hiển thị cho cả phòng sau khi chủ tọa duyệt."
            }
          />
        )}

        {activeTab === "transcript" && (
          <TranscriptPanel meetingId={meetingId} auth={auth} />
        )}

        {activeTab === "agenda" && <AgendaPanel agenda={meeting.agenda} />}

        {activeTab === "attendance" && (
          <AttendancePanel
            meeting={meeting}
            currentUserId={auth.user?.id}
            busy={busy}
            onCheckIn={checkIn}
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

        {activeTab === "minutes" && (
          <MinutesPanel
            meetingId={meetingId}
            auth={auth}
            canSign={perm.canSignMinutes}
            canDraft={perm.canDraftMinutes}
            aiEnabled={aiEnabled}
            onNotice={(message) => auth.toast?.success(message)}
            onError={(message) => auth.toast?.error("Thao tác thất bại", message)}
          />
        )}

        {activeTab === "tasks" && (
          <TasksPanel tasks={meeting.tasks} busy={busy} onStatus={updateTask} />
        )}
      </ScrollView>

      <DocumentRoom
        visible={Boolean(openedDocument)}
        document={openedDocument}
        auth={auth}
        meetingId={meetingId}
        socket={socket}
        canEditNotes={perm.canEditSharedNotes}
        canSummarize={perm.canEditSharedNotes}
        aiEnabled={aiEnabled}
        onClose={() => setOpenedDocument(null)}
      />
    </View>
  );
}

function InfoRow({ label, value }) {
  return (
    <View style={styles.rowBetween}>
      <Text style={styles.muted}>{label}</Text>
      {typeof value === "string" ? (
        <Text style={styles.itemTitle}>{value || "-"}</Text>
      ) : (
        value
      )}
    </View>
  );
}
