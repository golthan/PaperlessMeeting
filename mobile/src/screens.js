import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { useEffect, useMemo, useState } from "react";
import {
  Image,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { apiRequest, documentDownloadUrl, liveJoinUrl } from "./api";
import {
  BackBar,
  CardRow,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  Panel,
  PrimaryButton,
  SecondaryButton,
  SectionTitle,
  StatBox,
  StatusPill
} from "./components";
import { asArray, formatDate, formatDateTime } from "./format";
import { colors, radii, shadow, spacing } from "./theme";

export function LoginScreen({ auth, booting }) {
  const [email, setEmail] = useState("participant1@example.com");
  const [password, setPassword] = useState("123456");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setLoading(true);
    setError("");
    try {
      const data = await apiRequest("/auth/login", {
        method: "POST",
        body: { email, password }
      });
      await auth.login({ token: data.token, user: data.user });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (booting) {
    return (
      <View style={styles.centerScreen}>
        <Text style={styles.brandTitle}>Paperless Meeting</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.authScreen} keyboardShouldPersistTaps="handled">
      <View style={styles.brandLogoWrap}>
        <Image
          source={require("../assets/logo-hvktmm.png")}
          style={styles.brandLogo}
          resizeMode="contain"
        />
      </View>
      <Text style={styles.brandTitle}>Paperless Meeting</Text>
      <Text style={styles.brandAcademy}>Học viện Kỹ thuật Mật mã</Text>
      <Text style={styles.brandSubtitle}>Ứng dụng điện thoại cho người tham dự</Text>

      <Panel style={styles.authPanel}>
        <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" />
        <Field
          label="Mật khẩu"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
        <ErrorState message={error} />
        <PrimaryButton
          icon="log-in-outline"
          title={loading ? "Đang đăng nhập..." : "Đăng nhập"}
          onPress={submit}
          disabled={loading}
        />
        <View style={styles.quickLoginRow}>
          <SecondaryButton
            title="Participant 1"
            onPress={() => setEmail("participant1@example.com")}
          />
          <SecondaryButton
            title="Participant 2"
            onPress={() => setEmail("participant2@example.com")}
          />
        </View>
      </Panel>
    </ScrollView>
  );
}

export function DashboardScreen({ auth, refreshKey }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    const result = await apiRequest("/dashboard/participant", {
      token: auth.token
    });
    setData(result.data);
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, [refreshKey]);

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

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.screenContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
    >
      <ErrorState message={error} />
      {!data ? (
        <LoadingState />
      ) : (
        <>
          <View style={styles.statGrid}>
            <StatBox icon="calendar-outline" label="Lời mời họp" value={data.invitedMeetings} />
            <StatBox icon="time-outline" label="Chờ phản hồi" value={data.pendingInvites} />
            <StatBox icon="checkbox-outline" label="Vote đang mở" value={data.openVotes} />
            <StatBox
              icon="list-outline"
              label="Nhiệm vụ"
              value={asArray(data.tasksByStatus).reduce((sum, item) => sum + Number(item.count), 0)}
            />
          </View>
          <Panel>
            <SectionTitle title="Nhiệm vụ theo trạng thái" />
            {asArray(data.tasksByStatus).length === 0 ? (
              <EmptyState title="Chưa có nhiệm vụ" />
            ) : (
              <View style={styles.stack}>
                {data.tasksByStatus.map((item) => (
                  <View key={item.status} style={styles.summaryRow}>
                    <StatusPill value={item.status} />
                    <Text style={styles.summaryCount}>{item.count}</Text>
                  </View>
                ))}
              </View>
            )}
          </Panel>
        </>
      )}
    </ScrollView>
  );
}

