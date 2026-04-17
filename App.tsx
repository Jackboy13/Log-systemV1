import { useState, useEffect, useRef, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────
type LogMode = "campus" | "attendance" | "library";
type ActiveTab = LogMode | "writer";

interface StudentInfo {
  fullName: string;
  studentId: string;
  course: string;
}

interface CardRegistry {
  [uid: string]: StudentInfo;
}

interface LogEntry {
  id: number;
  mode: LogMode;
  cardUid: string;
  student: string;
  studentId: string;
  timestamp: string;
  action: string;
  extra: string;
  course: string;
}

// ─── Initial registry ─────────────────────────────────────────────────────────
const INITIAL_REGISTRY: CardRegistry = {
  "A1:B2:C3:D4":    { fullName: "DELA CRUZ, JUAN",  studentId: "2024-1001", course: "Computer Science"  },
  "E5:F6:G7:H8":    { fullName: "SANTOS, MARIA",    studentId: "2024-1002", course: "Engineering"       },
  "99:AA:BB:CC":    { fullName: "MENDOZA, CARLOS",  studentId: "2024-1003", course: "Business Admin"    },
  "TEST:RFID:2024": { fullName: "GONZALES, ANNA",   studentId: "LRN-240101", course: "Education"       },
  "12:34:56:78":    { fullName: "REYES, MIGUEL",    studentId: "2023-0882", course: "Information Tech"  },
  "DE:AD:BE:EF":    { fullName: "CRUZ, SOFIA",      studentId: "2025-0012", course: "Multimedia Arts"   },
};

const DEMO_CHIPS = [
  { uid: "A1:B2:C3:D4",    label: "🎫 JUAN DELA CRUZ"   },
  { uid: "E5:F6:G7:H8",    label: "🎫 MARIA SANTOS"     },
  { uid: "99:AA:BB:CC",    label: "🎫 CARLOS MENDOZA"   },
  { uid: "test:rfid:2024", label: "🎫 LRN-240101"        },
];

const MOCK_PORTS = [
  { device: "COM3",         description: "USB-SERIAL CH340"     },
  { device: "COM5",         description: "Arduino Uno"          },
  { device: "/dev/ttyUSB0", description: "CP2102 USB to UART"   },
  { device: "/dev/ttyACM0", description: "ESP32"                },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getFormattedTimestamp(): string {
  const now = new Date();
  return (
    now.toLocaleString("en-PH", {
      month: "short", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true,
    }) + ` · ${now.getTime() % 1000}`
  );
}
function getModeDisplayName(mode: LogMode): string {
  if (mode === "campus")     return "🏛️ Campus Entry Mode";
  if (mode === "attendance") return "📋 Attendance Mode";
  return "📚 Library Mode";
}
function getModeShortName(mode: LogMode): string {
  if (mode === "campus")     return "🏛️ Campus Entry";
  if (mode === "attendance") return "📋 Attendance";
  return "📚 Library";
}
function buildModeDetails(mode: LogMode): { action: string; extra: string } {
  const now = new Date();
  switch (mode) {
    case "campus":     return { action: "🏛️ CAMPUS ENTRY", extra: "Gate Access · Student" };
    case "attendance": return { action: "📋 ATTENDANCE",   extra: `Lecture / Class check-in · ${now.toLocaleTimeString()}` };
    case "library":    return { action: "📚 LIBRARY",      extra: "Book borrowing / entry logged · Zone: Main Library" };
  }
}
function buildSeedLogs(registry: CardRegistry): LogEntry[] {
  const seeds: { uid: string; mode: LogMode }[] = [
    { uid: "A1:B2:C3:D4", mode: "campus"     },
    { uid: "E5:F6:G7:H8", mode: "attendance" },
    { uid: "99:AA:BB:CC", mode: "library"    },
  ];
  return seeds.map(({ uid, mode }, i) => {
    const student = registry[uid] ?? { fullName: "UNKNOWN", studentId: uid.slice(0, 12), course: "Guest" };
    const { action, extra } = buildModeDetails(mode);
    return {
      id: Date.now() - (seeds.length - i) * 10000 + Math.random() * 1000,
      mode, cardUid: uid,
      student: student.fullName, studentId: student.studentId,
      timestamp: getFormattedTimestamp(), action, extra, course: student.course,
    };
  });
}

const MODECOLOR = {
  campus:     { border: "#4f8ef7", label: "🏛️ ENTRY"   },
  attendance: { border: "#f39c12", label: "📋 ATTEND"  },
  library:    { border: "#2ecc71", label: "📚 LIBRARY" },
};

// ─── Simulated async bridge ───────────────────────────────────────────────────
type BridgeAction = "write" | "read" | "delete";
interface BridgeResult {
  ok: boolean;
  msg?: string;
  data?: { last: string; first: string; mi: string; suffix: string; student_id: string };
}
function mockBridgeCommand(action: BridgeAction, isConnected: boolean): Promise<BridgeResult> {
  return new Promise(resolve => {
    setTimeout(() => {
      if (!isConnected) { resolve({ ok: false, msg: "Not connected to hardware." }); return; }
      if (action === "write") {
        resolve(Math.random() > 0.15
          ? { ok: true,  msg: "Card written successfully!" }
          : { ok: false, msg: "FAILED: Write error (simulated)" });
      } else if (action === "read") {
        if (Math.random() > 0.2) {
          resolve({ ok: true, data: { last: "DELA CRUZ", first: "JUAN", mi: "A", suffix: "", student_id: "2024-1234" } });
        } else {
          resolve({ ok: false, msg: "CARD_NOT_FOUND" });
        }
      } else if (action === "delete") {
        resolve(Math.random() > 0.1
          ? { ok: true,  msg: "Card data deleted successfully." }
          : { ok: false, msg: "FAILED: Delete error" });
      } else {
        resolve({ ok: false, msg: "Unknown command" });
      }
    }, 800);
  });
}

// ─── Input style ─────────────────────────────────────────────────────────────
const fieldInputStyle: React.CSSProperties = {
  background: "#161925", border: "1px solid #2e3350", color: "#e8eaf0",
  padding: "12px 14px", borderRadius: 8, fontFamily: "'Courier New', monospace",
  fontSize: 14, outline: "none", width: "100%", transition: "border 0.15s",
};

// ─── RFID Card Writer Panel ───────────────────────────────────────────────────
function WriterPanel() {
  // Connection
  const [ports, setPorts]               = useState<string[]>([]);
  const [selectedPort, setSelectedPort] = useState("");
  const [isConnected, setIsConnected]   = useState(false);
  const [currentPort, setCurrentPort]   = useState("");

  // Form
  const [lastName,  setLastName]  = useState("");
  const [firstName, setFirstName] = useState("");
  const [mi,        setMi]        = useState("");
  const [suffix,    setSuffix]    = useState("");
  const [studentId, setStudentId] = useState("");

  // Op state
  const [opRunning,      setOpRunning]      = useState(false);
  const [readModeActive, setReadModeActive] = useState(false);
  const [scanHintActive, setScanHintActive] = useState(false);
  const [statusMsg,      setStatusMsgState] = useState("Ready. Connect your hardware to begin.");
  const [statusType,     setStatusType]     = useState<"default" | "success" | "error" | "warn">("default");
  const [deleteConfirm,  setDeleteConfirm]  = useState(false);

  const readIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const readActiveRef   = useRef(false);  // ref for async closures
  const connRef         = useRef(false);

  // keep refs in sync
  useEffect(() => { readActiveRef.current = readModeActive; }, [readModeActive]);
  useEffect(() => { connRef.current = isConnected; }, [isConnected]);

  const setStatus = (msg: string, type: "default" | "success" | "error" | "warn" = "default") => {
    setStatusMsgState(msg); setStatusType(type);
  };

  // Populate ports
  const populatePorts = () => {
    const list = MOCK_PORTS.map(p => `${p.device}  —  ${p.description}`);
    setPorts(list);
    setSelectedPort(list[0] ?? "");
    setStatus("Port list refreshed.");
  };
  useEffect(() => { populatePorts(); }, []);

  const getPortDevice = (val: string) => val.split("  —  ")[0].trim();

  // Force uppercase helper
  const toUpper = (setter: (v: string) => void) =>
    (e: React.ChangeEvent<HTMLInputElement>) => setter(e.target.value.toUpperCase());

  // Clear form
  const clearForm = () => {
    setLastName(""); setFirstName(""); setMi(""); setSuffix(""); setStudentId("");
    setStatus("Form cleared.");
  };

  // Validate
  const validate = (): { valid: boolean; msg: string } => {
    if (!lastName.trim())  return { valid: false, msg: "Last Name is required." };
    if (!firstName.trim()) return { valid: false, msg: "First Name is required." };
    if (!studentId.trim()) return { valid: false, msg: "Student ID is required." };
    if (mi.trim().length > 2) return { valid: false, msg: "Middle Initial should be 1–2 characters." };
    return { valid: true, msg: "" };
  };

  // Connect
  const handleConnect = async () => {
    if (opRunning || !selectedPort) { if (!selectedPort) setStatus("No port selected.", "error"); return; }
    setStatus(`Connecting to ${getPortDevice(selectedPort)}...`, "warn");
    await new Promise(r => setTimeout(r, 600));
    const port = getPortDevice(selectedPort);
    setCurrentPort(port);
    setIsConnected(true);
    connRef.current = true;
    setStatus(`Connected on ${port}`, "success");
  };

  // Disconnect
  const handleDisconnect = () => {
    exitReadMode();
    setIsConnected(false); connRef.current = false;
    setCurrentPort("");
    setStatus("Disconnected.");
  };

  // Exit read mode
  const exitReadMode = () => {
    readActiveRef.current = false;
    setReadModeActive(false);
    setScanHintActive(false);
    if (readIntervalRef.current) { clearTimeout(readIntervalRef.current); readIntervalRef.current = null; }
    setOpRunning(false);
  };

  // Single read (used in loop)
  const performSingleRead = useCallback(async () => {
    if (!readActiveRef.current || !connRef.current) return;
    setStatus("Scan mode active — waiting for card...", "warn");
    try {
      const result = await mockBridgeCommand("read", connRef.current);
      if (!readActiveRef.current) return;
      if (result.ok && result.data) {
        const d = result.data;
        setLastName(d.last); setFirstName(d.first); setMi(d.mi); setSuffix(d.suffix); setStudentId(d.student_id);
        setStatus(`Card read OK — ${d.last} ${d.first} [${d.student_id}]`, "success");
      } else {
        if (result.msg !== "CARD_NOT_FOUND") setStatus(result.msg ?? "Read failed.", "error");
        else setStatus("Scan mode active — waiting for card...", "warn");
      }
    } catch { setStatus("Read error", "error"); }
    if (readActiveRef.current) {
      readIntervalRef.current = setTimeout(() => performSingleRead(), 1200);
    }
  }, []);

  // Start read mode (continuous)
  const handleStartReadMode = () => {
    if (opRunning || !isConnected) return;
    readActiveRef.current = true;
    setReadModeActive(true);
    setScanHintActive(true);
    setOpRunning(true);
    setStatus("Scan mode active. Place card on reader.", "warn");
    performSingleRead();
  };

  // Write
  const handleWrite = async () => {
    if (opRunning || !isConnected) return;
    const v = validate();
    if (!v.valid) { setStatus(v.msg, "error"); return; }
    setOpRunning(true);
    setStatus("Writing to card... Place card on reader now.", "warn");
    const result = await mockBridgeCommand("write", isConnected);
    setOpRunning(false);
    setStatus(result.msg ?? (result.ok ? "Done." : "Error."), result.ok ? "success" : "error");
  };

  // Read (single)
  const handleReadOnce = async () => {
    if (opRunning || !isConnected) return;
    setOpRunning(true);
    setStatus("Reading card... Place card on reader.", "warn");
    const result = await mockBridgeCommand("read", isConnected);
    setOpRunning(false);
    if (result.ok && result.data) {
      const d = result.data;
      setLastName(d.last); setFirstName(d.first); setMi(d.mi); setSuffix(d.suffix); setStudentId(d.student_id);
      setStatus(`Card read — ${d.last} ${d.first} [${d.student_id}]`, "success");
    } else {
      setStatus(result.msg ?? "Read failed.", "error");
    }
  };

  // Delete
  const handleDelete = async () => {
    if (opRunning || !isConnected) return;
    setDeleteConfirm(false);
    setOpRunning(true);
    setStatus("Deleting card data... Place card on reader now.", "warn");
    const result = await mockBridgeCommand("delete", isConnected);
    setOpRunning(false);
    setStatus(result.msg ?? (result.ok ? "Done." : "Error."), result.ok ? "success" : "error");
  };

  const busy = opRunning || !isConnected;

  const statusColor =
    statusType === "success" ? "#2ecc71" :
    statusType === "error"   ? "#e74c3c" :
    statusType === "warn"    ? "#f39c12" : "#7a82a0";

  const sectionTitle = (icon: string, label: string) => (
    <div style={{
      fontFamily: "'Courier New', monospace", fontSize: 10, fontWeight: "bold",
      color: "#7a82a0", margin: "16px 0 4px", letterSpacing: "1.5px",
    }}>
      {icon} {label}
    </div>
  );

  const cardPanel = (children: React.ReactNode) => (
    <div style={{
      background: "#21253a", borderRadius: 14, padding: "18px",
      marginBottom: 8, border: "1px solid #2e3350",
      boxShadow: "0 6px 10px rgba(0,0,0,0.3)",
    }}>
      {children}
    </div>
  );

  const btnBase: React.CSSProperties = {
    flex: 1, padding: "12px 8px", borderRadius: 10, fontWeight: 600,
    fontSize: 14, border: "none", cursor: "pointer", transition: "all 0.15s",
    textAlign: "center", fontFamily: "inherit",
  };

  const Field = ({
    label, value, onChange, placeholder, maxLength,
  }: {
    label: string; value: string;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    placeholder: string; maxLength: number;
  }) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label style={{
        fontFamily: "'Courier New', monospace", fontSize: 10, fontWeight: "bold",
        color: "#7a82a0", letterSpacing: "0.5px",
      }}>{label}</label>
      <input
        type="text" value={value} onChange={onChange}
        placeholder={placeholder} maxLength={maxLength}
        style={fieldInputStyle}
        onFocus={e => (e.target.style.borderColor = "#4f8ef7")}
        onBlur={e  => (e.target.style.borderColor = "#2e3350")}
      />
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* ── CONNECTION ─────────────────────────────────────────── */}
      {sectionTitle("🔌", "CONNECTION")}
      {cardPanel(
        <>
          {/* Status row */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <span style={{ fontSize: 20, color: isConnected ? "#2ecc71" : "#e74c3c", transition: "color 0.2s" }}>●</span>
            <span style={{
              fontSize: 14, fontWeight: 500, flex: 1,
              color: isConnected ? "#2ecc71" : "#7a82a0",
            }}>
              {isConnected ? `Connected — ${currentPort}` : "Not connected"}
            </span>
          </div>

          {/* Port selector */}
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 18 }}>
            <span style={{ width: 45, color: "#7a82a0", fontSize: 12 }}>Port</span>
            <select
              value={selectedPort}
              onChange={e => setSelectedPort(e.target.value)}
              disabled={isConnected}
              style={{
                flex: 1, background: "#161925", border: "1px solid #2e3350",
                color: "#e8eaf0", padding: "10px 12px", borderRadius: 8,
                fontFamily: "'Courier New', monospace", fontSize: 13, outline: "none", cursor: "pointer",
                opacity: isConnected ? 0.5 : 1,
              }}
            >
              {ports.length === 0
                ? <option value="">(no ports found)</option>
                : ports.map(p => <option key={p} value={p}>{p}</option>)
              }
            </select>
            {/* Refresh */}
            <button
              onClick={() => { if (!opRunning) populatePorts(); }}
              title="Refresh ports"
              style={{
                background: "#1a1d27", border: "1px solid #2e3350", color: "#4f8ef7",
                width: 40, height: 40, borderRadius: 8, fontSize: 16, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", transition: "0.2s",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "#2e3350")}
              onMouseLeave={e => (e.currentTarget.style.background = "#1a1d27")}
            >↻</button>
          </div>

          {/* Connect / Disconnect */}
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={handleConnect}
              disabled={isConnected || opRunning}
              style={{
                ...btnBase,
                background: "#4f8ef7", color: "white",
                boxShadow: "0 4px 8px rgba(79,142,247,0.2)",
                opacity: isConnected || opRunning ? 0.5 : 1,
                cursor: isConnected || opRunning ? "not-allowed" : "pointer",
              }}
              onMouseEnter={e => { if (!isConnected && !opRunning) e.currentTarget.style.background = "#2d5cbf"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "#4f8ef7"; }}
            >Connect</button>
            <button
              onClick={handleDisconnect}
              disabled={!isConnected || opRunning}
              style={{
                ...btnBase,
                background: "#1a1d27", color: "#7a82a0", border: "1px solid #2e3350",
                opacity: !isConnected || opRunning ? 0.5 : 1,
                cursor: !isConnected || opRunning ? "not-allowed" : "pointer",
              }}
              onMouseEnter={e => { if (isConnected && !opRunning) { e.currentTarget.style.background = "#2e3350"; e.currentTarget.style.color = "#e8eaf0"; } }}
              onMouseLeave={e => { e.currentTarget.style.background = "#1a1d27"; e.currentTarget.style.color = "#7a82a0"; }}
            >Disconnect</button>
          </div>
        </>
      )}

      {/* ── STUDENT DATA ───────────────────────────────────────── */}
      {sectionTitle("🎓", "STUDENT DATA")}
      {cardPanel(
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Field label="LAST NAME *"        value={lastName}  onChange={toUpper(setLastName)}  placeholder="e.g. DELA CRUZ" maxLength={20} />
            <Field label="FIRST NAME *"       value={firstName} onChange={toUpper(setFirstName)} placeholder="e.g. JUAN"      maxLength={20} />
            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <Field label="M.I."   value={mi}     onChange={toUpper(setMi)}     placeholder="e.g. A (optional)"    maxLength={2} />
              </div>
              <div style={{ flex: 1 }}>
                <Field label="SUFFIX" value={suffix} onChange={toUpper(setSuffix)} placeholder="e.g. JR (optional)"   maxLength={5} />
              </div>
            </div>
            <Field label="STUDENT ID / LRN *" value={studentId} onChange={toUpper(setStudentId)} placeholder="e.g. 2024-0001" maxLength={16} />
          </div>
          <div style={{ color: "#7a82a0", fontSize: 10, marginTop: 10 }}>* required  |  others optional</div>
        </>
      )}

      {/* ── CARD OPERATIONS ────────────────────────────────────── */}
      {sectionTitle("💾", "CARD OPERATIONS")}
      {cardPanel(
        <>
          {/* Scan hint */}
          <div style={{
            color: scanHintActive ? "#f39c12" : "#7a82a0",
            fontSize: 11, marginBottom: 16, textAlign: "center",
          }}>
            {scanHintActive
              ? "◉  Scan mode active — place any card on reader to read."
              : "Place card on reader BEFORE pressing an action button."}
          </div>

          {/* Write + Read (or Stop) */}
          <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
            <button
              onClick={handleWrite}
              disabled={busy}
              style={{
                ...btnBase,
                background: "#4f8ef7", color: "white",
                boxShadow: "0 4px 8px rgba(79,142,247,0.2)",
                opacity: busy ? 0.5 : 1, cursor: busy ? "not-allowed" : "pointer",
              }}
              onMouseEnter={e => { if (!busy) e.currentTarget.style.background = "#2d5cbf"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "#4f8ef7"; }}
            >✏️ WRITE TO CARD</button>

            {readModeActive ? (
              <button
                onClick={() => { exitReadMode(); setStatus("Scan mode stopped."); }}
                style={{
                  ...btnBase, background: "#7a3030", color: "white", cursor: "pointer",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "#9a4040")}
                onMouseLeave={e => (e.currentTarget.style.background = "#7a3030")}
              >⏹ STOP SCANNING</button>
            ) : (
              <button
                onClick={handleStartReadMode}
                disabled={busy}
                style={{
                  ...btnBase,
                  background: "#1a1d27", color: "#7a82a0", border: "1px solid #2e3350",
                  opacity: busy ? 0.5 : 1, cursor: busy ? "not-allowed" : "pointer",
                }}
                onMouseEnter={e => { if (!busy) { e.currentTarget.style.background = "#2e3350"; e.currentTarget.style.color = "#e8eaf0"; } }}
                onMouseLeave={e => { e.currentTarget.style.background = "#1a1d27"; e.currentTarget.style.color = "#7a82a0"; }}
              >📡 READ CARD</button>
            )}
          </div>

          {/* Clear form */}
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
            <button
              onClick={clearForm}
              style={{
                background: "transparent", border: "1px solid #2e3350",
                color: "#7a82a0", padding: "8px 16px", borderRadius: 8,
                fontSize: 12, cursor: "pointer", transition: "0.15s",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "#2e3350")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >Clear Form</button>
          </div>

          {/* Danger zone */}
          <div style={{
            fontFamily: "'Courier New', monospace", fontSize: 10, fontWeight: "bold",
            color: "#7a3030", margin: "20px 0 8px",
          }}>
            ⚠️ DANGER ZONE
          </div>

          {!deleteConfirm ? (
            <button
              onClick={() => setDeleteConfirm(true)}
              disabled={busy}
              style={{
                ...btnBase,
                background: "#3a1a1a", color: "#e06060", border: "1px solid #7a3030",
                opacity: busy ? 0.5 : 1, cursor: busy ? "not-allowed" : "pointer",
              }}
              onMouseEnter={e => { if (!busy) e.currentTarget.style.background = "#5a2a2a"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "#3a1a1a"; }}
            >🗑️ DELETE CARD DATA</button>
          ) : (
            <div style={{
              background: "#200f0f", border: "1px solid #7a3030", borderRadius: 10,
              padding: "14px", display: "flex", flexDirection: "column", gap: 10,
            }}>
              <div style={{ color: "#e06060", fontSize: 12, fontFamily: "'Courier New', monospace" }}>
                ⚠️ Delete ALL data from card? This cannot be undone.
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={handleDelete}
                  style={{
                    ...btnBase, background: "#c0392b", color: "white",
                    border: "none", cursor: "pointer",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#e74c3c")}
                  onMouseLeave={e => (e.currentTarget.style.background = "#c0392b")}
                >Confirm Delete</button>
                <button
                  onClick={() => setDeleteConfirm(false)}
                  style={{
                    ...btnBase, background: "#1a1d27", color: "#7a82a0",
                    border: "1px solid #2e3350", cursor: "pointer",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = "#2e3350"; e.currentTarget.style.color = "#e8eaf0"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "#1a1d27"; e.currentTarget.style.color = "#7a82a0"; }}
                >Cancel</button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── STATUS BAR ─────────────────────────────────────────── */}
      <div style={{
        background: "#1a1d27", borderTop: "1px solid #2e3350",
        padding: "12px 18px", fontFamily: "'Courier New', monospace",
        fontSize: 11, color: statusColor, minHeight: 48,
        display: "flex", alignItems: "center", borderRadius: "0 0 16px 16px",
        marginTop: 4,
      }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {statusMsg}
        </span>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>(() => {
    const saved = localStorage.getItem("rfid_lastMode") as ActiveTab | null;
    return saved && ["campus","attendance","library","writer"].includes(saved) ? saved : "campus";
  });
  const [registry] = useState<CardRegistry>({ ...INITIAL_REGISTRY });
  const [logs, setLogs]           = useState<LogEntry[]>(() => buildSeedLogs(INITIAL_REGISTRY));
  const [statusMsg, setStatusMsg] = useState("");
  const [ledActive, setLedActive] = useState(true);
  const [rfidValue, setRfidValue] = useState("");
  const [tapScale,  setTapScale]  = useState(false);

  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentMode = activeTab !== "writer" ? (activeTab as LogMode) : "campus";

  useEffect(() => {
    setStatusMsg(`● ${getModeDisplayName(currentMode)} · Ready to log RFID tap`);
  }, []);

  useEffect(() => {
    localStorage.setItem("rfid_lastMode", activeTab);
  }, [activeTab]);

  const setStatus = useCallback(
    (msg: string, resetAfter = 2200) => {
      if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
      setStatusMsg(msg);
      if (resetAfter > 0) {
        statusTimerRef.current = setTimeout(() => {
          setStatusMsg(`● ${getModeDisplayName(currentMode)} · Ready for next tap`);
        }, resetAfter);
      }
    },
    [currentMode]
  );

  const handleSetTab = (tab: ActiveTab) => {
    setActiveTab(tab);
    setLedActive(true);
    if (tab !== "writer") {
      setStatusMsg(`● ${getModeDisplayName(tab as LogMode)} · Ready to log RFID tap`);
    } else {
      setStatusMsg("✏️ RFID Card Writer · Connect hardware to begin");
    }
  };

  const logCardTap = useCallback(
    (cardUid: string, source: "input" | "demo" = "input", overrideMode?: LogMode) => {
      if (!cardUid.trim()) {
        setStatus("⚠️ No RFID code entered. Please scan or enter card ID.", 1500);
        return false;
      }
      const cleanedUid = cardUid.trim().toUpperCase();
      const info = registry[cleanedUid] ?? { fullName: "UNKNOWN CARDHOLDER", studentId: cleanedUid.slice(0, 12), course: "Guest / External" };
      const mode = overrideMode ?? currentMode;
      const { action, extra } = buildModeDetails(mode);

      setLogs(prev => [{
        id: Date.now() + Math.random() * 10000,
        mode, cardUid: cleanedUid,
        student: info.fullName, studentId: info.studentId,
        timestamp: getFormattedTimestamp(), action, extra, course: info.course,
      }, ...prev]);

      setLedActive(true);
      const modeEmoji = mode === "campus" ? "🏛️" : mode === "attendance" ? "📋" : "📚";
      setStatus(`✅ ${modeEmoji} ${action} · ${info.fullName} (${info.studentId}) · ${extra}`, 2200);
      if (source === "input") setRfidValue("");
      setTapScale(true);
      setTimeout(() => setTapScale(false), 120);
      if (navigator.vibrate) navigator.vibrate(50);
      return true;
    },
    [currentMode, registry, setStatus]
  );

  const handleTapButton = () => {
    if (!rfidValue.trim()) { setStatus("⚠️ Please enter or scan an RFID card UID first.", 1500); return; }
    logCardTap(rfidValue, "input");
  };

  const clearLogs = () => {
    setLogs([]);
    setStatus(`🗑️ Logs cleared · ${getModeDisplayName(currentMode)} active`, 1500);
  };

  const TABS: { tab: ActiveTab; icon: string; label: string }[] = [
    { tab: "campus",     icon: "🏛️", label: "CAMPUS"     },
    { tab: "attendance", icon: "📋", label: "ATTENDANCE" },
    { tab: "library",    icon: "📚", label: "LIBRARY"    },
    { tab: "writer",     icon: "🪪", label: "WRITER"     },
  ];

  const isLogMode = activeTab !== "writer";

  return (
    <div style={{
      background: "#0f1117", minHeight: "100vh",
      display: "flex", justifyContent: "center", alignItems: "flex-start",
      padding: "24px",
      fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, monospace",
    }}>
      <div style={{
        maxWidth: 720, width: "100%", background: "#0f1117",
        borderRadius: 32, boxShadow: "0 25px 45px -12px rgba(0,0,0,0.5)",
        overflow: "hidden", marginTop: 12,
      }}>
        {/* Header */}
        <div style={{ background: "#1a1d27", padding: "20px 24px 16px", borderBottom: "1px solid #2e3350" }}>
          <h1 style={{
            fontSize: "1.65rem", fontWeight: 700, letterSpacing: "-0.3px",
            background: "linear-gradient(135deg, #4f8ef7, #8bb3ff)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            backgroundClip: "text", display: "inline-block", lineHeight: 1.3,
          }}>
            ⬡ RFID <span style={{ fontFamily: "monospace", fontWeight: 800 }}>ACADEMIC LOG</span>
          </h1>
          <div style={{ color: "#7a82a0", fontSize: "0.75rem", marginTop: 6, letterSpacing: "0.3px" }}>
            Multi‑Mode Logger • Campus • Attendance • Library • Card Writer
          </div>
        </div>

        {/* Tab bar */}
        <div style={{
          display: "flex", gap: 10, padding: "16px 20px 12px",
          background: "#0f1117", borderBottom: "1px solid #1e212c",
        }}>
          {TABS.map(({ tab, icon, label }) => {
            const isActive = activeTab === tab;
            const isWriter = tab === "writer";
            const activeBg     = isWriter ? "#4f8ef7" : "#4f8ef7";
            const activeShadow = "0 6px 14px rgba(79,142,247,0.25)";
            return (
              <button
                key={tab}
                onClick={() => handleSetTab(tab)}
                style={{
                  flex: 1, background: isActive ? activeBg : "#161925",
                  border: `1px solid ${isActive ? activeBg : "#2e3350"}`,
                  borderRadius: 60, padding: "11px 0", fontWeight: 700,
                  fontSize: "0.82rem", cursor: "pointer",
                  color: isActive ? "white" : "#a8b0d0",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  boxShadow: isActive ? activeShadow : "none",
                  transition: "all 0.2s ease",
                }}
              >
                <span style={{ fontSize: "1rem" }}>{icon}</span>
                {label}
              </button>
            );
          })}
        </div>

        {/* Main panel */}
        <div style={{ padding: "20px 24px 24px" }}>

          {/* Status card — log modes only */}
          {isLogMode && (
            <div style={{
              background: "#1a1d27", borderRadius: 24, padding: 18,
              marginBottom: 24, border: "1px solid #2e3350",
              display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
            }}>
              <div style={{
                width: 13, height: 13,
                background: ledActive ? "#2ecc71" : "#e74c3c", borderRadius: "50%",
                boxShadow: ledActive ? "0 0 8px #2ecc71" : "0 0 5px rgba(231,76,60,0.6)",
                flexShrink: 0, transition: "background 0.2s",
              }} />
              <div style={{ flex: 1, fontWeight: 500, color: "#cbd5ff", fontFamily: "'Courier New', monospace", fontSize: "0.88rem" }}>
                {statusMsg || `● ${getModeDisplayName(currentMode)} · Ready`}
              </div>
              <div style={{
                background: "#21253a", borderRadius: 40, padding: "5px 14px",
                fontSize: "0.7rem", color: "#8f9bb5", whiteSpace: "nowrap",
              }}>
                Mode: {getModeShortName(activeTab as LogMode)}
              </div>
            </div>
          )}

          {/* ── Writer panel ── */}
          {!isLogMode && <WriterPanel />}

          {/* ── Logger panel ── */}
          {isLogMode && (
            <>
              {/* RFID Tap Simulator */}
              <div style={{
                background: "#21253a", borderRadius: 28, padding: "16px 20px",
                marginBottom: 24, border: "1px solid #2e3350",
                boxShadow: "0 8px 12px -6px rgba(0,0,0,0.3)",
              }}>
                <div style={{
                  fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: 1,
                  fontWeight: "bold", color: "#7a82a0", marginBottom: 8,
                }}>
                  🪪 RFID TAP SIMULATOR (or scan via input)
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 6 }}>
                  <input
                    type="text" value={rfidValue}
                    onChange={e => setRfidValue(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleTapButton()}
                    placeholder="Enter / scan RFID UID or card code ..."
                    autoComplete="off"
                    style={{
                      flex: 3, minWidth: 180, background: "#0b0e14",
                      border: "1px solid #3a3f5e", borderRadius: 60,
                      padding: "14px 18px", color: "#eef3ff",
                      fontFamily: "monospace", fontSize: "0.9rem", outline: "none",
                    }}
                    onFocus={e => { e.target.style.borderColor = "#4f8ef7"; e.target.style.boxShadow = "0 0 0 2px rgba(79,142,247,0.3)"; }}
                    onBlur={e  => { e.target.style.borderColor = "#3a3f5e"; e.target.style.boxShadow = "none"; }}
                  />
                  <button
                    onClick={handleTapButton}
                    style={{
                      background: "#2d5cbf", border: "none", borderRadius: 60,
                      padding: "0 24px", fontWeight: "bold", color: "white", cursor: "pointer",
                      fontSize: "0.85rem", display: "flex", alignItems: "center", gap: 8,
                      transform: tapScale ? "scale(0.96)" : "scale(1)",
                      transition: "all 0.12s", whiteSpace: "nowrap",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = "#4f8ef7")}
                    onMouseLeave={e => (e.currentTarget.style.background = "#2d5cbf")}
                  >
                    📡 TAP CARD
                  </button>
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
                  {DEMO_CHIPS.map(chip => (
                    <button
                      key={chip.uid}
                      onClick={() => { setRfidValue(chip.uid); logCardTap(chip.uid, "demo"); }}
                      style={{
                        background: "#161925", borderRadius: 40, padding: "8px 14px",
                        fontSize: "0.7rem", fontFamily: "monospace", color: "#9aa3c2",
                        border: "1px solid #2e3350", cursor: "pointer",
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = "#2d3448"; e.currentTarget.style.color = "white"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = "#161925"; e.currentTarget.style.color = "#9aa3c2"; }}
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Transaction Logs */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
                <div style={{ fontWeight: 600, color: "#eef3ff", letterSpacing: "-0.2px" }}>📋 TRANSACTION LOGS</div>
                <button
                  onClick={clearLogs}
                  style={{ background: "transparent", border: "none", color: "#7a82a0", fontSize: "0.7rem", cursor: "pointer", textDecoration: "underline" }}
                >clear all</button>
              </div>

              <div style={{
                background: "#0b0e14", borderRadius: 24, border: "1px solid #252a3a",
                minHeight: 320, maxHeight: 380, overflowY: "auto", padding: "8px 4px",
              }}>
                {logs.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "48px 20px", color: "#5a6080", fontSize: "0.85rem" }}>
                    📭 No transaction logs. Tap an RFID card to begin.
                  </div>
                ) : (
                  logs.map(log => (
                    <div key={log.id} style={{
                      background: "#13161f", margin: "8px 12px", padding: "12px 16px",
                      borderRadius: 18, borderLeft: `4px solid ${MODECOLOR[log.mode].border}`,
                      fontFamily: "'Courier New', monospace", fontSize: "0.8rem",
                      display: "flex", flexWrap: "wrap", justifyContent: "space-between",
                      alignItems: "center", gap: 8,
                    }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 3 }}>
                        <div style={{ fontWeight: "bold", color: "white" }}>
                          {log.student}{" "}
                          <span style={{ fontSize: "0.7rem", color: "#6b7299" }}>({log.studentId})</span>
                        </div>
                        <div style={{ fontSize: "0.7rem", color: "#8d95b5" }}>
                          {log.action} · {log.extra} · 🆔 {log.cardUid.slice(0, 10)}…
                        </div>
                      </div>
                      <div style={{ fontSize: "0.7rem", color: "#6c7293", textAlign: "right", flexShrink: 0 }}>
                        {log.timestamp}<br />
                        <span style={{ fontSize: "0.65rem" }}>[{MODECOLOR[log.mode].label}]</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}

          {/* Footer */}
          <div style={{ textAlign: "center", fontSize: "0.65rem", color: "#3e435e", marginTop: 20, paddingBottom: 8 }}>
            ⚡ Real-time logging | Each tap stores timestamp, mode & cardholder info
          </div>
        </div>
      </div>
    </div>
  );
}
