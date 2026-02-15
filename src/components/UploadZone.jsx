import { useState, useRef, useCallback } from "react";
import { C, FONT, MONO } from "../theme";
import { Btn, Label } from "./index";
import { uploadFile, addYouTubeUrl, deleteUpload as apiDeleteUpload } from "../api";

const typeIcon = (mime) => {
  if (mime === 'video/youtube') return "\u25B6";
  if (mime === 'application/pdf') return "\u25A0";
  if (mime?.includes('word') || mime?.includes('document')) return "\u25A1";
  if (mime?.includes('sheet') || mime?.includes('excel') || mime?.includes('csv')) return "\u25A6";
  if (mime?.startsWith('image/')) return "\u25CB";
  return "\u25C7";
};

const typeColor = (mime) => {
  if (mime === 'video/youtube') return C.red;
  if (mime === 'application/pdf') return C.red;
  if (mime?.includes('word') || mime?.includes('document')) return C.blue;
  if (mime?.includes('sheet') || mime?.includes('excel') || mime?.includes('csv')) return C.blue;
  if (mime?.startsWith('image/')) return C.purple;
  return C.t3;
};

const typeName = (mime) => {
  if (mime === 'video/youtube') return "YouTube";
  if (mime === 'application/pdf') return "PDF";
  if (mime?.includes('word') || mime?.includes('document')) return "Word";
  if (mime?.includes('sheet') || mime?.includes('excel')) return "Excel";
  if (mime?.includes('csv')) return "CSV";
  if (mime?.startsWith('image/')) return "Image";
  if (mime?.startsWith('text/')) return "Text";
  return "File";
};

const fmtSize = (bytes) => {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
};