export function MeetingsScreen({ auth, refreshKey, onOpenMeeting }) {
  const [meetings, setMeetings] = useState([]);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    const result = await apiRequest("/meetings/my-invited", {
      token: auth.token
    });
    setMeetings(result.data || []);
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, [refreshKey]);

  async function updateInvitation(meetingId, action) {
    setError("");
    try {
      await apiRequest(`/meetings/${meetingId}/invitation/${action}`, {
        method: "PUT",
        token: auth.token
      });
      await load();
      auth.toast?.success(
        action === "accept" ? "Đã xác nhận tham dự" : "Đã từ chối lời mời",
        "Người tổ chức sẽ nhận được phản hồi của bạn."
      );
    } catch (err) {
      setError(err.message);
      auth.toast?.error("Không cập nhật được lời mời", err.message);
    }
  }

  async function refresh() {
    setRefreshing(true);
    try {
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.screenContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
    >
      <ErrorState message={error} />
      {meetings.length === 0 ? (
        <EmptyState title="Chưa có cuộc họp được mời" />
      ) : (
        <View style={styles.stack}>
          {meetings.map((meeting) => (
            <CardRow
              key={meeting.id}
              title={meeting.title}
              subtitle={`${formatDateTime(meeting.start_time)} · ${meeting.room_name || meeting.online_room_name || meeting.meeting_type || ""}`}
              meta={meeting.organizer_name}
              onPress={() => onOpenMeeting(meeting.id)}
              right={
                <View style={styles.cardActions}>
                  <StatusPill value={meeting.invitation_status} />
                  <View style={styles.inlineButtons}>
                    <Pressable
                      style={styles.smallButton}
                      onPress={() => updateInvitation(meeting.id, "accept")}
                    >
                      <Ionicons name="checkmark" size={16} color={colors.success} />
                    </Pressable>
                    <Pressable
                      style={styles.smallButton}
                      onPress={() => updateInvitation(meeting.id, "decline")}
                    >
                      <Ionicons name="close" size={16} color={colors.danger} />
                    </Pressable>
                  </View>
                </View>
              }
            />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

export function TasksScreen({ auth, refreshKey }) {
  const [tasks, setTasks] = useState([]);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    const result = await apiRequest("/tasks/my", {
      token: auth.token
    });
    setTasks(result.data || []);
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, [refreshKey]);

  async function updateStatus(taskId, status) {
    setError("");
    try {
      await apiRequest(`/tasks/${taskId}/status`, {
        method: "PUT",
        token: auth.token,
        body: { status }
      });
      await load();
      auth.toast?.success(
        status === "DONE" ? "Đã hoàn thành nhiệm vụ" : "Đã cập nhật trạng thái nhiệm vụ"
      );
    } catch (err) {
      setError(err.message);
      auth.toast?.error("Không cập nhật được nhiệm vụ", err.message);
    }
  }

  async function refresh() {
    setRefreshing(true);
    try {
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.screenContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
    >
      <ErrorState message={error} />
      {tasks.length === 0 ? (
        <EmptyState title="Bạn chưa có nhiệm vụ" />
      ) : (
        <View style={styles.stack}>
          {tasks.map((task) => (
            <Panel key={task.id}>
              <View style={styles.rowBetween}>
                <Text style={styles.itemTitle}>{task.title}</Text>
                <StatusPill value={task.status} />
              </View>
              <Text style={styles.muted}>{task.meeting_title}</Text>
              <Text style={styles.muted}>Deadline: {formatDate(task.deadline)}</Text>
              <View style={styles.rowWrap}>
                <StatusPill value={task.priority} />
                {task.status !== "IN_PROGRESS" && task.status !== "DONE" && (
                  <SecondaryButton
                    icon="play-outline"
                    title="Đang làm"
                    onPress={() => updateStatus(task.id, "IN_PROGRESS")}
                  />
                )}
                {task.status !== "DONE" && (
                  <PrimaryButton
                    icon="checkmark-outline"
                    title="Hoàn thành"
                    onPress={() => updateStatus(task.id, "DONE")}
                  />
                )}
              </View>
            </Panel>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

export function MeetingDetailScreen({ auth, meetingId, onOpenLive, onBack }) {
  const [meeting, setMeeting] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [voteResults, setVoteResults] = useState({});

  async function load() {
    const result = await apiRequest(`/meetings/${meetingId}`, {
      token: auth.token
    });
    setMeeting(result.data);
  }

  useEffect(() => {
    setLoading(true);
    load()
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [meetingId]);

  async function run(action, success) {
    setError("");
    try {
      await action();
      if (success) auth.toast?.success(success);
      await load();
    } catch (err) {
      setError(err.message);
      auth.toast?.error("Thao tác thất bại", err.message);
    }
  }

  async function uploadSupplementDocument() {
    const result = await DocumentPicker.getDocumentAsync({
      type: [
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      ],
      copyToCacheDirectory: true
    });

    if (result.canceled) return;
    const file = result.assets[0];
    const form = new FormData();
    form.append("file", {
      uri: file.uri,
      name: file.name,
      type: file.mimeType || "application/octet-stream"
    });
    form.append("displayName", file.name);

    await run(
      () =>
        apiRequest(`/meetings/${meetingId}/documents`, {
          method: "POST",
          token: auth.token,
          body: form,
          multipart: true
        }),
      "Tài liệu đã gửi và đang chờ duyệt."
    );
  }

  async function checkIn() {
    await run(
      () =>
        apiRequest(`/meetings/${meetingId}/attendance/checkin`, {
          method: "POST",
          token: auth.token,
          body: {}
        }),
      "Bạn đã điểm danh."
    );
  }

  async function answerVote(voteId, answer) {
    await run(
      () =>
        apiRequest(`/votes/${voteId}/responses`, {
          method: "POST",
          token: auth.token,
          body: { answer }
        }),
      "Đã gửi phiếu biểu quyết."
    );
  }

  async function loadResults(voteId) {
    setError("");
    try {
      const result = await apiRequest(`/votes/${voteId}/results`, {
        token: auth.token
      });
      setVoteResults((current) => ({
        ...current,
        [voteId]: result.data.results || []
      }));
    } catch (err) {
      setError(err.message);
    }
  }

  async function updateTaskStatus(taskId, status) {
    await run(() =>
      apiRequest(`/tasks/${taskId}/status`, {
        method: "PUT",
        token: auth.token,
        body: { status }
      })
    );
  }

  if (loading) return <LoadingState />;
  if (!meeting) {
    return (
      <View style={styles.screenContent}>
        {!!onBack && <BackBar label="Danh sách cuộc họp" onPress={onBack} />}
        <ErrorState message={error || "Không tìm thấy cuộc họp"} />
      </View>
    );
  }

  return (
    <View style={styles.detailShell}>
      {!!onBack && (
        <View style={styles.nestedBackBar}>
          <BackBar label="Danh sách cuộc họp" onPress={onBack} />
        </View>
      )}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBar}>
        {detailTabs.map((tab) => (
          <Pressable
            key={tab.key}
            style={[styles.tabChip, activeTab === tab.key && styles.tabChipActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Ionicons
              name={tab.icon}
              size={16}
              color={activeTab === tab.key ? colors.primary : colors.muted}
            />
            <Text style={[styles.tabChipText, activeTab === tab.key && styles.tabChipTextActive]}>
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView style={styles.screen} contentContainerStyle={styles.screenContent}>
        <Panel>
          <View style={styles.rowBetween}>
            <Text style={styles.meetingTitle}>{meeting.title}</Text>
            <StatusPill value={meeting.status} />
          </View>
          <Text style={styles.muted}>{formatDateTime(meeting.start_time)}</Text>
          <Text style={styles.muted}>
            {meeting.room_name || meeting.online_room_name || meeting.meeting_type}
          </Text>
          {onOpenLive && meeting.status === "ONGOING" && meeting.meeting_type !== "OFFLINE" && (
            <View style={styles.rowWrap}>
              <PrimaryButton
                icon="videocam-outline"
                title="Vào phòng Live"
                onPress={onOpenLive}
              />
            </View>
          )}
        </Panel>

        <ErrorState message={error} />

        {activeTab === "overview" && <OverviewTab meeting={meeting} />}
        {activeTab === "documents" && (
          <DocumentsTab
            meeting={meeting}
            token={auth.token}
            onUpload={uploadSupplementDocument}
          />
        )}
        {activeTab === "agenda" && <AgendaTab meeting={meeting} />}
        {activeTab === "attendance" && (
          <AttendanceTab meeting={meeting} onCheckIn={checkIn} />
        )}
        {activeTab === "votes" && (
          <VotesTab
            meeting={meeting}
            results={voteResults}
            onAnswer={answerVote}
            onResults={loadResults}
          />
        )}
        {activeTab === "minutes" && <MinutesTab meeting={meeting} />}
        {activeTab === "tasks" && (
          <MeetingTasksTab meeting={meeting} onStatus={updateTaskStatus} />
        )}
      </ScrollView>
    </View>
  );
}

function OverviewTab({ meeting }) {
  return (
    <Panel>
      <SectionTitle title="Người tham dự" />
      {asArray(meeting.participants).length === 0 ? (
        <EmptyState title="Chưa có người tham dự" />
      ) : (
        <View style={styles.stack}>
          {meeting.participants.map((participant) => (
            <View key={participant.user_id} style={styles.participantRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {(participant.full_name || "?").slice(0, 1).toUpperCase()}
                </Text>
              </View>
              <View style={styles.flex}>
                <Text style={styles.itemTitle}>{participant.full_name}</Text>
                <Text style={styles.muted}>{participant.email}</Text>
              </View>
              <View style={styles.stackSmall}>
                <StatusPill value={participant.invitation_status} />
                <StatusPill value={participant.attendance_status || "ABSENT"} />
              </View>
            </View>
          ))}
        </View>
      )}
    </Panel>
  );
}

function DocumentsTab({ meeting, token, onUpload }) {
  return (
    <Panel>
      <SectionTitle
        title="Tài liệu"
        action={
          <SecondaryButton
            icon="cloud-upload-outline"
            title="Gửi"
            onPress={onUpload}
          />
        }
      />
      {asArray(meeting.documents).length === 0 ? (
        <EmptyState title="Chưa có tài liệu được duyệt" />
      ) : (
        <View style={styles.stack}>
          {meeting.documents.map((doc) => (
            <CardRow
              key={doc.id}
              title={doc.display_name}
              subtitle={doc.original_name}
              meta={doc.uploaded_by_name}
              right={<StatusPill value={doc.status} />}
              onPress={() => Linking.openURL(documentDownloadUrl(doc.id, token))}
            />
          ))}
        </View>
      )}
    </Panel>
  );
}

function AgendaTab({ meeting }) {
  return (
    <Panel>
      <SectionTitle title="Agenda" />
      {asArray(meeting.agenda).length === 0 ? (
        <EmptyState title="Chưa có agenda" />
      ) : (
        <View style={styles.stack}>
          {meeting.agenda.map((item, index) => (
            <View key={item.id} style={styles.agendaRow}>
              <Text style={styles.agendaIndex}>{index + 1}</Text>
              <View style={styles.flex}>
                <Text style={styles.itemTitle}>{item.title}</Text>
                {!!item.description && <Text style={styles.muted}>{item.description}</Text>}
                <Text style={styles.muted}>
                  {item.presenter_name || "Chưa chọn"} · {item.duration_minutes || 0} phút
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </Panel>
  );
}

function AttendanceTab({ meeting, onCheckIn }) {
  return (
    <Panel>
      <SectionTitle
        title="Điểm danh"
        action={
          <PrimaryButton
            icon="checkmark-outline"
            title="Điểm danh"
            onPress={onCheckIn}
            disabled={meeting.status !== "ONGOING"}
          />
        }
      />
      {meeting.status !== "ONGOING" && (
        <Text style={styles.muted}>Chỉ điểm danh khi cuộc họp đang ONGOING.</Text>
      )}
      <View style={styles.stack}>
        {asArray(meeting.participants).map((participant) => (
          <View key={participant.user_id} style={styles.summaryRow}>
            <Text style={styles.itemTitle}>{participant.full_name}</Text>
            <StatusPill value={participant.attendance_status || "ABSENT"} />
          </View>
        ))}
      </View>
    </Panel>
  );
}

function VotesTab({ meeting, results, onAnswer, onResults }) {
  return (
    <Panel>
      <SectionTitle title="Biểu quyết" />
      {asArray(meeting.votes).length === 0 ? (
        <EmptyState title="Chưa có biểu quyết" />
      ) : (
        <View style={styles.stack}>
          {meeting.votes.map((vote) => {
            const options = normalizeOptions(vote.options);
            return (
              <View key={vote.id} style={styles.voteBox}>
                <View style={styles.rowBetween}>
                  <Text style={styles.itemTitle}>{vote.title}</Text>
                  <StatusPill value={vote.status} />
                </View>
                {!!vote.description && <Text style={styles.muted}>{vote.description}</Text>}
                {vote.my_answer ? (
                  <Text style={styles.answerText}>Bạn đã chọn: {vote.my_answer}</Text>
                ) : (
                  vote.status === "OPEN" && (
                    <View style={styles.rowWrap}>
                      {options.map((option) => (
                        <SecondaryButton
                          key={option}
                          title={option}
                          onPress={() => onAnswer(vote.id, option)}
                        />
                      ))}
                    </View>
                  )
                )}
                <SecondaryButton
                  icon="bar-chart-outline"
                  title="Xem kết quả"
                  onPress={() => onResults(vote.id)}
                />
                {!!results[vote.id] && (
                  <View style={styles.stackSmall}>
                    {results[vote.id].map((item) => (
                      <View key={item.answer} style={styles.summaryRow}>
                        <Text style={styles.muted}>{item.answer}</Text>
                        <Text style={styles.summaryCount}>{item.count}</Text>
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

function MinutesTab({ meeting }) {
  return (
    <Panel>
      <SectionTitle title="Biên bản" />
      {!meeting.minutes ? (
        <EmptyState title="Biên bản chưa được công bố" />
      ) : (
        <View style={styles.stack}>
          <StatusPill value={meeting.minutes.status} />
          <Text style={styles.minutesText}>{meeting.minutes.content}</Text>
        </View>
      )}
    </Panel>
  );
}

function MeetingTasksTab({ meeting, onStatus }) {
  return (
    <Panel>
      <SectionTitle title="Nhiệm vụ" />
      {asArray(meeting.tasks).length === 0 ? (
        <EmptyState title="Bạn chưa có nhiệm vụ trong cuộc họp này" />
      ) : (
        <View style={styles.stack}>
          {meeting.tasks.map((task) => (
            <View key={task.id} style={styles.voteBox}>
              <View style={styles.rowBetween}>
                <Text style={styles.itemTitle}>{task.title}</Text>
                <StatusPill value={task.status} />
              </View>
              {!!task.description && <Text style={styles.muted}>{task.description}</Text>}
              <Text style={styles.muted}>Deadline: {formatDate(task.deadline)}</Text>
              <View style={styles.rowWrap}>
                <StatusPill value={task.priority} />
                {task.status !== "DONE" && (
                  <PrimaryButton
                    icon="checkmark-outline"
                    title="Hoàn thành"
                    onPress={() => onStatus(task.id, "DONE")}
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

export function LiveMeetingScreen({ auth, meetingId, onBack }) {
  const [meeting, setMeeting] = useState(null);
  const [liveConfig, setLiveConfig] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [publicNotes, setPublicNotes] = useState("");
  const [personalNotes, setPersonalNotes] = useState("");
  const [message, setMessage] = useState("");
  const [activeTab, setActiveTab] = useState("room");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [voteResults, setVoteResults] = useState({});

  const permissions = liveConfig?.permissions || {};
  const canEditPublicNotes =
    permissions.isOrganizer || permissions.roleInMeeting === "SECRETARY";

  async function load() {
    const [
      meetingResult,
      configResult,
      chatResult,
      publicNotesResult,
      personalNotesResult
    ] = await Promise.all([
      apiRequest(`/meetings/${meetingId}`, { token: auth.token }),
      apiRequest(`/meetings/${meetingId}/live-config`, { token: auth.token }),
      apiRequest(`/meetings/${meetingId}/chat?limit=100`, { token: auth.token }),
      apiRequest(`/meetings/${meetingId}/public-notes`, { token: auth.token }),
      apiRequest(`/meetings/${meetingId}/personal-notes`, { token: auth.token })
    ]);

    setMeeting(meetingResult.data);
    setLiveConfig(configResult.data);
    setChatMessages(chatResult.data || []);
    setPublicNotes(publicNotesResult.data?.content || "");
    setPersonalNotes(personalNotesResult.data?.content || "");
  }

  useEffect(() => {
    setLoading(true);
    setError("");
    load()
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [meetingId]);

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

  async function run(action, success) {
    setError("");
    try {
      await action();
      if (success) auth.toast?.success(success);
      await load();
    } catch (err) {
      setError(err.message);
      auth.toast?.error("Thao tác thất bại", err.message);
    }
  }

  async function openOnlineRoom() {
    const token = liveConfig?.livekitToken;
    if (!token) {
      auth.toast?.warning(
        "Chưa có phòng online",
        "Cuộc họp này chưa có phòng họp trực tuyến."
      );
      return;
    }
    await Linking.openURL(liveJoinUrl(meetingId, token));
  }

  async function checkIn() {
    await run(
      () =>
        apiRequest(`/meetings/${meetingId}/attendance/checkin`, {
          method: "POST",
          token: auth.token,
          body: {}
        }),
      "Bạn đã điểm danh."
    );
  }

  async function sendChatMessage() {
    const content = message.trim();
    if (!content) return;
    await run(() =>
      apiRequest(`/meetings/${meetingId}/chat`, {
        method: "POST",
        token: auth.token,
        body: { content }
      })
    );
    setMessage("");
  }

  async function savePersonalNotes() {
    await run(
      () =>
        apiRequest(`/meetings/${meetingId}/personal-notes`, {
          method: "PUT",
          token: auth.token,
          body: { content: personalNotes }
        }),
      "Ghi chú cá nhân đã lưu."
    );
  }

  async function savePublicNotes() {
    await run(
      () =>
        apiRequest(`/meetings/${meetingId}/public-notes`, {
          method: "PUT",
          token: auth.token,
          body: { content: publicNotes }
        }),
      "Ghi chú chung đã lưu."
    );
  }

  async function answerVote(voteId, answer) {
    await run(
      () =>
        apiRequest(`/votes/${voteId}/responses`, {
          method: "POST",
          token: auth.token,
          body: { answer }
        }),
      "Đã gửi phiếu biểu quyết."
    );
  }

  async function loadResults(voteId) {
    setError("");
    try {
      const result = await apiRequest(`/votes/${voteId}/results`, {
        token: auth.token
      });
      setVoteResults((current) => ({
        ...current,
        [voteId]: result.data.results || []
      }));
    } catch (err) {
      setError(err.message);
    }
  }

  if (loading) return <LoadingState />;

  return (
    <View style={styles.detailShell}>
      {!!onBack && (
        <View style={styles.nestedBackBar}>
          <BackBar label="Rời phòng họp" onPress={onBack} />
        </View>
      )}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBar}>
        {liveTabs.map((tab) => (
          <Pressable
            key={tab.key}
            style={[styles.tabChip, activeTab === tab.key && styles.tabChipActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Ionicons
              name={tab.icon}
              size={16}
              color={activeTab === tab.key ? colors.primary : colors.muted}
            />
            <Text style={[styles.tabChipText, activeTab === tab.key && styles.tabChipTextActive]}>
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.screenContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      >
        <ErrorState message={error} />
        {!meeting || !liveConfig ? (
          <EmptyState title="Không tải được phòng Live" />
        ) : (
          <>
            <Panel>
              <View style={styles.rowBetween}>
                <Text style={styles.meetingTitle}>{meeting.title}</Text>
                <StatusPill value={meeting.status} />
              </View>
              <Text style={styles.muted}>{formatDateTime(meeting.start_time)}</Text>
              <Text style={styles.muted}>
                {meeting.room_name || liveConfig.roomName || meeting.meeting_type}
              </Text>
              <View style={styles.rowWrap}>
                <StatusPill value={meeting.meeting_type} />
                <StatusPill value={permissions.roleInMeeting || "MEMBER"} />
              </View>
            </Panel>

            {activeTab === "room" && (
              <Panel>
                <SectionTitle title="Phòng họp trực tuyến" />
                <View style={styles.stack}>
                  <PrimaryButton
                    icon="videocam-outline"
                    title="Mở phòng họp online"
                    onPress={openOnlineRoom}
                    disabled={!liveConfig.livekitToken}
                  />
                  <SecondaryButton
                    icon="checkmark-outline"
                    title="Điểm danh"
                    onPress={checkIn}
                    disabled={meeting.status !== "ONGOING"}
                  />
                  <View style={styles.permissionGrid}>
                    <View style={styles.permissionItem}>
                      <Ionicons name="mic-outline" size={18} color={colors.primary} />
                      <Text style={styles.permissionText}>
                        {permissions.canSpeak ? "Được phát biểu" : "Tắt quyền phát biểu"}
                      </Text>
                    </View>
                    <View style={styles.permissionItem}>
                      <Ionicons name="share-outline" size={18} color={colors.primary} />
                      <Text style={styles.permissionText}>
                        {permissions.canShareScreen ? "Được chia sẻ" : "Không chia sẻ"}
                      </Text>
                    </View>
                    <View style={styles.permissionItem}>
                      <Ionicons name="cloud-upload-outline" size={18} color={colors.primary} />
                      <Text style={styles.permissionText}>
                        {permissions.canUploadDocument ? "Được gửi tài liệu" : "Không gửi tài liệu"}
                      </Text>
                    </View>
                  </View>
                </View>
              </Panel>
            )}

            {activeTab === "chat" && (
              <Panel>
                <SectionTitle title="Chat cuộc họp" />
                <View style={styles.stack}>
                  {chatMessages.length === 0 ? (
                    <EmptyState title="Chưa có tin nhắn" />
                  ) : (
                    chatMessages.map((item) => (
                      <View
                        key={item.id}
                        style={[
                          styles.messageBubble,
                          item.sender_id === auth.user.id && styles.messageBubbleMine
                        ]}
                      >
                        <Text style={styles.messageAuthor}>
                          {item.sender_name || item.sender_email}
                        </Text>
                        <Text style={styles.messageText}>{item.content}</Text>
                      </View>
                    ))
                  )}
                  <TextInput
                    style={styles.textAreaSmall}
                    value={message}
                    onChangeText={setMessage}
                    placeholder="Nhập tin nhắn..."
                    placeholderTextColor={colors.muted}
                    multiline
                  />
                  <PrimaryButton
                    icon="send-outline"
                    title="Gửi"
                    onPress={sendChatMessage}
                  />
                </View>
              </Panel>
            )}

            {activeTab === "notes" && (
              <View style={styles.stack}>
                <Panel>
                  <SectionTitle
                    title="Ghi chú chung"
                    action={
                      canEditPublicNotes ? (
                        <SecondaryButton
                          icon="save-outline"
                          title="Lưu"
                          onPress={savePublicNotes}
                        />
                      ) : null
                    }
                  />
                  <TextInput
                    style={styles.textArea}
                    value={publicNotes}
                    onChangeText={setPublicNotes}
                    editable={canEditPublicNotes}
                    placeholder="Chưa có ghi chú chung"
                    placeholderTextColor={colors.muted}
                    multiline
                  />
                </Panel>
                <Panel>
                  <SectionTitle
                    title="Ghi chú cá nhân"
                    action={
                      <SecondaryButton
                        icon="save-outline"
                        title="Lưu"
                        onPress={savePersonalNotes}
                      />
                    }
                  />
                  <TextInput
                    style={styles.textArea}
                    value={personalNotes}
                    onChangeText={setPersonalNotes}
                    placeholder="Ghi chú riêng của bạn"
                    placeholderTextColor={colors.muted}
                    multiline
                  />
                </Panel>
              </View>
            )}

            {activeTab === "agenda" && <AgendaTab meeting={meeting} />}
            {activeTab === "documents" && (
              <DocumentsTab
                meeting={meeting}
                token={auth.token}
                onUpload={() =>
                  auth.toast?.info(
                    "Tải tài liệu lên",
                    "Vui lòng gửi tài liệu từ màn hình chi tiết cuộc họp."
                  )
                }
              />
            )}
            {activeTab === "votes" && (
              <VotesTab
                meeting={meeting}
                results={voteResults}
                onAnswer={answerVote}
                onResults={loadResults}
              />
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function normalizeOptions(options) {
  if (Array.isArray(options)) return options;
  try {
    return JSON.parse(options || "[]");
  } catch {
    return [];
  }
}

const detailTabs = [
  { key: "overview", label: "Tổng quan", icon: "people-outline" },
  { key: "documents", label: "Tài liệu", icon: "document-text-outline" },
  { key: "agenda", label: "Agenda", icon: "list-outline" },
  { key: "attendance", label: "Điểm danh", icon: "qr-code-outline" },
  { key: "votes", label: "Vote", icon: "checkbox-outline" },
  { key: "minutes", label: "Biên bản", icon: "reader-outline" },
  { key: "tasks", label: "Task", icon: "briefcase-outline" }
];

const liveTabs = [
  { key: "room", label: "Phòng", icon: "videocam-outline" },
  { key: "chat", label: "Chat", icon: "chatbubbles-outline" },
  { key: "notes", label: "Ghi chú", icon: "create-outline" },
  { key: "agenda", label: "Agenda", icon: "list-outline" },
  { key: "documents", label: "Tài liệu", icon: "document-text-outline" },
  { key: "votes", label: "Vote", icon: "checkbox-outline" }
];

const styles = StyleSheet.create({
  centerScreen: {
    alignItems: "center",
    backgroundColor: colors.background,
    flex: 1,
    justifyContent: "center"
  },
  authScreen: {
    backgroundColor: colors.background,
    flexGrow: 1,
    justifyContent: "center",
    padding: spacing.lg
  },
  brandLogoWrap: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: "#ffffff",
    borderRadius: radii.xl,
    justifyContent: "center",
    marginBottom: spacing.md,
    padding: spacing.sm,
    ...shadow(3)
  },
  brandLogo: {
    height: 96,
    width: 96
  },
  brandAcademy: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 0.6,
    marginTop: 2,
    textAlign: "center",
    textTransform: "uppercase"
  },
  brandTitle: {
    color: colors.textStrong,
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.8,
    textAlign: "center"
  },
  brandSubtitle: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "600",
    marginBottom: spacing.xl,
    marginTop: 4,
    textAlign: "center"
  },
  authPanel: {
    gap: spacing.md,
    padding: spacing.lg,
    ...shadow(2)
  },
  quickLoginRow: {
    flexDirection: "row",
    gap: spacing.sm
  },
  screen: {
    flex: 1
  },
  screenContent: {
    gap: spacing.md,
    padding: spacing.md
  },
  statGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md
  },
  stack: {
    gap: spacing.sm
  },
  stackSmall: {
    gap: spacing.xs
  },
  summaryRow: {
    alignItems: "center",
    backgroundColor: colors.surfaceSunken,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  summaryCount: {
    color: colors.primaryDark,
    fontSize: 18,
    fontWeight: "800"
  },
  cardActions: {
    alignItems: "flex-end",
    gap: spacing.xs
  },
  inlineButtons: {
    flexDirection: "row",
    gap: spacing.xs
  },
  smallButton: {
    alignItems: "center",
    backgroundColor: colors.surfaceSoft,
    borderColor: colors.primarySoft,
    borderRadius: radii.sm,
    borderWidth: 1,
    height: 36,
    justifyContent: "center",
    width: 36
  },
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
  detailShell: {
    flex: 1
  },
  nestedBackBar: {
    backgroundColor: colors.surface,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm
  },
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
  tabChipActive: {
    borderBottomColor: colors.primary
  },
  tabChipText: {
    color: colors.muted,
    fontSize: 13.5,
    fontWeight: "700"
  },
  tabChipTextActive: {
    color: colors.primary,
    fontWeight: "800"
  },
  meetingTitle: {
    color: colors.textStrong,
    flex: 1,
    fontSize: 21,
    fontWeight: "800",
    letterSpacing: -0.5
  },
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
  avatarText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: "800"
  },
  flex: {
    flex: 1
  },
  agendaRow: {
    flexDirection: "row",
    gap: spacing.sm
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
  minutesText: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 24
  },
  permissionGrid: {
    gap: spacing.sm
  },
  permissionItem: {
    alignItems: "center",
    backgroundColor: colors.surfaceSunken,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.sm
  },
  permissionText: {
    color: colors.text,
    flex: 1,
    fontSize: 14,
    fontWeight: "700"
  },
  messageBubble: {
    alignSelf: "flex-start",
    backgroundColor: colors.surfaceSunken,
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
  textArea: {
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
    borderRadius: radii.md,
    borderWidth: 1,
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
    minHeight: 150,
    padding: spacing.md,
    textAlignVertical: "top"
  },
  textAreaSmall: {
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
    borderRadius: radii.md,
    borderWidth: 1,
    color: colors.text,
    fontSize: 15,
    minHeight: 74,
    padding: spacing.md,
    textAlignVertical: "top"
  }
});
