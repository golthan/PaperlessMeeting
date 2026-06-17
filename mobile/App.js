import { useEffect, useMemo, useState } from "react";
import { Alert, SafeAreaView, StatusBar, StyleSheet, View } from "react-native";
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
  TasksScreen
} from "./src/screens";
import { colors } from "./src/theme";
import { BottomTabs, Header } from "./src/components";

export default function App() {
  const [booting, setBooting] = useState(true);
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [screen, setScreen] = useState({ name: "dashboard" });
  const [refreshKey, setRefreshKey] = useState(0);

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
          Alert.alert(
            "Không hỗ trợ role này",
            "Bản Android hiện ưu tiên cho Participant theo đặc tả MVP."
          );
        }
        await saveSession(nextSession);
        setToken(nextSession.token);
        setUser(nextSession.user);
        setScreen({ name: "dashboard" });
      },
      async logout() {
        await clearSession();
        setToken(null);
        setUser(null);
        setScreen({ name: "dashboard" });
      },
      refresh() {
        setRefreshKey((value) => value + 1);
      }
    }),
    [token, user]
  );

  if (booting) {
    return <LoginScreen auth={auth} booting />;
  }

  if (!token || !user) {
    return <LoginScreen auth={auth} />;
  }

  const showDetail = screen.name === "meetingDetail";
  const showLive = screen.name === "liveMeeting";
  const showNested = showDetail || showLive;

  return (
    <SafeAreaView style={styles.shell}>
      <ExpoStatusBar style="dark" />
      <StatusBar barStyle="dark-content" backgroundColor={colors.surface} />
      <Header
        title={showLive ? "Phòng họp Live" : showDetail ? "Chi tiết cuộc họp" : titleByScreen(screen.name)}
        subtitle={user.full_name || user.email}
        onLogout={auth.logout}
        onBack={showNested ? () => setScreen({ name: "meetings" }) : null}
      />
      <View style={styles.content}>
        {screen.name === "dashboard" && (
          <DashboardScreen auth={auth} refreshKey={refreshKey} />
        )}
        {screen.name === "meetings" && (
          <MeetingsScreen
            auth={auth}
            refreshKey={refreshKey}
            onOpenMeeting={(meetingId) =>
              setScreen({ name: "meetingDetail", meetingId })
            }
          />
        )}
        {screen.name === "tasks" && <TasksScreen auth={auth} refreshKey={refreshKey} />}
        {showDetail && (
          <MeetingDetailScreen
            auth={auth}
            meetingId={screen.meetingId}
            onBack={() => setScreen({ name: "meetings" })}
            onOpenLive={() =>
              setScreen({ name: "liveMeeting", meetingId: screen.meetingId })
            }
          />
        )}
        {showLive && (
          <LiveMeetingScreen
            auth={auth}
            meetingId={screen.meetingId}
          />
        )}
      </View>
      {!showNested && (
        <BottomTabs active={screen.name} onChange={(name) => setScreen({ name })} />
      )}
    </SafeAreaView>
  );
}

function titleByScreen(name) {
  if (name === "meetings") return "Cuộc họp được mời";
  if (name === "tasks") return "Nhiệm vụ của tôi";
  return "Dashboard";
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: colors.background
  },
  content: {
    flex: 1
  }
});
