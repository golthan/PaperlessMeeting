import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { colors, radii, shadow, spacing } from "./theme";

/**
 * Hiệu ứng bấm dùng chung: phần tử thu nhỏ khi ngón tay chạm và bật lại khi nhả.
 * Dùng useNativeDriver nên chạy mượt cả trên máy yếu.
 */
export function usePressScale(to = 0.96) {
  const scale = useRef(new Animated.Value(1)).current;

  const onPressIn = useCallback(() => {
    Animated.spring(scale, {
      toValue: to,
      useNativeDriver: true,
      speed: 40,
      bounciness: 0
    }).start();
  }, [scale, to]);

  const onPressOut = useCallback(() => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 26,
      bounciness: 9
    }).start();
  }, [scale]);

  return { scale, onPressIn, onPressOut };
}

const toneMap = {
  ACTIVE: "success",
  UPCOMING: "info",
  ONGOING: "warning",
  FINISHED: "success",
  CANCELLED: "danger",
  PENDING: "warning",
  ACCEPTED: "success",
  DECLINED: "danger",
  APPROVED: "success",
  REJECTED: "danger",
  OPEN: "success",
  CLOSED: "neutral",
  DRAFT: "warning",
  PUBLISHED: "success",
  TODO: "neutral",
  IN_PROGRESS: "info",
  DONE: "success",
  OVERDUE: "danger",
  PRESENT: "success",
  ABSENT: "neutral",
  LATE: "warning",
  HIGH: "danger",
  MEDIUM: "warning",
  LOW: "neutral",
  ONLINE: "success",
  OFFLINE: "neutral",
  HYBRID: "info",
  CURRENT: "info",
  SECRETARY: "info",
  MEMBER: "neutral",
  ADMIN: "danger",
  ORGANIZER: "info",
  PARTICIPANT: "neutral"
};

/** Nhãn tiếng Việt cho từng trạng thái để người dùng không phải đọc mã enum. */
const labelMap = {
  ACTIVE: "Đang hoạt động",
  LOCKED: "Đã khoá",
  DRAFT: "Nháp",
  UPCOMING: "Sắp diễn ra",
  ONGOING: "Đang họp",
  FINISHED: "Đã kết thúc",
  CANCELLED: "Đã huỷ",
  PENDING: "Chờ xử lý",
  ACCEPTED: "Đã nhận lời",
  DECLINED: "Từ chối",
  APPROVED: "Đã duyệt",
  REJECTED: "Bị từ chối",
  OPEN: "Đang mở",
  CLOSED: "Đã chốt",
  PUBLISHED: "Đã ban hành",
  CURRENT: "Đang trình bày",
  TODO: "Chưa làm",
  IN_PROGRESS: "Đang làm",
  DONE: "Hoàn thành",
  OVERDUE: "Quá hạn",
  PRESENT: "Có mặt",
  ABSENT: "Vắng mặt",
  LATE: "Đi muộn",
  ONLINE: "Trực tuyến",
  OFFLINE: "Tập trung",
  HYBRID: "Tập trung + trực tuyến",
  CHAIRMAN: "Chủ trì",
  SECRETARY: "Thư ký",
  MEMBER: "Thành viên",
  HIGH: "Ưu tiên cao",
  MEDIUM: "Ưu tiên vừa",
  LOW: "Ưu tiên thấp",
  ADMIN: "Quản trị viên",
  ORGANIZER: "Người tổ chức",
  PARTICIPANT: "Người tham dự"
};

function initials(value) {
  return String(value || "?")
    .trim()
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}

export function Header({
  title,
  subtitle,
  onLogout,
  onBack,
  onOpenNotifications,
  onOpenProfile,
  unreadCount = 0
}) {
  return (
    <View style={styles.header}>
      <View style={styles.headerRow}>
        {onBack ? (
          <IconButton icon="chevron-back" label="Quay lại" onPress={onBack} />
        ) : (
          // Chạm vào avatar là mở hồ sơ cá nhân.
          <Pressable
            onPress={onOpenProfile}
            disabled={!onOpenProfile}
            accessibilityRole="button"
            accessibilityLabel="Hồ sơ cá nhân"
            hitSlop={6}
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials(subtitle)}</Text>
            </View>
          </Pressable>
        )}
        <View style={styles.headerText}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
        {!!onOpenNotifications && (
          <NotificationButton count={unreadCount} onPress={onOpenNotifications} />
        )}
        <IconButton icon="log-out-outline" label="Đăng xuất" onPress={onLogout} />
      </View>
    </View>
  );
}