export default function UploadZone({ uploads = [], grantId, onUploadsChange, label }) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingName, setUploadingName] = useState("");
  const [ytUrl, setYtUrl] = useState("");
  const [ytBusy, setYtBusy] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  const handleFiles = useCallback(async (files) => {
    setError(null);
    setUploading(true);
    try {
      for (const file of files) {
        setUploadingName(file.name);
        await uploadFile(file, grantId || null, null);
      }
      onUploadsChange();
    } catch (err) {
      setError(err.message);
    }
    setUploading(false);
    setUploadingName("");
  }, [grantId, onUploadsChange]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length) handleFiles(Array.from(e.dataTransfer.files));
  }, [handleFiles]);

  const handleYouTube = async () => {
    if (!ytUrl.trim()) return;
    setError(null);
    setYtBusy(true);
    try {
      await addYouTubeUrl(ytUrl.trim(), grantId || null, "youtube");
      setYtUrl("");
      onUploadsChange();
    } catch (err) {
      setError(err.message);
    }
    setYtBusy(false);
  };

  const handleDelete = async (id) => {
    try {
      await apiDeleteUpload(id);
      onUploadsChange();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div>
      <Label>{label || "Uploads"}</Label>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => !uploading && inputRef.current?.click()}
        style={{
          padding: uploading ? "18px 24px" : "28px 24px",
          textAlign: "center",
          borderRadius: 14,
          cursor: uploading ? "default" : "pointer",
          border: `2px dashed ${dragging ? C.primary : C.line}`,
          background: dragging ? C.primarySoft : C.bg,
          transition: "all 0.15s",
          marginBottom: 12,
        }}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.doc,.docx,.xlsx,.xls,.csv,.txt,.md,.jpg,.jpeg,.png,.gif,.webp"
          style={{ display: "none" }}
          onChange={(e) => {
            if (e.target.files.length) handleFiles(Array.from(e.target.files));
            e.target.value = "";
          }}
        />
        {uploading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <span style={{ fontSize: 13, color: C.primary, fontWeight: 600, animation: "ge-pulse 1.5s infinite" }}>
              Uploading {uploadingName}...
            </span>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 22, color: C.t4, marginBottom: 4 }}>+</div>
            <div style={{ fontSize: 13, color: C.t3, fontWeight: 500 }}>
              Drop files here or click to browse
            </div>
            <div style={{ fontSize: 11, color: C.t4, marginTop: 4 }}>
              PDF, Word, Excel, CSV, Text, Images (max 20MB)
            </div>
          </>
        )}
      </div>

      {/* YouTube URL input */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input
          type="text"
          value={ytUrl}
          onChange={(e) => setYtUrl(e.target.value)}
          placeholder="Paste YouTube URL..."
          onKeyDown={(e) => { if (e.key === "Enter") handleYouTube(); }}
          style={{
            flex: 1, padding: "8px 12px", fontSize: 13, fontFamily: FONT,
            border: `1.5px solid ${C.line}`, borderRadius: 10, outline: "none",
            background: C.white,
          }}
        />
        <Btn onClick={handleYouTube} disabled={ytBusy || !ytUrl.trim()} v="ghost" style={{ fontSize: 12, whiteSpace: "nowrap" }}>
          {ytBusy ? "Summarising..." : "+ YouTube"}
        </Btn>
      </div>

      {/* Error */}
      {error && (
        <div style={{
          padding: "8px 12px", background: C.redSoft, color: C.red, borderRadius: 10,
          fontSize: 12, marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <span>{error}</span>
          <button onClick={() => setError(null)} style={{
            background: "none", border: "none", color: C.red, cursor: "pointer", fontSize: 14, padding: "0 4px",
          }}>{"\u2715"}</button>
        </div>
      )}

      {/* File list */}
      {uploads.length > 0 && (
        <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.line}`, overflow: "hidden" }}>
          {uploads.map((u, i) => (
            <div key={u.id} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
              borderBottom: i < uploads.length - 1 ? `1px solid ${C.line}` : "none",
            }}>
              {/* Type icon */}
              <span style={{
                fontSize: 14, color: "#fff", fontWeight: 700,
                width: 28, height: 28, borderRadius: 6,
                background: typeColor(u.mime_type),
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
              }}>
                {typeIcon(u.mime_type)}
              </span>

              {/* Name + meta */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 13, fontWeight: 600, color: C.dark,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {u.mime_type === "video/youtube"
                    ? u.original_name.replace(/https?:\/\/(www\.)?/, "").slice(0, 60)
                    : u.original_name}
                </div>
                <div style={{ fontSize: 11, color: C.t4, display: "flex", gap: 8, marginTop: 2, alignItems: "center" }}>
                  <span style={{
                    padding: "1px 6px", background: typeColor(u.mime_type) + "18",
                    color: typeColor(u.mime_type), borderRadius: 3, fontWeight: 600, fontSize: 10,
                  }}>
                    {typeName(u.mime_type)}
                  </span>
                  {u.size > 0 && <span>{fmtSize(u.size)}</span>}
                  {u.has_text && (
                    <span style={{ color: "#16a34a", fontWeight: 600 }}>{"\u2713"} Text extracted</span>
                  )}
                  {!u.has_text && u.mime_type?.startsWith("image/") && (
                    <span style={{ color: C.t4 }}>Image (no text)</span>
                  )}
                  {u.mime_type === "video/youtube" && ytBusy && (
                    <span style={{ color: C.amber }}>Summarising...</span>
                  )}
                </div>
              </div>

              {/* Delete */}
              <button
                onClick={() => handleDelete(u.id)}
                style={{
                  background: "none", border: "none", color: C.t4, fontSize: 14,
                  cursor: "pointer", padding: "4px 8px", borderRadius: 4,
                  transition: "color 0.15s", flexShrink: 0,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = C.red; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = C.t4; }}
                title="Delete upload"
              >
                {"\u2715"}
              </button>
            </div>
          ))}
        </div>
      )}

      {uploads.length === 0 && (
        <div style={{ textAlign: "center", padding: 16, color: C.t4, fontSize: 12 }}>
          No files uploaded yet. Uploads enrich AI-generated proposals and research.
        </div>
      )}
    </div>
  );
}
