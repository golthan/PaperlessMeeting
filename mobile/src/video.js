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
import {
  ActivityIndicator,
  NativeModules,
  PermissionsAndroid,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import { colors, radii, shadow, spacing } from "./theme";

let livekitCache;

/**
 * Nạp LiveKit bản native.
 *
 * Expo Go không kèm module native của WebRTC nên hàm trả về null và màn hình
 * phòng họp tự chuyển sang phương án mở phòng bằng trình duyệt. Muốn có
 * camera/micro ngay trong app thì chạy bản dev client hoặc APK đã build
 * (xem mobile/README.md).
 *
 * Phải hỏi NativeModules TRƯỚC khi require: @livekit/react-native-webrtc ném lỗi
 * ngay lúc nạp nếu thiếu module native, mà Metro lại chuyển lỗi lúc nạp thành lỗi
 * toàn cục (ErrorUtils.reportFatalError) — bọc try/catch quanh require không chặn
 * được, app sẽ hiện màn hình đỏ dù đã có phương án dự phòng.
 */
export function loadLiveKit() {
  if (livekitCache !== undefined) return livekitCache;
  // Đây đúng là điều kiện mà chính thư viện WebRTC dùng để quyết định chạy được hay không.
  if (!NativeModules.WebRTCModule) {
    livekitCache = null;
    return null;
  }
  try {
    const livekit = require("@livekit/react-native");
    // Phải đăng ký polyfill trước khi đụng tới livekit-client.
    livekit.registerGlobals();
    const client = require("livekit-client");
    livekitCache = {
      ...livekit,
      Track: client.Track,
      RoomEvent: client.RoomEvent,
      ConnectionState: client.ConnectionState,
      DisconnectReason: client.DisconnectReason
    };
  } catch {
    livekitCache = null;
  }
  return livekitCache;
}

/** App có chạy được video native hay không (false khi đang chạy trên Expo Go). */
export function hasNativeVideo() {
  return loadLiveKit() !== null;
}

let videoKit;

/**
 * Trả về bộ component phòng video { LiveRoom, Stage, MiniBar }, hoặc null nếu
 * máy không có module native.
 *
 * - LiveRoom giữ kết nối LiveKit và phát tiếng; phải bọc NGOÀI toàn bộ màn hình
 *   phòng họp để chuyển tab (chat, tài liệu, biểu quyết...) không làm rớt kết nối.
 * - Stage là khung video đầy đủ ở tab Phòng họp.
 * - MiniBar là thanh gọn hiện ở các tab khác: vẫn nghe được và bật/tắt micro.
 *
 * Component được dựng muộn (lazy) vì nó dùng hook của LiveKit — không thể import
 * tĩnh ở đầu file, nếu không Expo Go sẽ vỡ ngay lúc nạp bundle.
 */
export function getVideoKit() {
  const livekit = loadLiveKit();
  if (!livekit) return null;
  if (!videoKit) videoKit = buildVideoKit(livekit);
  return videoKit;
}

/** Android phải xin quyền lúc chạy trước khi bật micro / camera. */
async function ensurePermission(kind) {
  if (Platform.OS !== "android") return true;
  const permission =
    kind === "mic"
      ? PermissionsAndroid.PERMISSIONS.RECORD_AUDIO
      : PermissionsAndroid.PERMISSIONS.CAMERA;
  try {
    const result = await PermissionsAndroid.request(permission);
    return result === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

function initials(value) {
  return String(value || "?")
    .trim()
    .split(/\s+/)
    .slice(-1)[0]
    .slice(0, 1)
    .toUpperCase();
}

function buildVideoKit(livekit) {
  const {
    AudioSession,
    ConnectionState,
    DisconnectReason,
    LiveKitRoom,
    RoomEvent,
    Track,
    VideoTrack,
    isTrackReference,
    useConnectionState,
    useRoomContext,
    useTracks
  } = livekit;

  const ROOM_OPTIONS = { adaptiveStream: true, dynacast: true };
  const MAX_AUTO_RETRY = 3;

  // Rớt vì những lý do này thì KHÔNG tự nối lại: người dùng chủ động rời, bị
  // chủ tọa mời ra, phòng đã đóng, hoặc cùng tài khoản vừa vào ở thiết bị khác
  // (tự nối lại lúc đó sẽ đá qua đá lại giữa hai thiết bị).
  const NO_RETRY_MESSAGES = {
    [DisconnectReason.CLIENT_INITIATED]: null,
    [DisconnectReason.DUPLICATE_IDENTITY]:
      "Tài khoản này vừa vào phòng video ở một thiết bị khác.",
    [DisconnectReason.PARTICIPANT_REMOVED]: "Bạn đã được mời ra khỏi phòng video.",
    [DisconnectReason.ROOM_DELETED]: "Phòng video đã đóng.",
    [DisconnectReason.ROOM_CLOSED]: "Phòng video đã đóng."
  };

  // serverUrl / token mới nhất và trạng thái rớt kết nối, dùng chung cho các
  // component nằm trong LiveRoom.
  const LiveRoomContext = createContext(null);

  // Camera trước/sau phải nhớ theo phòng chứ không theo component: chuyển tab là
  // Stage bị gỡ ra rồi gắn lại.
  const facingByRoom = new WeakMap();

  function useReconnect() {
    const room = useRoomContext();
    const { serverUrl, token, setLost } = useContext(LiveRoomContext);
    return useCallback(() => {
      setLost(null);
      room.connect(serverUrl, token).catch((error) =>
        setLost({ auto: true, message: error?.message || "Không kết nối được máy chủ video" })
      );
    }, [room, serverUrl, token, setLost]);
  }

  /**
   * Theo dõi kết nối: rớt mạng thì tự nối lại vài lần (sau khi LiveKit đã tự thử
   * mà không được), rớt vì lý do chủ động thì chỉ báo cho người dùng biết.
   */
  function RoomKeeper() {
    const room = useRoomContext();
    const { lost, setLost } = useContext(LiveRoomContext);
    const reconnect = useReconnect();
    const retries = useRef(0);

    useEffect(() => {
      function onConnected() {
        retries.current = 0;
        setLost(null);
      }
      function onDisconnected(reason) {
        if (reason in NO_RETRY_MESSAGES) {
          const message = NO_RETRY_MESSAGES[reason];
          if (message) setLost({ auto: false, message });
          return;
        }
        setLost({ auto: true, message: "Mất kết nối phòng video" });
      }
      room.on(RoomEvent.Connected, onConnected);
      room.on(RoomEvent.Disconnected, onDisconnected);
      return () => {
        room.off(RoomEvent.Connected, onConnected);
        room.off(RoomEvent.Disconnected, onDisconnected);
      };
    }, [room, setLost]);

    useEffect(() => {
      if (!lost?.auto || retries.current >= MAX_AUTO_RETRY) return undefined;
      const timer = setTimeout(() => {
        retries.current += 1;
        reconnect();
      }, 3000);
      return () => clearTimeout(timer);
    }, [lost, reconnect]);

    return null;
  }

  /**
   * Bật micro khi người được mời phát biểu bấm "Bật micro" trong hộp thoại.
   *
   * Không bao giờ tự bật: chủ tọa chỉ cấp quyền nói, người dùng tự quyết có mở
   * micro hay không. Lời mời và cú bấm có thể tới trước khi máy chủ video đẩy
   * quyền phát xuống, nên phải chờ quyền về rồi mới bật — bật sớm hơn là LiveKit
   * từ chối vì vé cũ vẫn ghi "không được phát".
   */
  function MicOnRequest({ request, canSpeak, onError }) {
    const room = useRoomContext();
    const handled = useRef(0);

    useEffect(() => {
      if (!request || handled.current === request) return undefined;
      let cancelled = false;

      async function tryEnable() {
        const me = room.localParticipant;
        if (cancelled || handled.current === request) return;
        if (room.state !== ConnectionState.Connected) return;
        if (!canSpeak || me.permissions?.canPublish === false) return;
        handled.current = request;
        if (me.isMicrophoneEnabled) return;
        if (!(await ensurePermission("mic"))) {
          onError?.("Bạn chưa cho phép ứng dụng dùng micro");
          return;
        }
        try {
          await me.setMicrophoneEnabled(true);
        } catch (error) {
          onError?.(error?.message || "Không bật được micro");
        }
      }

      tryEnable();
      const events = [RoomEvent.Connected, RoomEvent.ParticipantPermissionsChanged];
      events.forEach((event) => room.on(event, tryEnable));
      return () => {
        cancelled = true;
        events.forEach((event) => room.off(event, tryEnable));
      };
    }, [room, request, canSpeak, onError]);

    return null;
  }

  /**
   * Giữ kết nối phòng video và phát tiếng cho mọi thứ nằm bên trong.
   *
   * `micRequest` tăng lên mỗi lần người dùng đồng ý bật micro sau lời mời phát biểu.
   */
  function LiveRoom({ serverUrl, token, canSpeak = true, micRequest = 0, onError, children }) {
    const [lost, setLost] = useState(null);
    const onErrorRef = useRef(onError);
    onErrorRef.current = onError;

    // Android cần phiên âm thanh riêng cho cuộc gọi, nếu không tiếng sẽ ra loa
    // sai chế độ và micro bị các app khác chiếm.
    useEffect(() => {
      AudioSession.startAudioSession().catch(() => {});
      return () => {
        AudioSession.stopAudioSession().catch(() => {});
      };
    }, []);

    // Hàm phải cố định: LiveKitRoom kết nối lại mỗi khi prop onError đổi.
    const reportError = useCallback((message) => onErrorRef.current?.(message), []);
    const handleError = useCallback((error) => {
      const message = error?.message || "Không kết nối được máy chủ video (LiveKit)";
      setLost({ auto: true, message });
      onErrorRef.current?.(message);
    }, []);

    const context = useMemo(
      () => ({ serverUrl, token, lost, setLost }),
      [serverUrl, token, lost]
    );

    return (
      <LiveRoomContext.Provider value={context}>
        <LiveKitRoom
          serverUrl={serverUrl}
          token={token}
          connect
          audio={false}
          video={false}
          options={ROOM_OPTIONS}
          onError={handleError}
        >
          <RoomKeeper />
          <MicOnRequest request={micRequest} canSpeak={canSpeak} onError={reportError} />
          {children}
        </LiveKitRoom>
      </LiveRoomContext.Provider>
    );
  }

  /**
   * Trạng thái micro / camera / màn hình của chính mình và các thao tác bật tắt.
   * Stage và MiniBar dùng chung, nên nút ở đâu cũng phản ánh đúng thiết bị thật,
   * kể cả khi bị tắt từ nơi khác (chủ tọa thu quyền, hệ điều hành thu hồi).
   */
  function useLocalMedia(onError) {
    const room = useRoomContext();
    const [media, setMedia] = useState({ mic: false, camera: false, screen: false });
    const [busy, setBusy] = useState(false);

    useEffect(() => {
      function sync() {
        const me = room.localParticipant;
        setMedia({
          mic: me.isMicrophoneEnabled,
          camera: me.isCameraEnabled,
          screen: me.isScreenShareEnabled
        });
      }
      sync();
      const events = [
        RoomEvent.Connected,
        RoomEvent.Disconnected,
        RoomEvent.LocalTrackPublished,
        RoomEvent.LocalTrackUnpublished,
        RoomEvent.TrackMuted,
        RoomEvent.TrackUnmuted
      ];
      events.forEach((event) => room.on(event, sync));
      return () => events.forEach((event) => room.off(event, sync));
    }, [room]);

    async function guard(action, failure) {
      if (busy) return;
      setBusy(true);
      try {
        await action();
      } catch (error) {
        onError?.(error?.message || failure);
      } finally {
        setBusy(false);
      }
    }

    const toggleMic = () =>
      guard(async () => {
        if (!media.mic && !(await ensurePermission("mic"))) {
          throw new Error("Bạn chưa cho phép ứng dụng dùng micro");
        }
        await room.localParticipant.setMicrophoneEnabled(!media.mic);
      }, "Không bật được micro");

    const toggleCamera = () =>
      guard(async () => {
        if (!media.camera && !(await ensurePermission("camera"))) {
          throw new Error("Bạn chưa cho phép ứng dụng dùng camera");
        }
        await room.localParticipant.setCameraEnabled(!media.camera);
      }, "Không bật được camera");

    const flipCamera = () =>
      guard(async () => {
        const next = (facingByRoom.get(room) || "user") === "user" ? "environment" : "user";
        const track = room.localParticipant.getTrackPublication(Track.Source.Camera)?.track;
        if (!track) throw new Error("Hãy bật camera trước khi đổi ống kính");
        await track.restartTrack({ facingMode: next });
        facingByRoom.set(room, next);
      }, "Không đổi được camera trước/sau");

    const toggleScreen = () =>
      guard(
        () => room.localParticipant.setScreenShareEnabled(!media.screen),
        "Không chia sẻ được màn hình"
      );

    return { room, media, busy, toggleMic, toggleCamera, flipCamera, toggleScreen };
  }

  /** Dòng trạng thái khi chưa kết nối xong, đang nối lại hoặc đã rớt hẳn. */
  function ConnectionNotice({ compact }) {
    const connection = useConnectionState();
    const { lost } = useContext(LiveRoomContext);
    const reconnect = useReconnect();
    if (connection === ConnectionState.Connected) return null;

    const reconnecting =
      connection === ConnectionState.Reconnecting ||
      connection === ConnectionState.SignalReconnecting;
    const dropped = connection === ConnectionState.Disconnected && lost;
    const text = reconnecting
      ? "Mạng chập chờn, đang nối lại..."
      : dropped
        ? lost.message
        : "Đang kết nối phòng video...";

    return (
      <View style={styles.connecting}>
        {dropped ? (
          <Ionicons name="cloud-offline-outline" size={16} color="#ffc9bf" />
        ) : (
          <ActivityIndicator color="#ffffff" size="small" />
        )}
        <Text style={styles.connectingText} numberOfLines={compact ? 1 : 2}>
          {text}
        </Text>
        {dropped && (
          <Pressable onPress={reconnect} style={styles.retry} accessibilityRole="button">
            <Text style={styles.retryText}>Kết nối lại</Text>
          </Pressable>
        )}
      </View>
    );
  }

  function Tile({ trackRef, localIdentity, wide }) {
    const participant = trackRef?.participant;
    const isScreen = trackRef?.source === Track.Source.ScreenShare;
    const isLocal = participant?.identity === localIdentity;
    const name = participant?.name || participant?.identity || "Người tham dự";
    const hasVideo = isTrackReference(trackRef) && !trackRef.publication?.isMuted;

    return (
      <View style={[styles.tile, wide && styles.tileWide]}>
        {hasVideo ? (
          <VideoTrack
            trackRef={trackRef}
            style={styles.video}
            objectFit={isScreen ? "contain" : "cover"}
            mirror={isLocal && !isScreen}
          />
        ) : (
          <View style={styles.tilePlaceholder}>
            <View style={styles.tileAvatar}>
              <Text style={styles.tileAvatarText}>{initials(name)}</Text>
            </View>
          </View>
        )}
        <View style={styles.tileFooter}>
          <Ionicons
            name={participant?.isMicrophoneEnabled ? "mic" : "mic-off"}
            size={11}
            color={participant?.isMicrophoneEnabled ? "#d6f5e2" : "#ffc9bf"}
          />
          <Text style={styles.tileName} numberOfLines={1}>
            {isScreen ? `${name} · màn hình` : name}
            {isLocal ? " (bạn)" : ""}
          </Text>
        </View>
      </View>
    );
  }

  function ControlButton({ icon, label, active, danger, disabled, onPress }) {
    return (
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected: Boolean(active), disabled: Boolean(disabled) }}
        style={[
          styles.control,
          active && styles.controlActive,
          danger && styles.controlDanger,
          disabled && styles.controlDisabled
        ]}
      >
        <Ionicons
          name={icon}
          size={19}
          color={danger || active ? "#ffffff" : "#d8eef4"}
        />
      </Pressable>
    );
  }

  /** Khung video đầy đủ ở tab Phòng họp. */
  function Stage({ canSpeak, canShareScreen, expanded, onToggleExpand, onError, onLeave }) {
    const { room, media, busy, toggleMic, toggleCamera, flipCamera, toggleScreen } =
      useLocalMedia(onError);
    const connection = useConnectionState();
    const tracks = useTracks(
      [
        { source: Track.Source.Camera, withPlaceholder: true },
        { source: Track.Source.ScreenShare, withPlaceholder: false }
      ],
      { onlySubscribed: false }
    );

    const screenTracks = tracks.filter((item) => item.source === Track.Source.ScreenShare);
    const cameraTracks = tracks.filter((item) => item.source !== Track.Source.ScreenShare);
    const localIdentity = room.localParticipant?.identity;
    const connected = connection === ConnectionState.Connected;

    return (
      <View style={[styles.stage, expanded && styles.stageExpanded]}>
        <ScrollView
          contentContainerStyle={styles.stageContent}
          showsVerticalScrollIndicator={false}
        >
          {screenTracks.map((item) => (
            <Tile
              key={`${item.participant?.identity}-screen`}
              trackRef={item}
              localIdentity={localIdentity}
              wide
            />
          ))}
          <View style={styles.tileGrid}>
            {cameraTracks.map((item) => (
              <Tile
                key={`${item.participant?.identity}-camera`}
                trackRef={item}
                localIdentity={localIdentity}
              />
            ))}
          </View>
          {cameraTracks.length === 0 && screenTracks.length === 0 && connected && (
            <Text style={styles.stageHint}>
              Chưa có ai mở camera. Bật camera hoặc micro để tham gia phát biểu.
            </Text>
          )}
        </ScrollView>

        <ConnectionNotice />

        <View style={styles.controlBar}>
          <ControlButton
            icon={media.mic ? "mic" : "mic-off"}
            label={media.mic ? "Tắt micro" : "Bật micro"}
            active={media.mic}
            disabled={!canSpeak || busy || !connected}
            onPress={toggleMic}
          />
          <ControlButton
            icon={media.camera ? "videocam" : "videocam-off"}
            label={media.camera ? "Tắt camera" : "Bật camera"}
            active={media.camera}
            disabled={!canSpeak || busy || !connected}
            onPress={toggleCamera}
          />
          <ControlButton
            icon="camera-reverse-outline"
            label="Đổi camera trước/sau"
            disabled={!media.camera || busy}
            onPress={flipCamera}
          />
          <ControlButton
            icon="phone-portrait-outline"
            label={media.screen ? "Dừng chia sẻ màn hình" : "Chia sẻ màn hình"}
            active={media.screen}
            disabled={!canShareScreen || busy || !connected}
            onPress={toggleScreen}
          />
          <ControlButton
            icon={expanded ? "contract-outline" : "expand-outline"}
            label={expanded ? "Thu nhỏ" : "Phóng to"}
            onPress={onToggleExpand}
          />
          {!!onLeave && (
            <ControlButton icon="exit-outline" label="Rời phòng họp" danger onPress={onLeave} />
          )}
        </View>

        {!canSpeak && (
          <Text style={styles.stageNotice}>
            Chủ tọa chưa cấp quyền phát biểu — bạn vẫn xem và nghe được cuộc họp.
          </Text>
        )}
      </View>
    );
  }

  /**
   * Thanh gọn ở các tab ngoài Phòng họp: vẫn đang nghe cuộc họp, bật/tắt micro
   * được ngay, chạm "Xem video" để quay về khung video.
   */
  function MiniBar({ canSpeak, onOpen, onError }) {
    const { room, media, busy, toggleMic } = useLocalMedia(onError);
    const connection = useConnectionState();
    const [count, setCount] = useState(room.remoteParticipants.size + 1);

    useEffect(() => {
      const sync = () => setCount(room.remoteParticipants.size + 1);
      sync();
      const events = [
        RoomEvent.Connected,
        RoomEvent.ParticipantConnected,
        RoomEvent.ParticipantDisconnected
      ];
      events.forEach((event) => room.on(event, sync));
      return () => events.forEach((event) => room.off(event, sync));
    }, [room]);

    const connected = connection === ConnectionState.Connected;

    return (
      <View style={styles.miniBar}>
        {connected ? (
          <View style={styles.miniInfo}>
            <View style={styles.liveDot} />
            <Text style={styles.miniText} numberOfLines={1}>
              Đang nghe phòng họp · {count} người
            </Text>
          </View>
        ) : (
          <View style={styles.miniInfo}>
            <ConnectionNotice compact />
          </View>
        )}
        <ControlButton
          icon={media.mic ? "mic" : "mic-off"}
          label={media.mic ? "Tắt micro" : "Bật micro"}
          active={media.mic}
          disabled={!canSpeak || busy || !connected}
          onPress={toggleMic}
        />
        <ControlButton icon="videocam-outline" label="Xem video" onPress={onOpen} />
      </View>
    );
  }

  return { LiveRoom, Stage, MiniBar };
}

const styles = StyleSheet.create({
  stage: {
    backgroundColor: "#0b2733",
    borderRadius: radii.lg,
    gap: spacing.sm,
    overflow: "hidden",
    padding: spacing.sm,
    ...shadow(2)
  },
  stageExpanded: {
    flex: 1
  },
  stageContent: {
    gap: spacing.xs,
    minHeight: 170
  },
  tileGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs
  },
  tile: {
    backgroundColor: "#12323f",
    borderRadius: radii.md,
    flexGrow: 1,
    height: 132,
    minWidth: "48%",
    overflow: "hidden"
  },
  tileWide: {
    height: 210,
    minWidth: "100%"
  },
  video: {
    flex: 1
  },
  tilePlaceholder: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center"
  },
  tileAvatar: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radii.full,
    height: 44,
    justifyContent: "center",
    width: 44
  },
  tileAvatarText: {
    color: colors.onPrimary,
    fontSize: 17,
    fontWeight: "800"
  },
  tileFooter: {
    alignItems: "center",
    backgroundColor: "rgba(5, 22, 30, 0.74)",
    bottom: 0,
    flexDirection: "row",
    gap: 4,
    left: 0,
    paddingHorizontal: 7,
    paddingVertical: 4,
    position: "absolute",
    right: 0
  },
  tileName: {
    color: "#eaf6f9",
    flex: 1,
    fontSize: 11,
    fontWeight: "700"
  },
  stageHint: {
    color: "#9fc4d0",
    fontSize: 12.5,
    fontWeight: "600",
    padding: spacing.md,
    textAlign: "center"
  },
  connecting: {
    alignItems: "center",
    flexDirection: "row",
    flexShrink: 1,
    gap: spacing.xs,
    justifyContent: "center"
  },
  connectingText: {
    color: "#cfe7ef",
    flexShrink: 1,
    fontSize: 12.5,
    fontWeight: "700"
  },
  retry: {
    backgroundColor: colors.primary,
    borderRadius: radii.full,
    paddingHorizontal: 12,
    paddingVertical: 6
  },
  retryText: {
    color: colors.onPrimary,
    fontSize: 12,
    fontWeight: "800"
  },
  miniBar: {
    alignItems: "center",
    backgroundColor: "#0b2733",
    flexDirection: "row",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs
  },
  miniInfo: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 8
  },
  liveDot: {
    backgroundColor: "#35d07f",
    borderRadius: radii.full,
    height: 9,
    width: 9
  },
  miniText: {
    color: "#eaf6f9",
    flexShrink: 1,
    fontSize: 12.5,
    fontWeight: "700"
  },
  controlBar: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    justifyContent: "center"
  },
  control: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    borderRadius: radii.full,
    height: 44,
    justifyContent: "center",
    width: 44
  },
  controlActive: {
    backgroundColor: colors.primary
  },
  controlDanger: {
    backgroundColor: colors.danger
  },
  controlDisabled: {
    opacity: 0.4
  },
  stageNotice: {
    color: "#9fc4d0",
    fontSize: 11.5,
    fontWeight: "600",
    textAlign: "center"
  }
});