/** Chuông thông báo có badge số chưa đọc, rung nhẹ mỗi khi có tin mới. */
export function NotificationButton({ count = 0, onPress }) {
  const { scale, onPressIn, onPressOut } = usePressScale(0.9);
  const shake = useRef(new Animated.Value(0)).current;
  const previous = useRef(count);

  useEffect(() => {
    if (count > previous.current) {
      Animated.sequence([
        Animated.timing(shake, { toValue: 1, duration: 90, useNativeDriver: true }),
        Animated.timing(shake, { toValue: -1, duration: 90, useNativeDriver: true }),
        Animated.timing(shake, { toValue: 0.6, duration: 80, useNativeDriver: true }),
        Animated.timing(shake, { toValue: 0, duration: 80, useNativeDriver: true })
      ]).start();
    }
    previous.current = count;
  }, [count, shake]);

  const rotate = shake.interpolate({
    inputRange: [-1, 1],
    outputRange: ["-14deg", "14deg"]
  });

  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={`Thông báo${count > 0 ? `, ${count} chưa đọc` : ""}`}
    >
      <Animated.View style={[styles.iconButton, { transform: [{ scale }, { rotate }] }]}>
        <Ionicons name="notifications-outline" size={19} color={colors.primary} />
        {count > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{count > 99 ? "99+" : count}</Text>
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
}

/** Thanh quay lại đặt đầu các màn hình con để luôn có đường thoát rõ ràng. */
export function BackBar({ label = "Quay lại", onPress, right }) {
  const { scale, onPressIn, onPressOut } = usePressScale(0.97);

  return (
    <View style={styles.backBar}>
      <Pressable
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        accessibilityRole="button"
      >
        <Animated.View style={[styles.backChip, { transform: [{ scale }] }]}>
          <Ionicons name="chevron-back" size={16} color={colors.primaryDark} />
          <Text style={styles.backChipText}>{label}</Text>
        </Animated.View>
      </Pressable>
      {right}
    </View>
  );
}

const TAB_ITEMS = [
  ["dashboard", "Tổng quan", "grid", "grid-outline"],
  ["meetings", "Cuộc họp", "calendar", "calendar-outline"],
  ["notifications", "Thông báo", "notifications", "notifications-outline"],
  ["tasks", "Nhiệm vụ", "checkbox", "checkbox-outline"],
  ["profile", "Hồ sơ", "person-circle", "person-circle-outline"]
];

function TabButton({ name, label, iconActive, icon, isActive, badge, onPress }) {
  const { scale, onPressIn, onPressOut } = usePressScale(0.9);

  return (
    <Pressable
      style={styles.tab}
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: isActive }}
    >
      <Animated.View
        style={[styles.tabIcon, isActive && styles.tabIconActive, { transform: [{ scale }] }]}
      >
        <Ionicons
          name={isActive ? iconActive : icon}
          size={19}
          color={isActive ? colors.primary : colors.muted}
        />
        {badge > 0 && (
          <View style={styles.tabBadge}>
            <Text style={styles.badgeText}>{badge > 99 ? "99+" : badge}</Text>
          </View>
        )}
      </Animated.View>
      <Text style={[styles.tabText, isActive && styles.tabTextActive]}>{label}</Text>
    </Pressable>
  );
}

export function BottomTabs({ active, onChange, unreadCount = 0 }) {
  return (
    <View style={styles.tabs}>
      {TAB_ITEMS.map(([name, label, iconActive, icon]) => (
        <TabButton
          key={name}
          name={name}
          label={label}
          icon={icon}
          iconActive={iconActive}
          isActive={active === name}
          badge={name === "notifications" ? unreadCount : 0}
          onPress={() => onChange(name)}
        />
      ))}
    </View>
  );
}

export function PrimaryButton({ icon, title, onPress, disabled, danger, loading }) {
  const { scale, onPressIn, onPressOut } = usePressScale();

  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled || loading) }}
    >
      <Animated.View
        style={[
          styles.button,
          danger ? styles.dangerButton : styles.primaryButton,
          (disabled || loading) && styles.disabledButton,
          { transform: [{ scale }] }
        ]}
      >
        {loading ? (
          <ActivityIndicator color={colors.onPrimary} size="small" />
        ) : (
          icon && <Ionicons name={icon} size={17} color={colors.onPrimary} />
        )}
        <Text style={styles.primaryButtonText}>{title}</Text>
      </Animated.View>
    </Pressable>
  );
}

