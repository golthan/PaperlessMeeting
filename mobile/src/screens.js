import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import { apiRequest } from "./api";
import {
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
  formatDate,
  formatDateTime,
  hasOnlineRoom,
  meetingPlaceLabel
} from "./format";
import { colors, radii, shadow, spacing } from "./theme";

// Hai màn hình lớn nằm ở file riêng; giữ lại lối import cũ cho App.js.
export { MeetingDetailScreen } from "./meetingDetail";
export { LiveMeetingScreen } from "./liveMeeting";

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

const MEETING_FILTERS = [
  { key: "ALL", label: "Tất cả" },
  { key: "ONGOING", label: "Đang họp" },
  { key: "UPCOMING", label: "Sắp diễn ra" },
  { key: "DONE", label: "Đã xong" }
];

/** Một cuộc họp trong danh sách: xem nhanh, trả lời lời mời và vào thẳng phòng họp. */
function MeetingCard({ meeting, busy, onOpen, onJoin, onRespond }) {
  const ongoing = meeting.status === "ONGOING";

  return (
    <Panel style={ongoing ? styles.meetingCardLive : null}>
      <Pressable onPress={onOpen} accessibilityRole="button">
        <View style={styles.rowBetween}>
          <Text style={styles.meetingCardTitle}>{meeting.title}</Text>
          <StatusPill value={meeting.status} />
        </View>
        <Text style={styles.muted}>{formatDateTime(meeting.start_time)}</Text>
        <Text style={styles.muted}>{meetingPlaceLabel(meeting)}</Text>
        <Text style={styles.muted}>Chủ tọa: {meeting.organizer_name || "-"}</Text>
      </Pressable>
      <View style={styles.rowWrap}>
        <StatusPill value={meeting.invitation_status} />
        {ongoing && (
          <PrimaryButton
            icon={hasOnlineRoom(meeting) ? "videocam-outline" : "easel-outline"}
            title="Vào phòng họp"
            onPress={onJoin}
          />
        )}
        {meeting.invitation_status === "PENDING" && (
          <>
            <SecondaryButton
              icon="checkmark-outline"
              title="Nhận lời"
              onPress={() => onRespond("accept")}
              disabled={busy}
            />
            <SecondaryButton
              icon="close-outline"
              title="Từ chối"
              onPress={() => onRespond("decline")}
              disabled={busy}
            />
          </>
        )}
        <SecondaryButton icon="arrow-forward-outline" title="Chi tiết" onPress={onOpen} />
      </View>
    </Panel>
  );
}

export function MeetingsScreen({ auth, refreshKey, onOpenMeeting, onJoinMeeting }) {
  const [meetings, setMeetings] = useState([]);
  const [filter, setFilter] = useState("ALL");
  const [busy, setBusy] = useState(false);
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
    setBusy(true);
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
    } finally {
      setBusy(false);
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

  // "Đã xong" gộp cả cuộc họp kết thúc lẫn bị huỷ — với người dự thì đều là việc đã qua.
  const visible = meetings.filter((meeting) => {
    if (filter === "ALL") return true;
    if (filter === "DONE") return ["FINISHED", "CANCELLED"].includes(meeting.status);
    return meeting.status === filter;
  });

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.screenContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
    >
      <ErrorState message={error} />

      <View style={styles.filterRow}>
        {MEETING_FILTERS.map((item) => {
          const isActive = filter === item.key;
          return (
            <Pressable
              key={item.key}
              onPress={() => setFilter(item.key)}
              style={[styles.filterChip, isActive && styles.filterChipActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
            >
              <Text style={[styles.filterText, isActive && styles.filterTextActive]}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {visible.length === 0 ? (
        <EmptyState
          title={
            meetings.length === 0
              ? "Chưa có cuộc họp được mời"
              : "Không có cuộc họp nào trong mục này"
          }
        />
      ) : (
        <View style={styles.stack}>
          {visible.map((meeting) => (
            <MeetingCard
              key={meeting.id}
              meeting={meeting}
              busy={busy}
              onOpen={() => onOpenMeeting(meeting.id)}
              onJoin={() => onJoinMeeting(meeting.id)}
              onRespond={(action) => updateInvitation(meeting.id, action)}
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
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs
  },
  filterChip: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.full,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: 7
  },
  filterChipActive: {
    backgroundColor: colors.surfaceSoft,
    borderColor: colors.primary
  },
  filterText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700"
  },
  filterTextActive: {
    color: colors.primaryDark,
    fontWeight: "800"
  },
  meetingCardLive: {
    borderColor: colors.primary,
    borderWidth: 1.5
  },
  meetingCardTitle: {
    color: colors.textStrong,
    flex: 1,
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: -0.3
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
});
