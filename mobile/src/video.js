import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
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
      ConnectionState: client.ConnectionState
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

let videoRoomComponent;

/**
 * Trả về component phòng video, hoặc null nếu máy không có module native.
 *
 * Component được dựng muộn (lazy) vì nó dùng hook của LiveKit — không thể import
 * tĩnh ở đầu file, nếu không Expo Go sẽ vỡ ngay lúc nạp bundle.
 */
export function getVideoRoom() {
  const livekit = loadLiveKit();
  if (!livekit) return null;
  if (!videoRoomComponent) videoRoomComponent = buildVideoRoom(livekit);
  return videoRoomComponent;
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

function buildVideoRoom(livekit) {
  const {
    AudioSession,
    ConnectionState,
    LiveKitRoom,
    RoomEvent,
    Track,
    VideoTrack,
    isTrackReference,
    useConnectionState,
    useRoomContext,
    useTracks
  } = livekit;

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

  function Stage({ canSpeak, canShareScreen, expanded, onToggleExpand, onError, onLeave }) {
    const room = useRoomContext();
    const connection = useConnectionState();
    const tracks = useTracks(
      [
        { source: Track.Source.Camera, withPlaceholder: true },
        { source: Track.Source.ScreenShare, withPlaceholder: false }
      ],
      { onlySubscribed: false }
    );
    const [media, setMedia] = useState({ mic: false, camera: false, screen: false });
    const [facing, setFacing] = useState("user");
    const [busy, setBusy] = useState(false);

    // Nút bấm phải phản ánh đúng trạng thái thật của thiết bị, kể cả khi
    // micro/camera bị tắt từ nơi khác (chủ tọa thu quyền, hệ điều hành thu hồi).
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
        const next = facing === "user" ? "environment" : "user";
        const track = room.localParticipant.getTrackPublication(Track.Source.Camera)?.track;
        if (!track) throw new Error("Hãy bật camera trước khi đổi ống kính");
        await track.restartTrack({ facingMode: next });
        setFacing(next);
      }, "Không đổi được camera trước/sau");

    const toggleScreen = () =>
      guard(
        () => room.localParticipant.setScreenShareEnabled(!media.screen),
        "Không chia sẻ được màn hình"
      );

    const screenTracks = tracks.filter((item) => item.source === Track.Source.ScreenShare);
    const cameraTracks = tracks.filter((item) => item.source !== Track.Source.ScreenShare);
    const localIdentity = room.localParticipant?.identity;
    const connecting = connection !== ConnectionState.Connected;

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
          {cameraTracks.length === 0 && screenTracks.length === 0 && !connecting && (
            <Text style={styles.stageHint}>
              Chưa có ai mở camera. Bật camera hoặc micro để tham gia phát biểu.
            </Text>
          )}
        </ScrollView>

        {connecting && (
          <View style={styles.connecting}>
            <ActivityIndicator color="#ffffff" />
            <Text style={styles.connectingText}>Đang kết nối phòng video...</Text>
          </View>
        )}

        <View style={styles.controlBar}>
          <ControlButton
            icon={media.mic ? "mic" : "mic-off"}
            label={media.mic ? "Tắt micro" : "Bật micro"}
            active={media.mic}
            disabled={!canSpeak || busy}
            onPress={toggleMic}
          />
          <ControlButton
            icon={media.camera ? "videocam" : "videocam-off"}
            label={media.camera ? "Tắt camera" : "Bật camera"}
            active={media.camera}
            disabled={!canSpeak || busy}
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
            disabled={!canShareScreen || busy}
            onPress={toggleScreen}
          />
          <ControlButton
            icon={expanded ? "contract-outline" : "expand-outline"}
            label={expanded ? "Thu nhỏ" : "Phóng to"}
            onPress={onToggleExpand}
          />
          {!!onLeave && (
            <ControlButton icon="exit-outline" label="Rời phòng video" danger onPress={onLeave} />
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

  return function VideoRoom({
    serverUrl,
    token,
    canSpeak = true,
    canShareScreen = false,
    expanded,
    onToggleExpand,
    onError,
    onLeave
  }) {
    // Android cần phiên âm thanh riêng cho cuộc gọi, nếu không tiếng sẽ ra loa
    // ngoài sai chế độ và micro bị các app khác chiếm.
    useEffect(() => {
      AudioSession.startAudioSession().catch(() => {});
      return () => {
        AudioSession.stopAudioSession().catch(() => {});
      };
    }, []);

    return (
      <LiveKitRoom
        serverUrl={serverUrl}
        token={token}
        connect
        audio={false}
        video={false}
        options={{ adaptiveStream: true, dynacast: true }}
        onError={(error) =>
          onError?.(error?.message || "Không kết nối được máy chủ video (LiveKit)")
        }
      >
        <Stage
          canSpeak={canSpeak}
          canShareScreen={canShareScreen}
          expanded={expanded}
          onToggleExpand={onToggleExpand}
          onError={onError}
          onLeave={onLeave}
        />
      </LiveKitRoom>
    );
  };
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
    gap: spacing.xs,
    justifyContent: "center"
  },
  connectingText: {
    color: "#cfe7ef",
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
