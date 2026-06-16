import { Ionicons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { colors, radius, spacing } from "./theme";

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
  LOW: "neutral"
};

export function Header({ title, subtitle, onLogout, onBack }) {
  return (
    <View style={styles.header}>
      <View style={styles.headerRow}>
        {onBack && (
          <IconButton icon="chevron-back" label="Quay lại" onPress={onBack} />
        )}
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>{title}</Text>
          <Text style={styles.headerSubtitle}>{subtitle}</Text>
        </View>
        <IconButton icon="log-out-outline" label="Đăng xuất" onPress={onLogout} />
      </View>
    </View>
  );
}

export function BottomTabs({ active, onChange }) {
  const tabs = [
    ["dashboard", "Tổng quan", "grid-outline"],
    ["meetings", "Cuộc họp", "calendar-outline"],
    ["tasks", "Nhiệm vụ", "checkbox-outline"]
  ];

  return (
    <View style={styles.tabs}>
      {tabs.map(([name, label, icon]) => (
        <Pressable
          key={name}
          style={[styles.tab, active === name && styles.tabActive]}
          onPress={() => onChange(name)}
        >
          <Ionicons
            name={icon}
            size={20}
            color={active === name ? colors.primary : colors.muted}
          />
          <Text style={[styles.tabText, active === name && styles.tabTextActive]}>
            {label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export function PrimaryButton({ icon, title, onPress, disabled, danger }) {
  return (
    <Pressable
      style={[
        styles.button,
        danger ? styles.dangerButton : styles.primaryButton,
        disabled && styles.disabledButton
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      {icon && <Ionicons name={icon} size={18} color="#fff" />}
      <Text style={styles.primaryButtonText}>{title}</Text>
    </Pressable>
  );
}

export function SecondaryButton({ icon, title, onPress, disabled }) {
  return (
    <Pressable
      style={[styles.button, styles.secondaryButton, disabled && styles.disabledButton]}
      onPress={onPress}
      disabled={disabled}
    >
      {icon && <Ionicons name={icon} size={18} color={colors.primary} />}
      <Text style={styles.secondaryButtonText}>{title}</Text>
    </Pressable>
  );
}

export function IconButton({ icon, label, onPress }) {
  return (
    <Pressable style={styles.iconButton} onPress={onPress} accessibilityLabel={label}>
      <Ionicons name={icon} size={20} color={colors.text} />
    </Pressable>
  );
}

export function Field({ label, value, onChangeText, secureTextEntry, keyboardType }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize="none"
        placeholderTextColor={colors.muted}
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
      <Text style={styles.sectionTitleText}>{title}</Text>
      {action}
    </View>
  );
}

export function EmptyState({ title }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyText}>{title || "Chưa có dữ liệu"}</Text>
    </View>
  );
}

export function LoadingState() {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}

export function ErrorState({ message }) {
  if (!message) return null;
  return (
    <View style={styles.error}>
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

export function StatusPill({ value }) {
  const tone = toneMap[value] || "neutral";
  return (
    <View style={[styles.pill, styles[`pill_${tone}`]]}>
      <Text style={[styles.pillText, styles[`pillText_${tone}`]]}>
        {value || "-"}
      </Text>
    </View>
  );
}

export function StatBox({ icon, label, value }) {
  return (
    <View style={styles.statBox}>
      <View style={styles.statIcon}>
        <Ionicons name={icon} size={20} color={colors.primary} />
      </View>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

export function CardRow({ title, subtitle, meta, right, onPress }) {
  return (
    <Pressable style={styles.rowCard} onPress={onPress} disabled={!onPress}>
      <View style={styles.rowCardBody}>
        <Text style={styles.rowTitle}>{title}</Text>
        {!!subtitle && <Text style={styles.rowSubtitle}>{subtitle}</Text>}
        {!!meta && <Text style={styles.rowMeta}>{meta}</Text>}
      </View>
      {right}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
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
    color: colors.text,
    fontSize: 20,
    fontWeight: "800"
  },
  headerSubtitle: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 2
  },
  tabs: {
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: "row",
    minHeight: 64
  },
  tab: {
    alignItems: "center",
    flex: 1,
    gap: 3,
    justifyContent: "center"
  },
  tabActive: {
    backgroundColor: colors.surfaceSoft
  },
  tabText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700"
  },
  tabTextActive: {
    color: colors.primary
  },
  button: {
    alignItems: "center",
    borderRadius: 6,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 42,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  primaryButton: {
    backgroundColor: colors.primary
  },
  dangerButton: {
    backgroundColor: colors.danger
  },
  secondaryButton: {
    backgroundColor: colors.surfaceSoft,
    borderColor: "#cde0df",
    borderWidth: 1
  },
  disabledButton: {
    opacity: 0.55
  },
  primaryButtonText: {
    color: "#fff",
    fontWeight: "800"
  },
  secondaryButtonText: {
    color: colors.primary,
    fontWeight: "800"
  },
  iconButton: {
    alignItems: "center",
    backgroundColor: colors.surfaceSoft,
    borderColor: colors.border,
    borderRadius: 6,
    borderWidth: 1,
    height: 40,
    justifyContent: "center",
    width: 40
  },
  field: {
    gap: 6
  },
  label: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "800"
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: "#cfd8dc",
    borderRadius: 6,
    borderWidth: 1,
    color: colors.text,
    minHeight: 44,
    paddingHorizontal: spacing.md
  },
  panel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius,
    borderWidth: 1,
    padding: spacing.md
  },
  sectionTitle: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.sm
  },
  sectionTitleText: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "800"
  },
  empty: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: radius,
    borderStyle: "dashed",
    borderWidth: 1,
    minHeight: 96,
    justifyContent: "center"
  },
  emptyText: {
    color: colors.muted,
    fontWeight: "700"
  },
  loading: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center"
  },
  error: {
    backgroundColor: colors.dangerSoft,
    borderColor: "#f2c5bd",
    borderRadius: 6,
    borderWidth: 1,
    padding: spacing.sm
  },
  errorText: {
    color: colors.danger,
    fontWeight: "800"
  },
  pill: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4
  },
  pill_success: {
    backgroundColor: colors.successSoft
  },
  pill_danger: {
    backgroundColor: colors.dangerSoft
  },
  pill_info: {
    backgroundColor: "#e5f2ff"
  },
  pill_warning: {
    backgroundColor: colors.warningSoft
  },
  pill_neutral: {
    backgroundColor: "#eef1f2"
  },
  pillText: {
    fontSize: 11,
    fontWeight: "900"
  },
  pillText_success: {
    color: colors.success
  },
  pillText_danger: {
    color: colors.danger
  },
  pillText_info: {
    color: "#1c5c92"
  },
  pillText_warning: {
    color: colors.warning
  },
  pillText_neutral: {
    color: "#51606a"
  },
  statBox: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius,
    borderWidth: 1,
    flex: 1,
    minWidth: "47%",
    padding: spacing.md
  },
  statIcon: {
    alignItems: "center",
    backgroundColor: colors.surfaceSoft,
    borderRadius: 8,
    height: 38,
    justifyContent: "center",
    marginBottom: spacing.sm,
    width: 38
  },
  statLabel: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700"
  },
  statValue: {
    color: colors.text,
    fontSize: 26,
    fontWeight: "900",
    marginTop: 3
  },
  rowCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md
  },
  rowCardBody: {
    flex: 1,
    gap: 4
  },
  rowTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "800"
  },
  rowSubtitle: {
    color: colors.muted,
    fontSize: 13
  },
  rowMeta: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "800"
  }
});

