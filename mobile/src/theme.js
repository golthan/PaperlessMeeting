import { Platform } from "react-native";

export const colors = {
  // Nền & bề mặt
  background: "#eef4f5",
  surface: "#ffffff",
  surfaceSoft: "#ecfbfc",
  surfaceSunken: "#f4f8f9",
  border: "#dde8ec",
  borderStrong: "#c7d7dd",

  // Chữ
  text: "#101d24",
  textStrong: "#0b2733",
  muted: "#647b86",
  subtle: "#8ba0a9",

  // Thương hiệu
  primary: "#0e7490",
  primaryDark: "#0d5c74",
  primaryLight: "#35a8bf",
  primarySoft: "#d3f2f5",
  onPrimary: "#ffffff",

  // Nhấn (accent)
  accent: "#d99311",
  accentSoft: "#fdf1d8",

  // Trạng thái
  danger: "#a32f1f",
  dangerSoft: "#fdeeeb",
  dangerBorder: "#f4c7bf",
  success: "#1f6b41",
  successSoft: "#e7f7ee",
  successBorder: "#b6e3c8",
  warning: "#8a5a06",
  warningSoft: "#fdf3dc",
  warningBorder: "#efd7a0",
  info: "#1a5a8f",
  infoSoft: "#e8f2fc",
  infoBorder: "#bcd8f0",
  neutralSoft: "#eaf1f3",
  neutralBorder: "#dae4e8"
};

export const spacing = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  xxl: 32
};

export const radius = 14;

export const radii = {
  sm: 8,
  md: 10,
  lg: 14,
  xl: 20,
  full: 999
};

export const typography = {
  title: { fontSize: 22, fontWeight: "800", letterSpacing: -0.4 },
  heading: { fontSize: 17, fontWeight: "800", letterSpacing: -0.2 },
  body: { fontSize: 15, fontWeight: "500" },
  label: { fontSize: 12.5, fontWeight: "700", letterSpacing: 0.2 },
  caption: { fontSize: 12, fontWeight: "600" }
};

/** Đổ bóng đồng nhất cho iOS và Android. */
export function shadow(level = 1) {
  const presets = {
    1: { radius: 6, opacity: 0.06, offset: 2, elevation: 1 },
    2: { radius: 14, opacity: 0.08, offset: 4, elevation: 3 },
    3: { radius: 26, opacity: 0.12, offset: 8, elevation: 6 }
  };
  const preset = presets[level] || presets[1];

  return Platform.select({
    android: { elevation: preset.elevation },
    default: {
      shadowColor: "#102833",
      shadowOpacity: preset.opacity,
      shadowRadius: preset.radius,
      shadowOffset: { width: 0, height: preset.offset }
    }
  });
}
