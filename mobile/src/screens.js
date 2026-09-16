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
import {
  asArray,
  attendanceMethodLabel,
  attendanceSummary,
  formatDate,
  formatDateTime,
  hasOnlineRoom,
  meetingPlaceLabel,
  percent
} from "./format";
import { voteAnswerLabel } from "./format";
import { colors, radii, shadow, spacing } from "./theme";

export function LoginScreen({ auth, booting }) {
  const [email, setEmail] = useState("participant1@example.com");
  const [password, setPassword] = useState("123456");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState("login");

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

  if (mode === "register") {
    return (
      <RegisterScreen
        onBack={() => setMode("login")}
        onRegistered={(registeredEmail) => {
          setEmail(registeredEmail);
          setPassword("");
          setError("");
        }}
      />
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
        <Pressable
          onPress={() => setMode("register")}
          style={authStyles.linkRow}
          accessibilityRole="button"
        >
          <Text style={authStyles.linkMuted}>Chưa có tài khoản?</Text>
          <Text style={authStyles.link}>Đăng ký</Text>
        </Pressable>
      </Panel>
    </ScrollView>
  );
}

/**
 * Đăng ký tài khoản trên điện thoại. Giống bản web: gửi xong KHÔNG vào thẳng
 * hệ thống mà chờ quản trị viên duyệt và cấp quyền.
 */
export function RegisterScreen({ onBack, onRegistered }) {
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    password: "",
    phone: "",
    jobTitle: ""
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(null);

  function update(patch) {
    setForm((current) => ({ ...current, ...patch }));
  }

  async function submit() {
    setError("");
    if (!form.fullName.trim() || !form.email.trim() || !form.password) {
      setError("Vui lòng nhập họ tên, email và mật khẩu");
      return;
    }
    if (form.password.length < 6) {
      setError("Mật khẩu cần tối thiểu 6 ký tự");
      return;
    }
    setLoading(true);
    try {
      const result = await apiRequest("/auth/register", {
        method: "POST",
        body: { ...form, email: form.email.trim() }
      });
      setDone(result);
      onRegistered?.(result.data?.email || form.email.trim());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <ScrollView contentContainerStyle={styles.authScreen}>
        <Panel style={styles.authPanel}>
          <View style={authStyles.successIcon}>
            <Ionicons name="shield-checkmark" size={30} color={colors.success} />
          </View>
          <Text style={authStyles.successTitle}>Đã gửi hồ sơ đăng ký</Text>
          <Text style={authStyles.successText}>{done.message}</Text>
          <Text style={authStyles.hint}>
            Tài khoản {done.data?.email} sẽ đăng nhập được ngay sau khi quản trị viên phê duyệt
            và cấp quyền.
          </Text>
          <PrimaryButton icon="log-in-outline" title="Về trang đăng nhập" onPress={onBack} />
        </Panel>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.authScreen} keyboardShouldPersistTaps="handled">
      <Text style={styles.brandTitle}>Đăng ký tài khoản</Text>
      <Text style={styles.brandSubtitle}>
        Quản trị viên sẽ xét duyệt hồ sơ và cấp quyền trước khi bạn đăng nhập được
      </Text>
      <Panel style={styles.authPanel}>
        <Field
          label="Họ và tên *"
          value={form.fullName}
          onChangeText={(value) => update({ fullName: value })}
          placeholder="Nguyễn Văn A"
        />
        <Field
          label="Email *"
          value={form.email}
          onChangeText={(value) => update({ email: value })}
          keyboardType="email-address"
          placeholder="ten@hocvien.edu.vn"
        />
        <Field
          label="Mật khẩu *"
          value={form.password}
          onChangeText={(value) => update({ password: value })}
          secureTextEntry
          placeholder="Tối thiểu 6 ký tự"
        />
        <Field
          label="Số điện thoại"
          value={form.phone}
          onChangeText={(value) => update({ phone: value })}
          keyboardType="phone-pad"
        />
        <Field
          label="Chức vụ / đơn vị"
          value={form.jobTitle}
          onChangeText={(value) => update({ jobTitle: value })}
          placeholder="Ví dụ: Giảng viên Khoa CNTT"
        />
        <ErrorState message={error} />
        <PrimaryButton
          icon="person-add-outline"
          title={loading ? "Đang gửi hồ sơ..." : "Gửi hồ sơ đăng ký"}
          onPress={submit}
          disabled={loading}
        />
        <Pressable onPress={onBack} style={authStyles.linkRow} accessibilityRole="button">
          <Text style={authStyles.linkMuted}>Đã có tài khoản?</Text>
          <Text style={authStyles.link}>Đăng nhập</Text>
        </Pressable>
      </Panel>
    </ScrollView>
  );
}

function profileInitials(value) {
  return String(value || "?")
    .trim()
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(-2)
    .map((part) => part[0].toUpperCase())
    .join("");
}

/**
 * Hồ sơ cá nhân: tự sửa họ tên, số điện thoại, chức vụ và đổi mật khẩu.
 * Vai trò và trạng thái chỉ hiển thị — đó là việc của quản trị viên.
 */
export function ProfileScreen({ auth }) {
  const user = auth.user || {};
  const [form, setForm] = useState({
    fullName: user.full_name || "",
    phone: user.phone || "",
    jobTitle: user.job_title || ""
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [passwords, setPasswords] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: ""
  });
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  // Lấy bản mới nhất từ máy chủ: thông tin có thể vừa được sửa trên web.
  useEffect(() => {
    apiRequest("/auth/me", { token: auth.token })
      .then((result) => {
        if (!result?.user) return;
        auth.updateUser(result.user);
        setForm({
          fullName: result.user.full_name || "",
          phone: result.user.phone || "",
          jobTitle: result.user.job_title || ""
        });
      })
      .catch(() => {});
  }, [auth.token]);

  async function saveProfile() {
    setProfileError("");
    if (!form.fullName.trim()) {
      setProfileError("Vui lòng nhập họ tên");
      return;
    }
    setSavingProfile(true);
    try {
      const result = await apiRequest("/auth/profile", {
        method: "PUT",
        token: auth.token,
        body: form
      });
      await auth.updateUser(result.user);
      auth.toast?.success("Đã lưu hồ sơ", result.user.full_name);
    } catch (err) {
      setProfileError(err.message);
    } finally {
      setSavingProfile(false);
    }
  }

  async function changePassword() {
    setPasswordError("");
    if (passwords.newPassword.length < 6) {
      setPasswordError("Mật khẩu mới cần tối thiểu 6 ký tự");
      return;
    }
    if (passwords.newPassword !== passwords.confirmPassword) {
      setPasswordError("Xác nhận mật khẩu chưa khớp");
      return;
    }
    setSavingPassword(true);
    try {
      await apiRequest("/auth/change-password", {
        method: "PUT",
        token: auth.token,
        body: {
          currentPassword: passwords.currentPassword,
          newPassword: passwords.newPassword
        }
      });
      setPasswords({ currentPassword: "", newPassword: "", confirmPassword: "" });
      auth.toast?.success("Đã đổi mật khẩu", "Lần đăng nhập sau hãy dùng mật khẩu mới");
    } catch (err) {
      setPasswordError(err.message);
    } finally {
      setSavingPassword(false);
    }
  }

  const current = auth.user || user;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.screenContent}
      keyboardShouldPersistTaps="handled"
    >
      <Panel style={authStyles.profileCard}>
        <View style={authStyles.profileAvatar}>
          <Text style={authStyles.profileAvatarText}>
            {profileInitials(current.full_name || current.email)}
          </Text>
        </View>
        <Text style={authStyles.profileName}>{current.full_name}</Text>
        <Text style={authStyles.profileEmail}>{current.email}</Text>
        {!!current.job_title && <Text style={authStyles.profileMeta}>{current.job_title}</Text>}
        <View style={authStyles.pillRow}>
          <StatusPill value={current.role} />
          <StatusPill value={current.status} />
        </View>
      </Panel>

      <Panel>
        <SectionTitle title="Thông tin cá nhân" />
        <View style={styles.stack}>
          <Field
            label="Họ và tên *"
            value={form.fullName}
            onChangeText={(value) => setForm((f) => ({ ...f, fullName: value }))}
          />
          <Field
            label="Số điện thoại"
            value={form.phone}
            onChangeText={(value) => setForm((f) => ({ ...f, phone: value }))}
            keyboardType="phone-pad"
            placeholder="Ví dụ: 0912345678"
          />
          <Field
            label="Chức vụ / đơn vị công tác"
            value={form.jobTitle}
            onChangeText={(value) => setForm((f) => ({ ...f, jobTitle: value }))}
            placeholder="Ví dụ: Chuyên viên Phòng Đào tạo"
          />
          <ErrorState message={profileError} />
          <PrimaryButton
            icon="save-outline"
            title={savingProfile ? "Đang lưu..." : "Lưu thay đổi"}
            onPress={saveProfile}
            disabled={savingProfile}
          />
        </View>
      </Panel>

      <Panel>
        <SectionTitle title="Đổi mật khẩu" />
        <View style={styles.stack}>
          <Field
            label="Mật khẩu hiện tại"
            value={passwords.currentPassword}
            onChangeText={(value) => setPasswords((p) => ({ ...p, currentPassword: value }))}
            secureTextEntry
          />
          <Field
            label="Mật khẩu mới"
            value={passwords.newPassword}
            onChangeText={(value) => setPasswords((p) => ({ ...p, newPassword: value }))}
            secureTextEntry
            placeholder="Tối thiểu 6 ký tự"
          />
          <Field
            label="Nhập lại mật khẩu mới"
            value={passwords.confirmPassword}
            onChangeText={(value) => setPasswords((p) => ({ ...p, confirmPassword: value }))}
            secureTextEntry
          />
          <ErrorState message={passwordError} />
          <SecondaryButton
            icon="key-outline"
            title={savingPassword ? "Đang đổi..." : "Đổi mật khẩu"}
            onPress={changePassword}
            disabled={savingPassword}
          />
        </View>
      </Panel>

      <Text style={authStyles.hint}>
        Email, vai trò và phòng ban do quản trị viên quản lý. Mọi lần sửa hồ sơ và đổi mật khẩu
        đều được ghi vào nhật ký truy vết của hệ thống.
      </Text>
    </ScrollView>
  );
}