export function SecondaryButton({ icon, title, onPress, disabled }) {
  const { scale, onPressIn, onPressOut } = usePressScale();

  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
    >
      <Animated.View
        style={[
          styles.button,
          styles.secondaryButton,
          disabled && styles.disabledButton,
          { transform: [{ scale }] }
        ]}
      >
        {icon && <Ionicons name={icon} size={17} color={colors.primary} />}
        <Text style={styles.secondaryButtonText}>{title}</Text>
      </Animated.View>
    </Pressable>
  );
}

export function IconButton({ icon, label, onPress, disabled }) {
  const { scale, onPressIn, onPressOut } = usePressScale(0.9);

  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={disabled}
      accessibilityLabel={label}
      accessibilityRole="button"
      hitSlop={6}
    >
      <Animated.View
        style={[styles.iconButton, disabled && styles.disabledButton, { transform: [{ scale }] }]}
      >
        <Ionicons name={icon} size={19} color={colors.primary} />
      </Animated.View>
    </Pressable>
  );
}

export function Field({
  label,
  value,
  onChangeText,
  secureTextEntry,
  keyboardType,
  placeholder,
  multiline
}) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[
          styles.input,
          multiline && styles.inputMultiline,
          focused && styles.inputFocused
        ]}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        placeholder={placeholder}
        multiline={multiline}
        autoCapitalize="none"
        placeholderTextColor={colors.subtle}
        selectionColor={colors.primaryLight}
      />
    </View>
  );
}

export function Panel({ children, style }) {
  return <View style={[styles.panel, style]}>{children}</View>;
}

export function SectionTitle({ title, action }) {
  return (
    <View style={styles.sectionTitle}>
      <View style={styles.sectionTitleLeft}>
        <View style={styles.sectionAccent} />
        <Text style={styles.sectionTitleText}>{title}</Text>
      </View>
      {action}
    </View>
  );
}

export function EmptyState({ title }) {
  return (
    <View style={styles.empty}>
      <Ionicons name="file-tray-outline" size={26} color={colors.subtle} />
      <Text style={styles.emptyText}>{title || "Chưa có dữ liệu"}</Text>
    </View>
  );
}

export function LoadingState() {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.primary} size="large" />
      <Text style={styles.loadingText}>Đang tải...</Text>
    </View>
  );
}

