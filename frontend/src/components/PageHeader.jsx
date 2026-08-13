import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

/**
 * Đầu trang dùng chung: nút quay lại + tiêu đề + vùng hành động bên phải.
 * Mọi màn hình con (chi tiết, phòng Live, thông báo...) đều phải có nút quay lại.
 */
export function PageHeader({
  eyebrow,
  title,
  subtitle,
  backTo,
  backLabel = "Quay lại",
  onBack,
  actions,
  children
}) {
  const navigate = useNavigate();

  function goBack() {
    if (onBack) return onBack();
    if (backTo) return navigate(backTo);
    return navigate(-1);
  }

  return (
    <header className="page-header">
      <div className="page-header-left">
        <button type="button" className="back-button" onClick={goBack}>
          <ArrowLeft size={16} />
          <span>{backLabel}</span>
        </button>
        <div className="page-header-text">
          {eyebrow && <span className="eyebrow">{eyebrow}</span>}
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
      </div>
      {(actions || children) && <div className="page-header-actions">{actions || children}</div>}
    </header>
  );
}
