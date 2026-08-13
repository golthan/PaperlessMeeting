import {
  CalendarDays,
  CheckSquare,
  DoorOpen,
  LayoutDashboard,
  LogOut,
  Menu,
  Network,
  Users
} from "lucide-react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";

const navByRole = {
  ADMIN: [
    ["Dashboard", "/admin/dashboard", LayoutDashboard],
    ["Người dùng", "/admin/users", Users],
    ["Phòng ban", "/admin/departments", Network],
    ["Phòng họp", "/admin/rooms", DoorOpen],
    ["Cuộc họp", "/admin/meetings", CalendarDays]
  ],
  ORGANIZER: [
    ["Dashboard", "/organizer/dashboard", LayoutDashboard],
    ["Cuộc họp", "/organizer/meetings", CalendarDays]
  ],
  PARTICIPANT: [
    ["Dashboard", "/participant/dashboard", LayoutDashboard],
    ["Cuộc họp", "/participant/meetings", CalendarDays],
    ["Nhiệm vụ", "/participant/tasks", CheckSquare]
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
  if (pathname.includes("users")) return "Quản lý người dùng";
  if (pathname.includes("departments")) return "Quản lý phòng ban";
  if (pathname.includes("rooms")) return "Quản lý phòng họp";
  if (pathname.includes("meetings")) return "Quản lý cuộc họp";
  if (pathname.includes("tasks")) return "Nhiệm vụ của tôi";
  return "Dashboard";
}

export function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const items = navByRole[user?.role] || [];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">PM</div>
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
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div>
            <div className="mobile-menu">
              <Menu size={18} />
              <span>Paperless Meeting</span>
            </div>
            <h1>{pageTitle(location.pathname)}</h1>
            <p>{roleLabel[user?.role] || user?.role}</p>
          </div>
          <div className="topbar-user">
            <div className="avatar">{initials(user)}</div>
            <div className="topbar-identity">
              <strong>{user?.full_name || user?.email}</strong>
              <span>{user?.email}</span>
            </div>
            <button className="ghost-button" onClick={logout}>
              <LogOut size={16} />
              Đăng xuất
            </button>
          </div>
        </header>
        <Outlet />
      </main>
    </div>
  );
}

