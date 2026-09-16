import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import { apiRequest } from "./api";
import {
  BackBar,
  EmptyState,
  ErrorState,
  LoadingState,
  SecondaryButton,
  usePressScale
} from "./components";
import { timeAgo } from "./format";
import { colors, radii, shadow, spacing } from "./theme";
import { useToast } from "./toast";

const POLL_INTERVAL_MS = 20000;

const TYPE_META = {
  MEETING_INVITE: { icon: "mail-outline", label: "Lời mời họp" },
  MEETING_UPDATED: { icon: "calendar-outline", label: "Đổi lịch họp" },
  MEETING_CANCELLED: { icon: "close-circle-outline", label: "Huỷ họp" },
  MEETING_STARTED: { icon: "play-circle-outline", label: "Bắt đầu họp" },
  MEETING_FINISHED: { icon: "flag-outline", label: "Kết thúc họp" },
  MEETING_REMINDER: { icon: "alarm-outline", label: "Nhắc lịch" },
  MEETING_ONLINE_ENABLED: { icon: "videocam-outline", label: "Phòng trực tuyến" },
  MEETING_ONLINE_DISABLED: { icon: "videocam-off-outline", label: "Phòng trực tuyến" },
  PARTICIPANT_REMOVED: { icon: "person-remove-outline", label: "Thành phần" },
  INVITATION_RESPONSE: { icon: "checkmark-done-outline", label: "Phản hồi" },
  DOCUMENT_UPLOADED: { icon: "document-attach-outline", label: "Tài liệu" },
  DOCUMENT_REVIEWED: { icon: "document-text-outline", label: "Duyệt tài liệu" },
  VOTE_OPENED: { icon: "podium-outline", label: "Biểu quyết" },
  VOTE_CLOSED: { icon: "podium-outline", label: "Biểu quyết" },
  MINUTES_PUBLISHED: { icon: "reader-outline", label: "Biên bản" },
  TASK_ASSIGNED: { icon: "clipboard-outline", label: "Nhiệm vụ mới" },
  TASK_UPDATED: { icon: "refresh-outline", label: "Nhiệm vụ" },
  ACCOUNT_REGISTERED: { icon: "person-add-outline", label: "Đăng ký mới" },
  ACCOUNT_APPROVED: { icon: "shield-checkmark-outline", label: "Tài khoản" },
  ACCOUNT_REJECTED: { icon: "close-circle-outline", label: "Tài khoản" }
};

const SEVERITY_COLORS = {
  SUCCESS: { color: colors.success, soft: colors.successSoft, border: colors.successBorder },
  WARNING: { color: colors.warning, soft: colors.warningSoft, border: colors.warningBorder },
  DANGER: { color: colors.danger, soft: colors.dangerSoft, border: colors.dangerBorder },
  INFO: { color: colors.info, soft: colors.infoSoft, border: colors.infoBorder }
};

const TOAST_TONE = {
  SUCCESS: "success",
  WARNING: "warning",
  DANGER: "error",
  INFO: "notification"
};

function meta(type) {
  return TYPE_META[type] || { icon: "notifications-outline", label: "Thông báo" };
}

function severity(value) {
  return SEVERITY_COLORS[value] || SEVERITY_COLORS.INFO;
}

/**
 * Trung tâm thông báo cho bản Android.
 * Bản mobile không mở socket nên dùng polling nhẹ 20 giây một lần;
 * mỗi thông báo mới sẽ bật toast ở góc phải trên màn hình.
 */
