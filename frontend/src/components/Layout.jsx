import {
  Bell,
  CalendarDays,
  CheckSquare,
  DoorOpen,
  LayoutDashboard,
  LogOut,
  Menu,
  Network,
  ScrollText,
  Users,
  X
} from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";
import { useNotifications } from "../notifications/NotificationContext.jsx";
import { NotificationBell } from "./NotificationBell.jsx";
import brandLogo from "../assets/logo-hvktmm.png";

const navByRole = {
  ADMIN: [
    ["Dashboard", "/admin/dashboard", LayoutDashboard],
    ["Người dùng", "/admin/users", Users],
    ["Phòng ban", "/admin/departments", Network],
    ["Phòng họp", "/admin/rooms", DoorOpen],
    ["Cuộc họp", "/admin/meetings", CalendarDays],
    ["Nhật ký truy vết", "/admin/audit-logs", ScrollText],
    ["Thông báo", "/admin/notifications", Bell]
  ],
  ORGANIZER: [
    ["Dashboard", "/organizer/dashboard", LayoutDashboard],
    ["Cuộc họp", "/organizer/meetings", CalendarDays],
    ["Thông báo", "/organizer/notifications", Bell]
  ],
  PARTICIPANT: [
    ["Dashboard", "/participant/dashboard", LayoutDashboard],
    ["Cuộc họp", "/participant/meetings", CalendarDays],
    ["Nhiệm vụ", "/participant/tasks", CheckSquare],
    ["Thông báo", "/participant/notifications", Bell]
  ]
};

const roleLabel = {
  ADMIN: "Quản trị viên",
  ORGANIZER: "Người tổ chức",
  PARTICIPANT: "Người tham dự"
};

function initials(user) {
  const source = user?.full_name || user?.email || "?";
  return source
    .trim()
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}

function pageTitle(pathname) {
  if (pathname.includes("notifications")) return "Thông báo";
  if (pathname.includes("users")) return "Quản lý người dùng";
  if (pathname.includes("departments")) return "Quản lý phòng ban";
  if (pathname.includes("rooms")) return "Quản lý phòng họp";
  if (pathname.includes("/live")) return "Phòng họp trực tuyến";
  if (pathname.includes("meetings")) return "Quản lý cuộc họp";
  if (pathname.includes("tasks")) return "Nhiệm vụ của tôi";
  return "Dashboard";
}

export function Layout() {
  const { user, logout } = useAuth();
  const { unread } = useNotifications();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const items = navByRole[user?.role] || [];

  // Đổi trang thì luôn đóng menu điều hướng trên màn hình hẹp.
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  return (
    <div className={`app-shell${menuOpen ? " nav-open" : ""}`}>
      <aside className="sidebar">
        <div className="brand">
          <img className="brand-mark" src={brandLogo} alt="Logo Học viện" />
          <div>
            <strong>Paperless Meeting</strong>
            <span>{roleLabel[user?.role] || user?.role}</span>
          </div>
        </div>
        <nav className="nav-list">
          {items.map(([label, href, Icon]) => (
            <NavLink
              key={href}
              to={href}
              className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")}
            >
              <Icon size={18} />
              <span>{label}</span>
              {href.endsWith("/notifications") && unread > 0 && (
                <em className="nav-badge">{unread > 99 ? "99+" : unread}</em>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <p>Hệ thống phòng họp không giấy tờ</p>
          <span>Phiên bản đồ án tốt nghiệp</span>
        </div>
      </aside>

      <div
        className="nav-scrim"
        role="presentation"
        onClick={() => setMenuOpen(false)}
      />

      <main className="main-panel">
        <header className="topbar">
          <div className="topbar-left">
            <button
              type="button"
              className="mobile-menu"
              onClick={() => setMenuOpen((value) => !value)}
              aria-label={menuOpen ? "Đóng menu" : "Mở menu"}
            >
              {menuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
            <div>
              <h1>{pageTitle(location.pathname)}</h1>
              <p>{roleLabel[user?.role] || user?.role}</p>
            </div>
          </div>
          <div className="topbar-user">
            <NotificationBell />
            <div className="avatar">{initials(user)}</div>
            <div className="topbar-identity">
              <strong>{user?.full_name || user?.email}</strong>
              <span>{user?.email}</span>
            </div>
            <button className="ghost-button" onClick={logout}>
              <LogOut size={16} />
              <span>Đăng xuất</span>
            </button>
          </div>
        </header>
        <Outlet />
      </main>
    </div>
  );
}
