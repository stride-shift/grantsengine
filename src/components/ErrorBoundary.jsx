import { Component } from "react";

// Error boundary — prevents white screen on component crash
export default class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(err, info) { console.error("[ErrorBoundary]", err, info); }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, textAlign: "center", fontFamily: "Inter, system-ui, sans-serif" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: "#1a1a1a", marginBottom: 8 }}>Something went wrong</h2>
          <p style={{ fontSize: 13, color: "#666", marginBottom: 16 }}>{this.state.error?.message || "An unexpected error occurred"}</p>
          <button onClick={() => this.setState({ error: null })}
            style={{ padding: "8px 20px", fontSize: 13, background: "#4A7C59", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}>
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
