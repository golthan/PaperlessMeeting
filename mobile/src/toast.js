import { Ionicons } from "@expo/vector-icons";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { Animated, Platform, Pressable, StatusBar, StyleSheet, Text, View } from "react-native";
import { colors, radii, shadow, spacing } from "./theme";

const ToastContext = createContext(null);

const DEFAULT_DURATION = 3800;
const MAX_VISIBLE = 3;

const TONES = {
  success: { icon: "checkmark-circle", color: colors.success, bg: colors.successSoft, border: colors.successBorder },
  error: { icon: "close-circle", color: colors.danger, bg: colors.dangerSoft, border: colors.dangerBorder },
  warning: { icon: "alert-circle", color: colors.warning, bg: colors.warningSoft, border: colors.warningBorder },
  info: { icon: "information-circle", color: colors.info, bg: colors.infoSoft, border: colors.infoBorder },
  notification: { icon: "notifications", color: colors.primary, bg: colors.primarySoft, border: colors.primaryLight }
};

/** Một thẻ toast: trượt vào từ mép phải rồi tự tan sau vài giây. */
function ToastCard({ toast, onClose }) {
  const tone = TONES[toast.tone] || TONES.info;
  const translateX = useRef(new Animated.Value(60)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  const dismiss = useCallback(() => {
    Animated.parallel([
      Animated.timing(translateX, { toValue: 60, duration: 160, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 160, useNativeDriver: true })
    ]).start(() => closeRef.current(toast.id));
  }, [toast.id, translateX, opacity]);

  useEffect(() => {
    Animated.parallel([
      Animated.spring(translateX, { toValue: 0, useNativeDriver: true, friction: 8, tension: 70 }),
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true })
    ]).start();

    const timer = setTimeout(dismiss, toast.duration || DEFAULT_DURATION);
    return () => clearTimeout(timer);
  }, [dismiss, translateX, opacity, toast.duration]);

  return (
    <Animated.View
      style={[
        styles.toast,
        { borderLeftColor: tone.color, opacity, transform: [{ translateX }] }
      ]}
    >
      <View style={[styles.toastIcon, { backgroundColor: tone.bg, borderColor: tone.border }]}>
        <Ionicons name={tone.icon} size={17} color={tone.color} />
      </View>
      <View style={styles.toastBody}>
        <Text style={styles.toastTitle} numberOfLines={2}>
          {toast.title}
        </Text>
        {!!toast.message && (
          <Text style={styles.toastMessage} numberOfLines={3}>
            {toast.message}
          </Text>
        )}
      </View>
      <Pressable
        onPress={dismiss}
        hitSlop={8}
        style={({ pressed }) => [styles.toastClose, pressed && { opacity: 0.5 }]}
        accessibilityLabel="Đóng thông báo"
      >
        <Ionicons name="close" size={15} color={colors.subtle} />
      </Pressable>
    </Animated.View>
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const remove = useCallback((id) => {
    setToasts((list) => list.filter((item) => item.id !== id));
  }, []);

  const push = useCallback((toast) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setToasts((list) => [...list, { id, tone: "info", ...toast }].slice(-MAX_VISIBLE));
  }, []);

  const api = useMemo(
    () => ({
      push,
      success: (title, message) => push({ tone: "success", title, message }),
      error: (title, message) => push({ tone: "error", title, message }),
      warning: (title, message) => push({ tone: "warning", title, message }),
      info: (title, message) => push({ tone: "info", title, message })
    }),
    [push]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <View style={styles.viewport} pointerEvents="box-none">
        {toasts.map((toast) => (
          <ToastCard key={toast.id} toast={toast} onClose={remove} />
        ))}
      </View>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast phải nằm trong ToastProvider");
  }
  return context;
}

const styles = StyleSheet.create({
  viewport: {
    position: "absolute",
    top: (Platform.OS === "android" ? StatusBar.currentHeight || 0 : 0) + spacing.sm,
    right: spacing.sm,
    left: spacing.xl,
    gap: spacing.xs,
    zIndex: 999
  },
  toast: {
    alignItems: "flex-start",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderLeftWidth: 4,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.sm,
    ...shadow(3)
  },
  toastIcon: {
    alignItems: "center",
    borderRadius: radii.sm,
    borderWidth: 1,
    height: 30,
    justifyContent: "center",
    width: 30
  },
  toastBody: {
    flex: 1,
    gap: 2
  },
  toastTitle: {
    color: colors.textStrong,
    fontSize: 14,
    fontWeight: "800"
  },
  toastMessage: {
    color: colors.muted,
    fontSize: 12.5,
    fontWeight: "600",
    lineHeight: 17
  },
  toastClose: {
    padding: 2
  }
});