export function ErrorState({ message }) {
  if (!message) return null;
  return (
    <View style={styles.error}>
      <Ionicons name="alert-circle" size={17} color={colors.danger} />
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

export function StatusPill({ value, label }) {
  const tone = toneMap[value] || "neutral";
  return (
    <View style={[styles.pill, styles[`pill_${tone}`]]}>
      <View style={[styles.pillDot, styles[`pillDot_${tone}`]]} />
      <Text style={[styles.pillText, styles[`pillText_${tone}`]]}>
        {label || labelMap[value] || value || "-"}
      </Text>
    </View>
  );
}

export function StatBox({ icon, label, value }) {
  return (
    <View style={styles.statBox}>
      <View style={styles.statAccent} />
      <View style={styles.statIcon}>
        <Ionicons name={icon} size={19} color={colors.primary} />
      </View>
      <Text style={styles.statLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

export function CardRow({ title, subtitle, meta, right, onPress }) {
  const { scale, onPressIn, onPressOut } = usePressScale(0.985);

  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPress ? onPressIn : undefined}
      onPressOut={onPress ? onPressOut : undefined}
      disabled={!onPress}
      accessibilityRole={onPress ? "button" : undefined}
    >
      <Animated.View style={[styles.rowCard, { transform: [{ scale }] }]}>
      <View style={styles.rowCardBody}>
        <Text style={styles.rowTitle}>{title}</Text>
        {!!subtitle && <Text style={styles.rowSubtitle}>{subtitle}</Text>}
        {!!meta && (
          <View style={styles.rowMetaWrap}>
            <Ionicons name="time-outline" size={13} color={colors.primary} />
            <Text style={styles.rowMeta}>{meta}</Text>
          </View>
        )}
      </View>
      <View style={styles.rowCardRight}>
        {right}
        {!!onPress && (
          <Ionicons name="chevron-forward" size={17} color={colors.subtle} />
        )}
      </View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  /* Header */
  header: {
    backgroundColor: colors.surface,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...shadow(1)
  },
  headerRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm
  },
  headerText: {
    flex: 1
  },
  headerTitle: {
    color: colors.textStrong,
    fontSize: 19,
    fontWeight: "800",
    letterSpacing: -0.3
  },
  headerSubtitle: {
    color: colors.muted,
    fontSize: 12.5,
    fontWeight: "600",
    marginTop: 1
  },
  avatar: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radii.full,
    height: 38,
    justifyContent: "center",
    width: 38
  },
  avatarText: {
    color: colors.onPrimary,
    fontSize: 13,
    fontWeight: "800"
  },

  /* Bottom tabs */
  tabs: {
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: "row",
    minHeight: 66,
    paddingBottom: 4,
    paddingTop: 6
  },
  tab: {
    alignItems: "center",
    flex: 1,
    gap: 2,
    justifyContent: "center"
  },
  tabIcon: {
    alignItems: "center",
    borderRadius: radii.full,
    height: 30,
    justifyContent: "center",
    width: 54
  },
  tabIconActive: {
    backgroundColor: colors.surfaceSoft
  },
  tabText: {
    color: colors.muted,
    fontSize: 11.5,
    fontWeight: "700"
  },
  tabTextActive: {
    color: colors.primary,
    fontWeight: "800"
  },

  /* Buttons */
  button: {
    alignItems: "center",
    borderRadius: radii.md,
    flexDirection: "row",
    gap: 7,
    justifyContent: "center",
    minHeight: 46,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm
  },
  buttonPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.985 }]
  },
  primaryButton: {
    backgroundColor: colors.primary,
    ...shadow(2)
  },
  dangerButton: {
    backgroundColor: colors.danger,
    ...shadow(2)
  },
  secondaryButton: {
    backgroundColor: colors.surfaceSoft,
    borderColor: colors.primarySoft,
    borderWidth: 1
  },
  disabledButton: {
    opacity: 0.45
  },
  primaryButtonText: {
    color: colors.onPrimary,
    fontSize: 14.5,
    fontWeight: "800"
  },
  secondaryButtonText: {
    color: colors.primaryDark,
    fontSize: 14.5,
    fontWeight: "800"
  },
  iconButton: {
    alignItems: "center",
    backgroundColor: colors.surfaceSoft,
    borderColor: colors.primarySoft,
    borderRadius: radii.md,
    borderWidth: 1,
    height: 40,
    justifyContent: "center",
    width: 40
  },

  /* Badge & thanh quay lại */
  badge: {
    alignItems: "center",
    backgroundColor: colors.danger,
    borderColor: colors.surface,
    borderRadius: radii.full,
    borderWidth: 2,
    height: 19,
    justifyContent: "center",
    minWidth: 19,
    paddingHorizontal: 3,
    position: "absolute",
    right: -6,
    top: -6
  },
  badgeText: {
    color: colors.onPrimary,
    fontSize: 10,
    fontWeight: "800"
  },
  tabBadge: {
    alignItems: "center",
    backgroundColor: colors.danger,
    borderColor: colors.surface,
    borderRadius: radii.full,
    borderWidth: 2,
    height: 18,
    justifyContent: "center",
    minWidth: 18,
    paddingHorizontal: 3,
    position: "absolute",
    right: 8,
    top: -4
  },
  backBar: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.sm
  },
  backChip: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
    borderRadius: radii.full,
    borderWidth: 1,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    ...shadow(1)
  },
  backChipText: {
    color: colors.primaryDark,
    fontSize: 13,
    fontWeight: "800"
  },

  /* Fields */
  field: {
    gap: 6
  },
  label: {
    color: colors.muted,
    fontSize: 12.5,
    fontWeight: "800",
    letterSpacing: 0.2
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
    borderRadius: radii.md,
    borderWidth: 1,
    color: colors.text,
    fontSize: 15,
    minHeight: 46,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  inputMultiline: {
    minHeight: 104,
    textAlignVertical: "top"
  },
  inputFocused: {
    borderColor: colors.primary,
    borderWidth: 1.5
  },

  /* Surfaces */
  panel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: spacing.md,
    ...shadow(1)
  },
  sectionTitle: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.sm
  },
  sectionTitleLeft: {
    alignItems: "center",
    flexDirection: "row",
    flexShrink: 1,
    gap: spacing.xs
  },
  sectionAccent: {
    backgroundColor: colors.primary,
    borderRadius: radii.full,
    height: 16,
    width: 3
  },
  sectionTitleText: {
    color: colors.textStrong,
    fontSize: 16.5,
    fontWeight: "800",
    letterSpacing: -0.2
  },

  /* States */
  empty: {
    alignItems: "center",
    backgroundColor: colors.surfaceSunken,
    borderColor: colors.borderStrong,
    borderRadius: radii.lg,
    borderStyle: "dashed",
    borderWidth: 1,
    gap: spacing.xs,
    justifyContent: "center",
    minHeight: 110,
    padding: spacing.md
  },
  emptyText: {
    color: colors.muted,
    fontSize: 13.5,
    fontWeight: "700"
  },
  loading: {
    alignItems: "center",
    flex: 1,
    gap: spacing.sm,
    justifyContent: "center"
  },
  loadingText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700"
  },
  error: {
    alignItems: "center",
    backgroundColor: colors.dangerSoft,
    borderColor: colors.dangerBorder,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.xs,
    padding: spacing.sm
  },
  errorText: {
    color: colors.danger,
    flex: 1,
    fontSize: 13.5,
    fontWeight: "700"
  },

  /* Pills */
  pill: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: radii.full,
    borderWidth: 1,
    flexDirection: "row",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 3
  },
  pillDot: {
    borderRadius: radii.full,
    height: 5,
    width: 5
  },
  pill_success: {
    backgroundColor: colors.successSoft,
    borderColor: colors.successBorder
  },
  pill_danger: {
    backgroundColor: colors.dangerSoft,
    borderColor: colors.dangerBorder
  },
  pill_info: {
    backgroundColor: colors.infoSoft,
    borderColor: colors.infoBorder
  },
  pill_warning: {
    backgroundColor: colors.warningSoft,
    borderColor: colors.warningBorder
  },
  pill_neutral: {
    backgroundColor: colors.neutralSoft,
    borderColor: colors.neutralBorder
  },
  pillDot_success: { backgroundColor: colors.success },
  pillDot_danger: { backgroundColor: colors.danger },
  pillDot_info: { backgroundColor: colors.info },
  pillDot_warning: { backgroundColor: colors.warning },
  pillDot_neutral: { backgroundColor: colors.muted },
  pillText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.2
  },
  pillText_success: { color: colors.success },
  pillText_danger: { color: colors.danger },
  pillText_info: { color: colors.info },
  pillText_warning: { color: colors.warning },
  pillText_neutral: { color: colors.muted },

  /* Stats */
  statBox: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    flex: 1,
    minWidth: "46%",
    overflow: "hidden",
    padding: spacing.md,
    ...shadow(1)
  },
  statAccent: {
    backgroundColor: colors.primary,
    bottom: 0,
    left: 0,
    position: "absolute",
    top: 0,
    width: 3
  },
  statIcon: {
    alignItems: "center",
    backgroundColor: colors.surfaceSoft,
    borderColor: colors.primarySoft,
    borderRadius: radii.md,
    borderWidth: 1,
    height: 38,
    justifyContent: "center",
    marginBottom: spacing.sm,
    width: 38
  },
  statLabel: {
    color: colors.muted,
    fontSize: 12.5,
    fontWeight: "700"
  },
  statValue: {
    color: colors.textStrong,
    fontSize: 27,
    fontWeight: "800",
    letterSpacing: -0.6,
    marginTop: 2
  },

  /* Card rows */
  rowCard: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md,
    ...shadow(1)
  },
  rowCardPressed: {
    backgroundColor: colors.surfaceSunken,
    borderColor: colors.primarySoft
  },
  rowCardBody: {
    flex: 1,
    gap: 3
  },
  rowCardRight: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: spacing.xs
  },
  rowTitle: {
    color: colors.textStrong,
    fontSize: 15.5,
    fontWeight: "800",
    letterSpacing: -0.2
  },
  rowSubtitle: {
    color: colors.muted,
    fontSize: 13
  },
  rowMetaWrap: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
    marginTop: 1
  },
  rowMeta: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "800"
  }
});
