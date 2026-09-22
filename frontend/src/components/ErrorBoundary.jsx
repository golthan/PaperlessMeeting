import { Component } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

/**
 * Bắt lỗi render của cả một trang.
 *
 * React mặc định gỡ bỏ toàn bộ cây giao diện khi một component ném lỗi, để lại
 * màn hình trắng không nói gì — người dùng không biết chuyện gì xảy ra còn người
 * phát triển không biết tìm ở đâu. Lớp này giữ lại khung trang và in rõ lỗi.
 */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Vẫn ghi ra console để xem được stack đầy đủ khi cần.
    console.error("Lỗi hiển thị trang:", error, info?.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="page-stack">
        <section className="panel error-panel">
          <div className="error-panel-head">
            <span className="error-panel-icon">
              <AlertTriangle size={22} />
            </span>
            <div>
              <h2>Không hiển thị được trang này</h2>
              <p className="muted">
                Giao diện gặp lỗi khi dựng trang. Dữ liệu của bạn không bị ảnh hưởng.
              </p>
            </div>
          </div>

          <pre className="error-panel-detail">{String(error?.message || error)}</pre>

          <div className="row-actions start">
            <button
              className="primary-button"
              onClick={() => this.setState({ error: null })}
            >
              <RotateCcw size={16} />
              Thử lại
            </button>
            <button className="secondary-button" onClick={() => window.location.reload()}>
              Tải lại trang
            </button>
          </div>
        </section>
      </div>
    );
  }
}
