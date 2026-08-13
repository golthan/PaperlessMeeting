import { Inbox } from "lucide-react";

export function EmptyState({
  title = "Chưa có dữ liệu",
  description,
  icon: Icon = Inbox,
  action
}) {
  return (
    <div className="empty-state">
      <span className="empty-state-icon">
        <Icon size={22} />
      </span>
      <strong>{title}</strong>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}
