import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { API_URL } from "./api";

/** Máy chủ socket nằm cùng host với API, chỉ bỏ hậu tố /api. */
export function socketOrigin() {
  return API_URL.replace(/\/api\/?$/, "");
}

let sharedSocket = null;
let sharedToken = null;

/**
 * Cả app dùng chung MỘT kết nối tới namespace /meeting.
 *
 * Máy chủ tự cho socket vào phòng riêng `user:<id>` ngay khi kết nối nên cùng
 * một đường truyền vừa nhận thông báo cá nhân, vừa phục vụ phòng họp đang mở.
 * Mở nhiều kết nối sẽ làm bản ghi meeting_sessions và trạng thái online bị nhân đôi.
 */
export function getSharedSocket(token) {
  if (!token) return null;
  if (sharedSocket && sharedToken === token) return sharedSocket;
  closeSharedSocket();
  sharedToken = token;
  sharedSocket = io(`${socketOrigin()}/meeting`, {
    auth: { token },
    // React Native không có XHR polling ổn định như trình duyệt: đi thẳng websocket.
    transports: ["websocket"],
    reconnection: true,
    reconnectionDelay: 1500,
    reconnectionDelayMax: 8000,
    timeout: 12000
  });
  return sharedSocket;
}

export function closeSharedSocket() {
  if (sharedSocket) {
    sharedSocket.removeAllListeners();
    sharedSocket.disconnect();
  }
  sharedSocket = null;
  sharedToken = null;
}

/** Kết nối socket theo phiên đăng nhập và cho biết đang online hay mất kết nối. */
export function useSocket(token) {
  const [socket, setSocket] = useState(null);
  const [status, setStatus] = useState("connecting");

  useEffect(() => {
    if (!token) {
      closeSharedSocket();
      setSocket(null);
      setStatus("offline");
      return undefined;
    }

    const instance = getSharedSocket(token);
    setSocket(instance);
    setStatus(instance.connected ? "online" : "connecting");

    const onConnect = () => setStatus("online");
    const onDisconnect = () => setStatus("offline");
    const onError = () => setStatus("offline");

    instance.on("connect", onConnect);
    instance.on("disconnect", onDisconnect);
    instance.on("connect_error", onError);

    return () => {
      instance.off("connect", onConnect);
      instance.off("disconnect", onDisconnect);
      instance.off("connect_error", onError);
    };
  }, [token]);

  return { socket, status };
}

/**
 * Đăng ký nhiều sự kiện socket cùng lúc.
 *
 * Handler được giữ trong ref nên component tự do tạo hàm mới mỗi lần render mà
 * không phải gỡ / gắn lại listener. Đổi lại, DANH SÁCH TÊN sự kiện phải cố định
 * giữa các lần render (chỉ nội dung hàm được phép đổi).
 */
export function useSocketEvents(socket, handlers) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!socket) return undefined;
    const bound = Object.keys(handlersRef.current).map((event) => {
      const listener = (...args) => handlersRef.current[event]?.(...args);
      socket.on(event, listener);
      return [event, listener];
    });
    return () => bound.forEach(([event, listener]) => socket.off(event, listener));
  }, [socket]);
}

/**
 * Vào / rời phòng realtime của một cuộc họp.
 *
 * Máy chủ quên thành viên phòng sau mỗi lần mất kết nối nên phải vào lại mỗi khi
 * socket "connect" chứ không chỉ một lần lúc mở màn hình.
 */
export function useMeetingRoom(socket, meetingId, options = {}) {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    if (!socket || !meetingId) return undefined;
    let active = true;

    function join() {
      socket.emit("join_meeting_room", { meetingId }, (reply) => {
        if (!active) return;
        if (reply?.ok) optionsRef.current.onJoined?.(reply);
        else optionsRef.current.onError?.(reply?.message || "Không vào được phòng họp realtime");
      });
    }

    if (socket.connected) join();
    socket.on("connect", join);

    return () => {
      active = false;
      socket.off("connect", join);
      if (socket.connected) socket.emit("leave_meeting_room", { meetingId });
    };
  }, [socket, meetingId]);
}
