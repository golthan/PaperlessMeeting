import { useEffect, useMemo, useRef, useState } from "react";
import { Platform, SafeAreaView, StatusBar, StyleSheet, View } from "react-native";
import { StatusBar as ExpoStatusBar } from "expo-status-bar";
import {
  clearSession,
  getStoredSession,
  saveSession
} from "./src/storage";
import {
  DashboardScreen,
  LiveMeetingScreen,
  LoginScreen,
  MeetingDetailScreen,
  MeetingsScreen,
  ProfileScreen,
  TasksScreen
} from "./src/screens";
import { setSessionExpiredHandler } from "./src/api";
import { NotificationsScreen, useNotificationCenter } from "./src/notifications";
import { closeSharedSocket, useSocket } from "./src/realtime";
import { ToastProvider, useToast } from "./src/toast";
import { colors } from "./src/theme";
import { BottomTabs, Header } from "./src/components";

const TAB_SCREENS = ["dashboard", "meetings", "notifications", "tasks", "profile"];

function AppShell() {
  const [booting, setBooting] = useState(true);
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [screen, setScreen] = useState({ name: "dashboard" });
  const [refreshKey, setRefreshKey] = useState(0);
  const toast = useToast();
  // Nhiều request lỗi cùng lúc chỉ được đăng xuất và báo một lần.
  const expiredRef = useRef(false);

  useEffect(() => {
    getStoredSession()
      .then((session) => {
        if (session?.token && session?.user) {
          setToken(session.token);
          setUser(session.user);
        }
      })
      .finally(() => setBooting(false));
  }, []);

  const auth = useMemo(
    () => ({
      token,
      user,
      async login(nextSession) {
        if (nextSession.user.role !== "PARTICIPANT") {
          toast.warning(
            "Vai trò chưa được hỗ trợ đầy đủ",
            "Bản Android hiện tối ưu cho người tham dự (Participant)."
          );
        }
        await saveSession(nextSession);
        expiredRef.current = false;
        setToken(nextSession.token);
        setUser(nextSession.user);
        setScreen({ name: "dashboard" });
        toast.success("Đăng nhập thành công", nextSession.user.full_name);
      },
      /** Lưu lại thông tin người dùng sau khi sửa hồ sơ. */
      async updateUser(nextUser) {
        await saveSession({ token, user: nextUser });
        setUser(nextUser);
      },
      async logout() {
        closeSharedSocket();
        await clearSession();
        setToken(null);
        setUser(null);
        setScreen({ name: "dashboard" });
        toast.info("Đã đăng xuất");
      },
      refresh() {
        setRefreshKey((value) => value + 1);
      },
      toast
    }),
    [token, user, toast]
  );

  // Một kết nối realtime dùng chung: thông báo cá nhân và mọi phòng họp đang mở.
  const { socket, status: realtimeStatus } = useSocket(token);
  const notificationCenter = useNotificationCenter(auth, socket);

  // Tài khoản bị xoá / khoá / chưa được duyệt trong khi máy vẫn giữ token cũ:
  // tự đăng xuất và nói rõ lý do thay vì kẹt ở màn hình lỗi.
  useEffect(() => {
    setSessionExpiredHandler(async (message) => {
      if (expiredRef.current) return;
      expiredRef.current = true;
      closeSharedSocket();
      await clearSession();
      setToken(null);
      setUser(null);
      setScreen({ name: "dashboard" });
      toast.warning("Phiên đăng nhập không còn hiệu lực", message);
    });
    return () => setSessionExpiredHandler(null);
  }, [toast]);

  if (booting) {
    return <LoginScreen auth={auth} booting />;
  }

  if (!token || !user) {
    return <LoginScreen auth={auth} />;
  }

  const showDetail = screen.name === "meetingDetail";
  const showLive = screen.name === "liveMeeting";
  const showNested = showDetail || showLive;

  function openMeeting(meetingId) {
    setScreen({ name: "meetingDetail", meetingId });
  }

  function joinMeeting(meetingId) {
    setScreen({ name: "liveMeeting", meetingId });
  }

  return (
    <SafeAreaView style={styles.shell}>
      <ExpoStatusBar style="dark" />
      <StatusBar barStyle="dark-content" backgroundColor={colors.surface} />
      <Header
        title={
          showLive
            ? "Phòng họp trực tiếp"
            : showDetail
              ? "Chi tiết cuộc họp"
              : titleByScreen(screen.name)
        }
        subtitle={user.full_name || user.email}
        onLogout={auth.logout}
        onOpenProfile={() => setScreen({ name: "profile" })}
        onBack={showNested ? () => setScreen({ name: "meetings" }) : null}
        onOpenNotifications={
          screen.name === "notifications"
            ? null
            : () => setScreen({ name: "notifications" })
        }
        unreadCount={notificationCenter.unread}
      />
      <View style={styles.content}>
        {screen.name === "dashboard" && (
          <DashboardScreen auth={auth} refreshKey={refreshKey} />
        )}
        {screen.name === "meetings" && (
          <MeetingsScreen
            auth={auth}
            refreshKey={refreshKey}
            onOpenMeeting={openMeeting}
            onJoinMeeting={joinMeeting}
          />
        )}
        {screen.name === "notifications" && (
          <NotificationsScreen
            center={notificationCenter}
            onOpenMeeting={openMeeting}
            onBack={() => setScreen({ name: "dashboard" })}
          />
        )}
        {screen.name === "tasks" && <TasksScreen auth={auth} refreshKey={refreshKey} />}
        {screen.name === "profile" && <ProfileScreen auth={auth} />}
        {showDetail && (
          <MeetingDetailScreen
            auth={auth}
            meetingId={screen.meetingId}
            socket={socket}
            realtimeStatus={realtimeStatus}
            onBack={() => setScreen({ name: "meetings" })}
            onOpenLive={() => joinMeeting(screen.meetingId)}
          />
        )}
        {showLive && (
          <LiveMeetingScreen
            auth={auth}
            meetingId={screen.meetingId}
            socket={socket}
            realtimeStatus={realtimeStatus}
            onBack={() =>
              setScreen({ name: "meetingDetail", meetingId: screen.meetingId })
            }
          />
        )}
      </View>
      {!showNested && (
        <BottomTabs
          active={TAB_SCREENS.includes(screen.name) ? screen.name : "dashboard"}
          onChange={(name) => setScreen({ name })}
          unreadCount={notificationCenter.unread}
        />
      )}
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AppShell />
    </ToastProvider>
  );
}

function titleByScreen(name) {
  if (name === "meetings") return "Cuộc họp được mời";
  if (name === "tasks") return "Nhiệm vụ của tôi";
  if (name === "notifications") return "Thông báo";
  if (name === "profile") return "Hồ sơ cá nhân";
  return "Dashboard";
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: colors.background,
    // SafeAreaView không tự chừa status bar trên Android
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight : 0
  },
  content: {
    flex: 1
  }
});