const authStyles = StyleSheet.create({
  linkRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    paddingVertical: spacing.xs
  },
  linkMuted: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "600"
  },
  link: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: "800"
  },
  successIcon: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: colors.successSoft,
    borderColor: colors.successBorder,
    borderRadius: radii.full,
    borderWidth: 1,
    height: 64,
    justifyContent: "center",
    width: 64
  },
  successTitle: {
    color: colors.textStrong,
    fontSize: 20,
    fontWeight: "800",
    textAlign: "center"
  },
  successText: {
    color: colors.success,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
    textAlign: "center"
  },
  hint: {
    color: colors.muted,
    fontSize: 12.5,
    fontWeight: "600",
    lineHeight: 18,
    textAlign: "center"
  },
  profileCard: {
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.lg
  },
  profileAvatar: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radii.full,
    height: 72,
    justifyContent: "center",
    marginBottom: spacing.xs,
    width: 72,
    ...shadow(2)
  },
  profileAvatarText: {
    color: colors.onPrimary,
    fontSize: 24,
    fontWeight: "800"
  },
  profileName: {
    color: colors.textStrong,
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.3,
    textAlign: "center"
  },
  profileEmail: {
    color: colors.muted,
    fontSize: 13.5,
    fontWeight: "600"
  },
  profileMeta: {
    color: colors.primaryDark,
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center"
  },
  pillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    justifyContent: "center",
    marginTop: spacing.xs
  }
});

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
              subtitle={`${formatDateTime(meeting.start_time)} · ${meetingPlaceLabel(meeting)}`}
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
        [voteId]: { results: result.data.results || [], summary: result.data.summary }
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

      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.screenContent}
        keyboardShouldPersistTaps="handled"
      >
        <Panel>
          <View style={styles.rowBetween}>
            <Text style={styles.meetingTitle}>{meeting.title}</Text>
            <StatusPill value={meeting.status} />
          </View>
          <Text style={styles.muted}>{formatDateTime(meeting.start_time)}</Text>
          <Text style={styles.muted}>{meetingPlaceLabel(meeting)}</Text>
          <View style={styles.rowWrap}>
            <StatusPill value={meeting.meeting_type} />
          </View>
          {onOpenLive && meeting.status === "ONGOING" && (
            <View style={styles.rowWrap}>
              <PrimaryButton
                icon={hasOnlineRoom(meeting) ? "videocam-outline" : "easel-outline"}
                title="Vào phòng họp"
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
        <EmptyState title="Chưa có tài liệu" />
      ) : (
        <View style={styles.stack}>
          {meeting.documents.map((doc) => (
            <CardRow
              key={doc.id}
              title={doc.display_name}
              subtitle={doc.original_name}
              meta={doc.uploaded_by_name}
              right={
                <StatusPill
                  value={doc.status}
                  label={doc.status === "PENDING" ? "Chờ duyệt" : undefined}
                />
              }
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
      <SectionTitle title="Chương trình họp" />
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

function ParticipantsTab({ meeting }) {
  const people = asArray(meeting.participants);
  const joined = people.filter((item) => item.is_online);
  const away = people.filter((item) => !item.is_online);

  function renderRow(participant) {
    return (
      <View key={participant.user_id} style={styles.participantRow}>
        <View style={[styles.avatar, participant.is_online && styles.avatarOnline]}>
          <Text style={styles.avatarText}>
            {(participant.full_name || "?").slice(0, 1).toUpperCase()}
          </Text>
        </View>
        <View style={styles.flex}>
          <Text style={styles.itemTitle}>{participant.full_name}</Text>
          <Text style={styles.muted}>
            {participant.role_in_meeting === "SECRETARY" ? "Thư ký" : "Thành viên"}
            {participant.department_name ? " · " + participant.department_name : ""}
          </Text>
        </View>
        <View style={styles.stackSmall}>
          {!!participant.is_hand_raised && <StatusPill value="LATE" label="Giơ tay" />}
          <StatusPill value={participant.attendance_status || "ABSENT"} />
        </View>
      </View>
    );
  }

  return (
    <Panel>
      <SectionTitle
        title="Người tham dự"
        action={
          <Text style={styles.muted}>
            {joined.length}/{people.length} đang trong phòng
          </Text>
        }
      />
      {people.length === 0 ? (
        <EmptyState title="Chưa có người tham dự" />
      ) : (
        <View style={styles.stack}>
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
        </View>
      )}
    </Panel>
  );
}

function AttendanceTab({ meeting, onCheckIn }) {
  const summary = attendanceSummary(meeting.participants);
  const ongoing = meeting.status === "ONGOING";

  return (
    <Panel>
      <SectionTitle
        title="Điểm danh"
        action={
          <PrimaryButton
            icon="checkmark-outline"
            title="Điểm danh"
            onPress={onCheckIn}
            disabled={!ongoing}
          />
        }
      />
      <View style={styles.summaryGrid}>
        <View style={styles.summaryTile}>
          <Text style={styles.summaryTileLabel}>Có mặt</Text>
          <Text style={styles.summaryTileValue}>{summary.present}</Text>
        </View>
        <View style={styles.summaryTile}>
          <Text style={styles.summaryTileLabel}>Đi muộn</Text>
          <Text style={styles.summaryTileValue}>{summary.late}</Text>
        </View>
        <View style={styles.summaryTile}>
          <Text style={styles.summaryTileLabel}>Chưa điểm danh</Text>
          <Text style={styles.summaryTileValue}>{summary.absent}</Text>
        </View>
        <View style={styles.summaryTile}>
          <Text style={styles.summaryTileLabel}>Tỉ lệ</Text>
          <Text style={styles.summaryTileValue}>
            {percent(summary.checkedIn, summary.total)}%
          </Text>
        </View>
      </View>
      {!ongoing && (
        <Text style={styles.muted}>Chỉ điểm danh được khi cuộc họp đang diễn ra.</Text>
      )}
      <Text style={styles.muted}>
        Vào phòng họp lúc đang diễn ra sẽ tự điểm danh; muộn hơn 10 phút so với giờ bắt
        đầu được ghi nhận là đi muộn.
      </Text>
      <View style={styles.stack}>
        {asArray(meeting.participants).map((participant) => (
          <View key={participant.user_id} style={styles.participantRow}>
            <View style={styles.flex}>
              <Text style={styles.itemTitle}>{participant.full_name}</Text>
              <Text style={styles.muted}>
                {attendanceMethodLabel(participant.attendance_method)}
                {participant.checked_in_at
                  ? " · " + formatDateTime(participant.checked_in_at)
                  : ""}
              </Text>
            </View>
            <StatusPill value={participant.attendance_status || "ABSENT"} />
          </View>
        ))}
      </View>
    </Panel>
  );
}

function VotesTab({ meeting, results, onAnswer, onResults }) {
  const totalPeople = asArray(meeting.participants).length;

  return (
    <Panel>
      <SectionTitle title="Biểu quyết" />
      {asArray(meeting.votes).length === 0 ? (
        <EmptyState title="Chưa có nội dung biểu quyết" />
      ) : (
        <View style={styles.stack}>
          {meeting.votes.map((vote) => {
            const options = normalizeOptions(vote.options);
            const result = results[vote.id];
            const voted =
              result?.summary?.totalResponses ?? Number(vote.response_count || 0);
            const total = result?.summary?.eligibleVoters || totalPeople;
            const showResults = vote.status === "CLOSED" && !!result?.results;

            return (
              <View key={vote.id} style={styles.voteBox}>
                <View style={styles.rowBetween}>
                  <Text style={styles.itemTitle}>{vote.title}</Text>
                  <StatusPill value={vote.status} />
                </View>
                {!!vote.description && <Text style={styles.muted}>{vote.description}</Text>}

                <Text style={styles.muted}>
                  {voted}/{total} người đã bỏ phiếu
                </Text>
                <View style={styles.progressTrack}>
                  <View
                    style={[styles.progressFill, { width: percent(voted, total) + "%" }]}
                  />
                </View>

                {vote.my_answer ? (
                  <Text style={styles.answerText}>
                    Bạn đã chọn: {voteAnswerLabel(vote.my_answer)}
                  </Text>
                ) : vote.status === "OPEN" ? (
                  <View style={styles.rowWrap}>
                    {options.map((option) => (
                      <SecondaryButton
                        key={option}
                        title={voteAnswerLabel(option)}
                        onPress={() => onAnswer(vote.id, option)}
                      />
                    ))}
                  </View>
                ) : (
                  <Text style={styles.muted}>
                    {vote.status === "DRAFT"
                      ? "Chủ trì chưa mở biểu quyết này."
                      : "Biểu quyết đã chốt."}
                  </Text>
                )}

                {vote.status === "CLOSED" && !result && (
                  <SecondaryButton
                    icon="bar-chart-outline"
                    title="Xem kết quả"
                    onPress={() => onResults(vote.id)}
                  />
                )}

                {showResults && (
                  <View style={styles.stackSmall}>
                    {result.results.map((item) => (
                      <View key={item.answer}>
                        <View style={styles.summaryRow}>
                          <Text style={styles.muted}>{voteAnswerLabel(item.answer)}</Text>
                          <Text style={styles.summaryCount}>
                            {item.count} · {percent(item.count, voted || 1)}%
                          </Text>
                        </View>
                        <View style={styles.progressTrack}>
                          <View
                            style={[
                              styles.progressFill,
                              { width: percent(item.count, voted || 1) + "%" }
                            ]}
                          />
                        </View>
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
      // scope=room: bỏ qua tin thảo luận trong hộp tài liệu trên web.
      apiRequest(`/meetings/${meetingId}/chat?limit=100&scope=room`, { token: auth.token }),
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
        [voteId]: { results: result.data.results || [], summary: result.data.summary }
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
        // Không có dòng này thì chạm "Gửi" / "Lưu" khi đang gõ chỉ để ẩn bàn phím,
        // người dùng phải bấm lần thứ hai mới gửi được tin nhắn hay lưu ghi chú.
        keyboardShouldPersistTaps="handled"
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
              <Text style={styles.muted}>{meetingPlaceLabel(meeting)}</Text>
              <View style={styles.rowWrap}>
                <StatusPill value={meeting.meeting_type} />
                <StatusPill value={permissions.roleInMeeting || "MEMBER"} />
              </View>
            </Panel>

            {activeTab === "room" && (
              <Panel>
                <SectionTitle title="Phòng họp" />
                <View style={styles.stack}>
                  {hasOnlineRoom(meeting) ? (
                    <>
                      <Text style={styles.muted}>
                        Phòng họp trực tuyến đang bật. Mở phòng video để tham gia bằng
                        camera và micro.
                      </Text>
                      <PrimaryButton
                        icon="videocam-outline"
                        title="Mở phòng họp video"
                        onPress={openOnlineRoom}
                        disabled={!liveConfig.livekitToken}
                      />
                    </>
                  ) : (
                    <Text style={styles.muted}>
                      Cuộc họp tập trung tại {meeting.room_name || "phòng họp"}. Chủ trì
                      chưa bật phòng trực tuyến — bạn vẫn theo dõi chương trình, tài liệu,
                      biểu quyết và ghi chú ngay tại đây.
                    </Text>
                  )}
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

            {activeTab === "people" && <ParticipantsTab meeting={meeting} />}
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
  { key: "agenda", label: "Chương trình", icon: "list-outline" },
  { key: "attendance", label: "Điểm danh", icon: "qr-code-outline" },
  { key: "votes", label: "Biểu quyết", icon: "checkbox-outline" },
  { key: "minutes", label: "Biên bản", icon: "reader-outline" },
  { key: "tasks", label: "Nhiệm vụ", icon: "briefcase-outline" }
];

const liveTabs = [
  { key: "room", label: "Phòng", icon: "videocam-outline" },
  { key: "people", label: "Người tham dự", icon: "people-outline" },
  { key: "chat", label: "Chat", icon: "chatbubbles-outline" },
  { key: "notes", label: "Ghi chú", icon: "create-outline" },
  { key: "agenda", label: "Chương trình", icon: "list-outline" },
  { key: "documents", label: "Tài liệu", icon: "document-text-outline" },
  { key: "votes", label: "Biểu quyết", icon: "checkbox-outline" }
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
  groupLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.6,
    marginTop: spacing.xs,
    textTransform: "uppercase"
  },
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
  avatarOnline: {
    borderColor: colors.primary,
    borderWidth: 2
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
