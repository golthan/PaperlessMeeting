import { useMemo } from "react";
import { useLocation } from "react-router-dom";
import { LiveKitRoom, VideoConference } from "@livekit/components-react";
import "@livekit/components-styles";
import { defaultLivekitUrl } from "./LiveMeetingPage.jsx";
import { EmptyState } from "../../components/EmptyState.jsx";

export function JoinRoomPage() {
  const location = useLocation();
  const { token, serverUrl } = useMemo(() => {
    const params = new URLSearchParams(location.hash.replace(/^#/, ""));
    return {
      token: params.get("token") || "",
      serverUrl: params.get("url") || defaultLivekitUrl()
    };
  }, [location.hash]);

  if (!token) {
    return (
      <div className="join-room-page">
        <EmptyState title="Link phòng họp không hợp lệ hoặc đã hết hạn. Hãy mở lại từ ứng dụng." />
      </div>
    );
  }

  return (
    <div className="join-room-page">
      <LiveKitRoom
        token={token}
        serverUrl={serverUrl}
        connect
        audio={false}
        video={false}
        data-lk-theme="default"
        style={{ height: "100%" }}
      >
        <VideoConference />
      </LiveKitRoom>
    </div>
  );
}