export function useNotificationCenter(auth) {
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const seenIds = useRef(new Set());
  const primed = useRef(false);
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const load = useCallback(async () => {
    if (!auth?.token) return;
    try {
      const result = await apiRequest("/notifications?limit=40", { token: auth.token });
      const list = result.data || [];
      setItems(list);
      setUnread(result.meta?.unread || 0);
      setError("");

      if (primed.current) {
        list
          .filter((item) => !seenIds.current.has(item.id) && !item.is_read)
          .slice(0, 3)
          .reverse()
          .forEach((item) => {
            toastRef.current.push({
              tone: TOAST_TONE[item.severity] || "notification",
              title: item.title,
              message: item.message
            });
          });
      }
      seenIds.current = new Set(list.map((item) => item.id));
      primed.current = true;
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [auth?.token]);

  useEffect(() => {
    if (!auth?.token) {
      setItems([]);
      setUnread(0);
      primed.current = false;
      seenIds.current = new Set();
      return undefined;
    }
    load();
    const timer = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [auth?.token, load]);

  const markRead = useCallback(
    async (id) => {
      setItems((list) => list.map((item) => (item.id === id ? { ...item, is_read: true } : item)));
      setUnread((value) => Math.max(0, value - 1));
      try {
        await apiRequest(`/notifications/${id}/read`, { method: "PUT", token: auth.token });
      } catch {
        /* lần poll kế tiếp sẽ đồng bộ lại */
      }
    },
    [auth?.token]
  );

  const markAllRead = useCallback(async () => {
    setItems((list) => list.map((item) => ({ ...item, is_read: true })));
    setUnread(0);
    try {
      await apiRequest("/notifications/read-all", { method: "PUT", token: auth.token });
    } catch {
      /* lần poll kế tiếp sẽ đồng bộ lại */
    }
  }, [auth?.token]);

  const removeOne = useCallback(
    async (id) => {
      setItems((list) => list.filter((item) => item.id !== id));
      try {
        await apiRequest(`/notifications/${id}`, { method: "DELETE", token: auth.token });
      } catch {
        /* lần poll kế tiếp sẽ đồng bộ lại */
      }
      load();
    },
    [auth?.token, load]
  );

  return { items, unread, loading, error, refresh: load, markRead, markAllRead, removeOne };
}

function NotificationCard({ notification, onPress, onRemove }) {
  const { icon, label } = meta(notification.type);
  const tone = severity(notification.severity);
  const { scale, onPressIn, onPressOut } = usePressScale(0.985);

  return (
    <Pressable onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut}>
      <Animated.View
        style={[
          styles.card,
          { borderLeftColor: tone.color, transform: [{ scale }] },
          !notification.is_read && styles.cardUnread
        ]}
      >
        <View style={[styles.cardIcon, { backgroundColor: tone.soft, borderColor: tone.border }]}>
          <Ionicons name={icon} size={18} color={tone.color} />
        </View>
        <View style={styles.cardBody}>
          <View style={styles.cardTop}>
            <Text style={styles.cardTitle} numberOfLines={2}>
              {notification.title}
            </Text>
            {!notification.is_read && <View style={styles.dot} />}
          </View>
          {!!notification.message && (
            <Text style={styles.cardMessage} numberOfLines={3}>
              {notification.message}
            </Text>
          )}
          <View style={styles.cardMeta}>
            <Text style={styles.cardTag}>{label}</Text>
            <Text style={styles.cardTime}>{timeAgo(notification.created_at)}</Text>
          </View>
        </View>
        <Pressable
          hitSlop={8}
          onPress={onRemove}
          style={styles.cardRemove}
          accessibilityLabel="Xoá thông báo"
        >
          <Ionicons name="trash-outline" size={16} color={colors.subtle} />
        </Pressable>
      </Animated.View>
    </Pressable>
  );
}

export function NotificationsScreen({ center, onOpenMeeting, onBack }) {
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState("ALL");

  async function refresh() {
    setRefreshing(true);
    await center.refresh();
    setRefreshing(false);
  }

  function open(notification) {
    if (!notification.is_read) center.markRead(notification.id);
    if (notification.meeting_id && notification.type !== "PARTICIPANT_REMOVED") {
      onOpenMeeting?.(notification.meeting_id);
    }
  }

  const visible =
    filter === "UNREAD" ? center.items.filter((item) => !item.is_read) : center.items;

  if (center.loading && center.items.length === 0) {
    return <LoadingState />;
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.screenContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
    >
      {!!onBack && <BackBar label="Quay lại" onPress={onBack} />}

      <View style={styles.filterRow}>
        {[
          ["ALL", `Tất cả (${center.items.length})`],
          ["UNREAD", `Chưa đọc (${center.unread})`]
        ].map(([value, label]) => (
          <Pressable
            key={value}
            onPress={() => setFilter(value)}
            style={[styles.chip, filter === value && styles.chipActive]}
          >
            <Text style={[styles.chipText, filter === value && styles.chipTextActive]}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      {center.unread > 0 && (
        <SecondaryButton
          icon="checkmark-done-outline"
          title="Đánh dấu đã đọc tất cả"
          onPress={center.markAllRead}
        />
      )}

      <ErrorState message={center.error} />

      {visible.length === 0 ? (
        <EmptyState title="Không có thông báo nào" />
      ) : (
        <View style={styles.stack}>
          {visible.map((notification) => (
            <NotificationCard
              key={notification.id}
              notification={notification}
              onPress={() => open(notification)}
              onRemove={() => center.removeOne(notification.id)}
            />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.background,
    flex: 1
  },
  screenContent: {
    gap: spacing.sm,
    padding: spacing.md,
    paddingBottom: spacing.xxl
  },
  stack: {
    gap: spacing.sm
  },
  filterRow: {
    flexDirection: "row",
    gap: spacing.xs
  },
  chip: {
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
    borderRadius: radii.full,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 7
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  chipText: {
    color: colors.muted,
    fontSize: 12.5,
    fontWeight: "800"
  },
  chipTextActive: {
    color: colors.onPrimary
  },
  card: {
    alignItems: "flex-start",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderLeftWidth: 4,
    borderRadius: radii.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md,
    ...shadow(1)
  },
  cardUnread: {
    backgroundColor: colors.surfaceSoft
  },
  cardIcon: {
    alignItems: "center",
    borderRadius: radii.md,
    borderWidth: 1,
    height: 36,
    justifyContent: "center",
    width: 36
  },
  cardBody: {
    flex: 1,
    gap: 3
  },
  cardTop: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs
  },
  cardTitle: {
    color: colors.textStrong,
    flex: 1,
    fontSize: 14.5,
    fontWeight: "800"
  },
  dot: {
    backgroundColor: colors.danger,
    borderRadius: radii.full,
    height: 8,
    width: 8
  },
  cardMessage: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18
  },
  cardMeta: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: 2
  },
  cardTag: {
    backgroundColor: colors.neutralSoft,
    borderRadius: radii.full,
    color: colors.muted,
    fontSize: 10.5,
    fontWeight: "800",
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 2,
    textTransform: "uppercase"
  },
  cardTime: {
    color: colors.subtle,
    fontSize: 11.5,
    fontWeight: "700"
  },
  cardRemove: {
    padding: 2
  }
});
