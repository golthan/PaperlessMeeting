import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Layout } from "./components/Layout.jsx";
import { useAuth, roleHome } from "./auth/AuthContext.jsx";
import { LoginPage } from "./pages/auth/LoginPage.jsx";
import { RegisterPage } from "./pages/auth/RegisterPage.jsx";
import { DashboardPage } from "./pages/DashboardPage.jsx";
import { DepartmentsPage } from "./pages/admin/DepartmentsPage.jsx";
import { RoomsPage } from "./pages/admin/RoomsPage.jsx";
import { UsersPage } from "./pages/admin/UsersPage.jsx";
import { MeetingsPage } from "./pages/meetings/MeetingsPage.jsx";
import { MeetingDetailPage } from "./pages/meetings/MeetingDetailPage.jsx";
import { LiveMeetingPage } from "./pages/meetings/LiveMeetingPage.jsx";
import { JoinRoomPage } from "./pages/meetings/JoinRoomPage.jsx";
import { MyTasksPage } from "./pages/participant/MyTasksPage.jsx";
import { NotificationsPage } from "./pages/NotificationsPage.jsx";
import { AuditLogPage } from "./pages/admin/AuditLogPage.jsx";
import { VerifyMinutesPage } from "./pages/VerifyMinutesPage.jsx";
import { ProfilePage } from "./pages/ProfilePage.jsx";

function ProtectedRoute({ roles, children }) {
  const { user, booting } = useAuth();
  const location = useLocation();

  if (booting) return <div className="boot-screen">Đang tải...</div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  if (roles && !roles.includes(user.role)) return <Navigate to={roleHome(user.role)} replace />;
  return children;
}

function RootRedirect() {
  const { user, booting } = useAuth();
  if (booting) return <div className="boot-screen">Đang tải...</div>;
  return <Navigate to={user ? roleHome(user.role) : "/login"} replace />;
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/join/:id" element={<JoinRoomPage />} />
      {/* Tra cuu bien ban bang ma QR: cong khai, khong can dang nhap. */}
      <Route path="/verify" element={<VerifyMinutesPage />} />
      <Route path="/verify/:code" element={<VerifyMinutesPage />} />

      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        {/* Hồ sơ cá nhân: vai trò nào đăng nhập cũng vào được. */}
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <ProfilePage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin/notifications"
          element={
            <ProtectedRoute roles={["ADMIN"]}>
              <NotificationsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/organizer/notifications"
          element={
            <ProtectedRoute roles={["ORGANIZER"]}>
              <NotificationsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/participant/notifications"
          element={
            <ProtectedRoute roles={["PARTICIPANT"]}>
              <NotificationsPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin/dashboard"
          element={
            <ProtectedRoute roles={["ADMIN"]}>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/users"
          element={
            <ProtectedRoute roles={["ADMIN"]}>
              <UsersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/departments"
          element={
            <ProtectedRoute roles={["ADMIN"]}>
              <DepartmentsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/audit-logs"
          element={
            <ProtectedRoute roles={["ADMIN"]}>
              <AuditLogPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/rooms"
          element={
            <ProtectedRoute roles={["ADMIN"]}>
              <RoomsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/meetings"
          element={
            <ProtectedRoute roles={["ADMIN"]}>
              <MeetingsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/meetings/:id"
          element={
            <ProtectedRoute roles={["ADMIN"]}>
              <MeetingDetailPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/organizer/dashboard"
          element={
            <ProtectedRoute roles={["ORGANIZER"]}>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/organizer/meetings"
          element={
            <ProtectedRoute roles={["ORGANIZER"]}>
              <MeetingsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/organizer/meetings/:id/live"
          element={
            <ProtectedRoute roles={["ORGANIZER"]}>
              <LiveMeetingPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/organizer/meetings/:id"
          element={
            <ProtectedRoute roles={["ORGANIZER"]}>
              <MeetingDetailPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/participant/dashboard"
          element={
            <ProtectedRoute roles={["PARTICIPANT"]}>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/participant/meetings"
          element={
            <ProtectedRoute roles={["PARTICIPANT"]}>
              <MeetingsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/participant/meetings/:id/live"
          element={
            <ProtectedRoute roles={["PARTICIPANT"]}>
              <LiveMeetingPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/participant/meetings/:id"
          element={
            <ProtectedRoute roles={["PARTICIPANT"]}>
              <MeetingDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/participant/tasks"
          element={
            <ProtectedRoute roles={["PARTICIPANT"]}>
              <MyTasksPage />
            </ProtectedRoute>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
