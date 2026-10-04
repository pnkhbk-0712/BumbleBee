import { useState, useMemo, useEffect, useRef, type RefObject } from "react";
import maplibregl from "maplibre-gl";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { Beehive } from "./lib/api";
import {
  getBeehives,
  saveBeehive,
  deleteBeehive,
  updateBeehive,
  getLatestSensorData,
  getSensorHistory,
  subscribeToSensorData,
  parseTimestamp,
  getLatestStatusData
} from "./lib/api";

// ─── types ───────────────────────────────────────────────────────────────────

type Status = "alert" | "warn" | "ok";

interface Notification {
  id: string;
  title: string;
  body: string;
  time: string;
  read: boolean;
}

type NotificationMap = Record<string, Notification[]>;

interface EnrichedBeehive extends Beehive {
  temperature?: number;
  humidity?: number;
  weight?: number;
  unread: number;
  status: Status;
  statusData?: any;
}

interface BeehiveListProps {
  /** Raw maplibre map instance — used to fly-to and place markers */
  mapRef: RefObject<MapLibreMap | null>;
  /** Called when the user triggers "Click on map to place" so app.tsx can put the map into crosshair mode */
  onRequestMapClick?: (callback: (lng: number, lat: number) => void) => void;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<Status, string> = {
  alert: "#d43c3c",
  warn: "#e8a020",
  ok: "#3a9e6e",
};
const STATUS_LABEL: Record<Status, string> = {
  alert: "Critical",
  warn: "Warning",
  ok: "Healthy",
};

// ─── tiny sub-components ─────────────────────────────────────────────────────

function StatusDot({ status }: { status: Status }) {
  return (
    <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: STATUS_COLOR[status], flexShrink: 0, marginTop: 2 }} title={STATUS_LABEL[status]} />
  );
}

function AlertBadge({ count, status }: { count: number; status: Status }) {
  if (count === 0) return null;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 18, height: 18, padding: "0 4px", borderRadius: 10, background: STATUS_COLOR[status], color: "#fff", fontSize: 10, fontWeight: 700, position: "absolute", top: -4, right: -4 }}>
      {count}
    </span>
  );
}

function StatPill({ value, unit, label }: { value: number | string; unit: string; label: string }) {
  return (
    <div style={{ background: "#f5f0e8", borderRadius: 6, padding: "4px 6px", textAlign: "center", flex: 1 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "#3a2a1a" }}>
        {value}<span style={{ fontSize: 10, color: "#9a8070", marginLeft: 1 }}>{unit}</span>
      </div>
      <div style={{ fontSize: 9, color: "#b0a090", marginTop: 1 }}>{label}</div>
    </div>
  );
}

// ─── LineChart (for telemetry modal) ─────────────────────────────────────────

function LineChart({
  series,
  color = "#ff6b6b",
  height = 100,
}: {
  series: Array<{ time: string; value: number }>;
  color?: string;
  height?: number;
}) {
  if (!series || series.length === 0) {
    return (
      <div
        style={{
          height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#999",
        }}
      >
        No data
      </div>
    );
  }

  // ─────────────────────────────────────
  // DYNAMIC DOWNSAMPLING
  // ─────────────────────────────────────

  const maxPoints = 120;

  const sampled =
    series.length > maxPoints
      ? Array.from({ length: maxPoints }, (_, i) => {
          const idx = Math.floor(
            (i / (maxPoints - 1)) * (series.length - 1)
          );

          return series[idx];
        })
      : series;

  // dynamic width
  const vw = 480;

  const values = sampled.map((s) => s.value);

  const min = Math.min(...values);
  const max = Math.max(...values);

  const padL = 8;
  const padT = 8;
  const padB = 18;

  const w = vw - padL * 2;
  const h = height - padT - padB;

  const stepX = w / Math.max(1, sampled.length - 1);

  const pts = sampled
    .map((s, i) => {
      const x = padL + i * stepX;

      const y =
        padT +
        (max === min
          ? h / 2
          : h - ((s.value - min) / (max - min)) * h);

      return `${x},${y}`;
    })
    .join(" ");

  const pathD = sampled
    .map((s, i) => {
      const x = padL + i * stepX;

      const y =
        padT +
        (max === min
          ? h / 2
          : h - ((s.value - min) / (max - min)) * h);

      return `${i === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");

  const ticks = max === min ? 1 : 4;

  const tickLines =
    max === min
      ? [{ y: padT + h / 2, value: max }]
      : Array.from({ length: ticks + 1 }, (_, i) => ({
          y: padT + (i / ticks) * h,
          value: Number(
            (max - (i / ticks) * (max - min)).toFixed(1)
          ),
        }));

  const maxXTicks = Math.min(6, sampled.length);

  const xLabels =
    sampled.length > 0
      ? Array.from({ length: maxXTicks }, (_, i) => {
          const idx = Math.round(
            (i * (sampled.length - 1)) / (maxXTicks - 1)
          );

          return {
            x: padL + idx * stepX,
            label: sampled[idx].time,
          };
        })
      : [];

  return (
    <div style={{ overflowX: "auto" }}>
      <svg
        width={vw}
        height={height}
        viewBox={`0 0 ${vw} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ display: "block" }}
      >
        <rect
          x={0}
          y={0}
          width={vw}
          height={height}
          rx={6}
          fill="#fff"
          stroke="#eee"
        />

        {tickLines.map((t, i) => (
          <g key={i}>
            <line
              x1={padL}
              x2={vw - padL}
              y1={t.y}
              y2={t.y}
              stroke="#f0f0f0"
              strokeWidth={1}
            />

            <text
              x={4}
              y={t.y + 4}
              fontSize={10}
              fill="#666"
            >
              {t.value}
            </text>
          </g>
        ))}

        <polyline
          points={pts}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        <path
          d={`${pathD} L ${
            padL + (sampled.length - 1) * stepX
          } ${padT + h} L ${padL} ${padT + h} Z`}
          fill={color}
          fillOpacity={0.08}
        />

        {xLabels.map((t, i) => (
          <g key={i}>
            <line
              x1={t.x}
              x2={t.x}
              y1={padT + h}
              y2={padT + h + 6}
              stroke="#ccc"
              strokeWidth={1}
            />

            <text
              x={t.x}
              y={padT + h + 16}
              fontSize={10}
              fill="#666"
              textAnchor="middle"
            >
              {t.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
// ─── HiveCard ─────────────────────────────────────────────────────────────────

interface HiveCardProps {
  beehive: EnrichedBeehive;
  isSelected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onView: () => void;
  onBellClick: () => void;
}

function HiveCard({ beehive, isSelected, onSelect, onEdit, onDelete, onView, onBellClick }: HiveCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const status = beehive.status;

  return (
    <li
      onClick={() => { setMenuOpen(false); onSelect(); }}
      style={{ listStyle: "none", border: isSelected ? "1.5px solid #6f4e37" : "1px solid rgba(0,0,0,0.08)", borderRadius: 10, marginBottom: 7, padding: "10px 11px", background: isSelected ? "#fdf5ec" : "#fff", cursor: "pointer", transition: "border-color 0.12s, background 0.12s", position: "relative", boxShadow: isSelected ? "0 0 0 3px rgba(111,78,55,0.12)" : "none" }}
      onMouseEnter={(e) => { if (!isSelected) (e.currentTarget as HTMLLIElement).style.borderColor = "rgba(111,78,55,0.3)"; }}
      onMouseLeave={(e) => { if (!isSelected) (e.currentTarget as HTMLLIElement).style.borderColor = "rgba(0,0,0,0.08)"; }}
    >
      {/* Top row */}
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 7 }}>
        <StatusDot status={status} />
        <span style={{ fontSize: 13, fontWeight: 600, color: "#3a2a1a", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={beehive.name}>
          {beehive.name}
        </span>

        {/* Bell */}
        <button onClick={(e) => { e.stopPropagation(); onBellClick(); }} title="Notifications"
          style={{ position: "relative", width: 30, height: 30, borderRadius: 6, border: "1px solid #e0d5c8", background: "white", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0, flexShrink: 0 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M12 22a2 2 0 0 0 2-2H10a2 2 0 0 0 2 2zm6-6V11c0-3.07-1.63-5.64-4.5-6.32V4a1.5 1.5 0 1 0-3 0v.68C7.63 5.36 6 7.92 6 11v5l-2 2h16l-2-2z" fill="#6f4e37" /></svg>
          <AlertBadge count={beehive.unread} status={status} />
        </button>

        {/* Three-dot menu */}
        <div style={{ position: "relative" }}>
          <button onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }} title="More actions"
            style={{ width: 28, height: 28, borderRadius: 5, border: "none", background: "transparent", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="5" r="1.5" fill="#888" /><circle cx="12" cy="12" r="1.5" fill="#888" /><circle cx="12" cy="19" r="1.5" fill="#888" /></svg>
          </button>
          {menuOpen && (
            <div style={{ position: "absolute", right: 0, top: 32, background: "white", border: "1px solid #e0d5c8", borderRadius: 8, padding: 4, boxShadow: "0 6px 16px rgba(0,0,0,0.12)", zIndex: 30, minWidth: 130 }}>
              {([
                { label: "View", icon: "👁️", action: onView, danger: false },
                { label: "Edit", icon: "✏️", action: onEdit, danger: false },
                { label: "Delete", icon: "🗑️", action: onDelete, danger: true },
              ] as const).map(({ label, icon, action, danger }) => (
                <button key={label} onClick={(e) => { e.stopPropagation(); setMenuOpen(false); action(); }}
                  style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "7px 10px", background: "transparent", border: "none", borderRadius: 5, textAlign: "left", cursor: "pointer", fontSize: 13, color: danger ? "#d43c3c" : "#3a2a1a" }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "#f5f0e8")}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "transparent")}
                >
                  <span>{icon}</span>{label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Sensor stats */}
      <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
        <StatPill value={beehive.temperature ?? "—"} unit={beehive.temperature != null ? "°C" : ""} label="temp" />
        <StatPill value={beehive.humidity ?? "—"} unit={beehive.humidity != null ? "%" : ""} label="humid" />
        <StatPill value={beehive.weight ?? "—"} unit={beehive.weight != null ? "kg" : ""} label="weight" />
      </div>

      {/* Coords */}
      <div style={{ fontSize: 10, color: "#b0a090", display: "flex", alignItems: "center", gap: 3 }}>
        📍 {beehive.lng.toFixed(5)}, {beehive.lat.toFixed(5)}
      </div>
    </li>
  );
}

// ─── Modal helpers ────────────────────────────────────────────────────────────

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10000 }}>
      {children}
    </div>
  );
}

function ModalBox({ children, width = 480 }: { children: React.ReactNode; width?: number | string }) {
  return (
    <div style={{ background: "white", borderRadius: 10, width, maxHeight: "85vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 16px 48px rgba(0,0,0,0.18)" }}>
      {children}
    </div>
  );
}

function ModalHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid #eee", flexShrink: 0, background: "#fafafa" }}>
      <h3 style={{ margin: 0, fontSize: "1rem", color: "#0d6efd" }}>{title}</h3>
      <button onClick={onClose} style={{ border: "none", background: "transparent", cursor: "pointer", width: 28, height: 28, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 6 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M18.3 5.71a1 1 0 0 0-1.41 0L12 10.59 7.11 5.7A1 1 0 0 0 5.7 7.11L10.59 12l-4.89 4.89a1 1 0 1 0 1.41 1.41L12 13.41l4.89 4.89a1 1 0 0 0 1.41-1.41L13.41 12l4.89-4.89a1 1 0 0 0 0-1.4z" fill="#333" /></svg>
      </button>
    </div>
  );
}

// ─── SVG/marker helpers ───────────────────────────────────────────────────────

async function getSvgDataUrl(type?: string): Promise<string | undefined> {
  const key = type || "default";
  (window as any).__beeSvgCache = (window as any).__beeSvgCache || {};
  if ((window as any).__beeSvgCache[key]) return (window as any).__beeSvgCache[key];
  const candidates = type ? [`/images/${type}.svg`, "/images/norBee.svg"] : ["/images/norBee.svg"];
  for (const p of candidates) {
    try {
      const r = await fetch(p);
      if (r.ok) {
        const data = "data:image/svg+xml;utf8," + encodeURIComponent(await r.text());
        (window as any).__beeSvgCache[key] = data;
        return data;
      }
    } catch {}
  }
}

async function buildMarkerEl(name: string, iconType?: string): Promise<HTMLElement> {
  const el = document.createElement("div");
  const svgUrl = await getSvgDataUrl(iconType);
  if (svgUrl) {
    const img = document.createElement("img");
    img.src = svgUrl; img.alt = name; img.style.cssText = "width:28px;height:28px;transform:translateY(-6px);display:block;user-select:none;";
    el.appendChild(img);
  } else {
    el.innerHTML = "🐝"; el.style.cssText = "font-size:22px;line-height:22px;transform:translateY(-2px);";
  }
  return el;
}

// ─── BeehiveList (main export) ────────────────────────────────────────────────

export default function BeehiveList({ mapRef, onRequestMapClick }: BeehiveListProps) {
  // ── state ──────────────────────────────────────────────────────────────────
const [beehives, setBeehives] = useState<EnrichedBeehive[]>([]);
  const [notifications, setNotifications] = useState<NotificationMap>({});
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | Status>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // modals
  const [formModal, setFormModal] = useState<{ open: boolean; mode: "create" | "edit"; id?: string; lng?: number; lat?: number; name?: string }>({ open: false, mode: "create" });
  const [confirmDelete, setConfirmDelete] = useState<{ open: boolean; id?: string; name?: string }>({ open: false });
  const [viewData, setViewData] = useState<any | null>(null);
  const [notifModal, setNotifModal] = useState<{ open: boolean; beehiveId?: string; name?: string }>({ open: false });

  // add-mode UI
  const [addMenuOpen, setAddMenuOpen] = useState(false);

  // markers
  const markersRef = useRef<Record<string, maplibregl.Marker>>({});

  // ── marker helpers ─────────────────────────────────────────────────────────

  const getMap = (): MapLibreMap | null => mapRef.current ?? null;

  const renderMarker = async (b: Beehive, iconType?: string) => {
    const map = getMap();
    if (!map) return;

    if (markersRef.current[b.id]) {
      markersRef.current[b.id].remove();
    }

    try {
      const el = await buildMarkerEl(b.name, iconType);

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([b.lng, b.lat])
        .setPopup(new maplibregl.Popup({ offset: 10 }).setText(b.name));

      marker.addTo(map);

      markersRef.current[b.id] = marker;
    } catch (e) {
      console.warn("renderMarker error", e);
    }
  };

  const updateMarkerIcon = async (id: string, iconType?: string) => {
    const marker = markersRef.current[id]; if (!marker) return;
    try {
      const el = marker.getElement();
      const svgUrl = await getSvgDataUrl(iconType);
      if (svgUrl) {
        let img = el.querySelector("img") as HTMLImageElement | null;
        if (!img) { el.innerHTML = ""; img = document.createElement("img"); el.appendChild(img); }
        img.src = svgUrl; img.style.cssText = "width:28px;height:28px;transform:translateY(-6px);display:block;user-select:none;";
      } else { el.innerHTML = "🐝"; }
    } catch {}
  };

  const removeMarker = (id: string) => {
    try { markersRef.current[id]?.remove(); } catch {}
    delete markersRef.current[id];
  };

  // ── load beehives on mount ─────────────────────────────────────────────────

// ── load beehives on mount ─────────────────────────────────────────────────
// BeehiveList.tsx 
  
const subscribedRef = useRef<Set<string>>(new Set());

const notificationCacheRef = useRef<Set<string>>(new Set());

// Adds a notification to the specified hive, preventing duplicates based on content
const addNotification = (
  hiveId: string,
  title: string,
  body: string
) => {
  const key = `${hiveId}-${title}-${body}`;

  // prevent spam duplicate notifications
  if (notificationCacheRef.current.has(key)) {
    return;
  }

  notificationCacheRef.current.add(key);

  const n: Notification = {
    id: `${hiveId}-${Date.now()}`,
    title,
    body,
    time: new Date().toLocaleString(),
    read: false,
  };

  setNotifications((prev) => ({
    ...prev,
    [hiveId]: [n, ...(prev[hiveId] ?? [])],
  }));
};

useEffect(() => {
  const unsubscribers: (() => void)[] = [];

  beehives.forEach((hive) => {
    // prevent duplicate subscriptions
    if (subscribedRef.current.has(hive.id)) return;

    subscribedRef.current.add(hive.id);

const unsub = subscribeToSensorData(hive.id, async (newData) => {
  if (!newData) return;

  const temp = Number(newData.temperature ?? 0);
  const hum = Number(newData.humidity ?? 0);

  const latestStatus = await getLatestStatusData(hive.id);

  console.log("STATUS:", latestStatus);

  const label =
    latestStatus?.label?.toLowerCase() || "";

  // QUEEN DETECTION
  const queenLost =
    label.includes("queen") &&
    (
      label.includes("missing") ||
      label.includes("absent") ||
      label.includes("lost")
    );

  let issues = 0;
  let icon = "norBee";
  let hiveUiStatus: Status = "ok";

  // ===== QUEEN LOST =====
  if (queenLost) {
    issues = 999;
    hiveUiStatus = "alert";
    icon = "noqueen";

    addNotification(
      hive.id,
      "Critical Alert",
      `${hive.name} queen bee missing`
    );
  } else {
    // TEMP LOW
    if (temp < 25) {
      issues++;
      hiveUiStatus = "warn";
      icon = "coldbee";

      addNotification(
        hive.id,
        "Cold Warning",
        `${hive.name} temperature too low (${temp}°C)`
      );
    }

    // TEMP HIGH
    if (temp > 35) {
      issues++;
      hiveUiStatus = "warn";
      icon = "hotbee";

      addNotification(
        hive.id,
        "Heat Warning",
        `${hive.name} temperature too high (${temp}°C)`
      );
    }

    // HUMIDITY
    if (hum > 95) {
      issues++;
      hiveUiStatus = "warn";
      icon = "wetbee";

      addNotification(
        hive.id,
        "Humidity Warning",
        `${hive.name} humidity too high (${hum}%)`
      );
    }

    // MULTIPLE ISSUES
    if (issues >= 2) {
      hiveUiStatus = "alert";
      icon = "noqueen";
    }

    if (issues === 0) {
      hiveUiStatus = "ok";
      icon = "norBee";
    }
  }

  // UPDATE HIVE STATE
  setBeehives((prev) =>
    prev.map((b) =>
      b.id === hive.id
        ? {
            ...b,
            temperature: temp,
            humidity: hum,
            weight: Number(newData.weight ?? 0),
            status: hiveUiStatus,
          }
        : b
    )
  );

  // UPDATE ICON
  try {
    await updateMarkerIcon(hive.id, icon);
  } catch (err) {
    console.error("Icon update failed", err);
  }
});

    unsubscribers.push(() => {
      subscribedRef.current.delete(hive.id);
      unsub();
    });
  });

  return () => {
    unsubscribers.forEach((u) => u());
  };
}, [beehives.length]);
  useEffect(() => {
    (async () => {
      try {
        // 1. Get basic beehive list from Firebase
        const list = await getBeehives();

        // 2. Fetch latest sensor data for every hive to "enrich" them
        const enrichedList = await Promise.all(
          list.map(async (hive) => {
            const sensor = await getLatestSensorData(hive.id);
            return {
              ...hive,
              temperature: sensor?.temperature || 0,
              humidity: sensor?.humidity || 0,
              weight: sensor?.weight || 0,
              unread: 0, 
              status: "ok",
              statusData: (hive as any).status,
            } as EnrichedBeehive;
          })
        );

        // 3. Update the state with the ENRICHED list (contains sensors)
        setBeehives(enrichedList);

        // 4. Initialize notifications based on the loaded list
        setNotifications(() => {
          const next: NotificationMap = {};
          enrichedList.forEach((b) => {
            const count = Math.floor(Math.random() * 3);
            next[b.id] = Array.from({ length: count }, (_, i) => ({
              id: `${b.id}-n-${i}`,
              title: i === 0 ? "Temperature alert" : "Reminder",
              body: i === 0 ? `High temp at ${b.name}` : `Weekly check for ${b.name}`,
              time: new Date(Date.now() - i * 3600000).toLocaleString(),
              read: false,
            }));
          });
          return next;
        });

        // 5. Render markers on the map for the enriched hives
        enrichedList.forEach((b) => renderMarker(b));

      } catch (e: any) {
        console.error("Load failed", e);
      }
    })();
  }, [mapRef]); // mapRef ensures the map is ready before we draw markers

  // ── keep markers in sync with beehives state ───────────────────────────────

  useEffect(() => {
    const map = getMap(); if (!map) return;
    const ids = new Set(beehives.map((b) => b.id));
    // remove stale
    for (const id of Object.keys(markersRef.current)) {
      if (!ids.has(id)) removeMarker(id);
    }
    // add/update
    beehives.forEach((b) => {
      const m = markersRef.current[b.id];
      if (m) { try { m.setLngLat([b.lng, b.lat]); m.setPopup(new maplibregl.Popup({ offset: 10 }).setText(b.name)); } catch { removeMarker(b.id); renderMarker(b); } }
      else { renderMarker(b); }
    });
  }, [beehives, mapRef.current]);

  // ── auto notification every 5s ─────────────────────────────────────────────


  // ── CRUD handlers ──────────────────────────────────────────────────────────

  const handleFormSave = async () => {
    const { mode, id, name, lng, lat } = formModal;
    if (!name?.trim()) { alert("Please enter a name"); return; }
    if (mode === "create") {
      if (typeof lng !== "number" || typeof lat !== "number") { alert("Invalid coordinates"); return; }
      try {
        const saved = await saveBeehive({ id: Date.now().toString(), name: name.trim(), lng, lat });
        setBeehives((s) => [
          ...s,
          {
            ...saved,
            temperature: 0,
            humidity: 0,
            weight: 0,
            unread: 0,
            status: "ok",
          },
        ]);
        renderMarker(saved);
        setFormModal({ open: false, mode: "create" });
      } catch (e: any) { alert("Save failed: " + e.message); }
    } else {
      if (!id) return;
      try {
        const updated = await updateBeehive(id, { name: name.trim(), lng, lat });
        setBeehives((s) => s.map((x) => (x.id === id ? { ...x, ...updated } : x)));
        setFormModal({ open: false, mode: "create" });
      } catch (e: any) { alert("Update failed: " + e.message); }
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteBeehive(id);
      setBeehives((s) => s.filter((x) => x.id !== id));
      removeMarker(id);
    } catch (e: any) { alert("Delete failed: " + e.message); }
  };

  // ── telemetry view ─────────────────────────────────────────────────────────

const openView = async (b: Beehive) => {
  try {
    const historyData = await getSensorHistory(b.id);

    const formatTime = (timestamp: any) => {
      if (!timestamp) return "--:--";

      let date: Date;

      // ISO string format
      if (typeof timestamp === "string") {
        date = new Date(timestamp);
      }
      // UNIX seconds format
      else {
        date = new Date(Number(timestamp) * 1000);
      }

      // invalid safety
      if (isNaN(date.getTime())) {
        return "--:--";
      }

    return date.toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    };


    const parseTimeValue = (timestamp: any) => {
      if (!timestamp) return 0;

      // ISO string
      if (typeof timestamp === "string") {
        const t = new Date(timestamp).getTime();
        return isNaN(t) ? 0 : t;
      }

      // UNIX seconds
      return Number(timestamp) * 1000;
    };

    const readings = historyData
      ? Object.values(historyData).sort(
          (a: any, b: any) =>
            parseTimeValue(a.timestamp) -
            parseTimeValue(b.timestamp)
        )
      : [];

    const makeSeries = (
      readings: any[],
      field: string,
      fallback?: string
    ) => {
      return readings
        .filter((r: any) =>
          r[field] !== undefined ||
          (fallback && r[fallback] !== undefined)
        )
        .map((r: any) => ({
        time: formatTime(r.timestamp),

          value:
            r[field] !== undefined
              ? Number(r[field])
              : Number(r[fallback ?? ""] ?? 0),
        }));
    };

    setViewData({
      id: b.id,
      name: b.name,

      temperature: makeSeries(readings, "temperature", "temp"),

      humidity: makeSeries(readings, "humidity", "hum"),

      weight: makeSeries(readings, "weight"),
    });
  } catch (e) {
    console.error("Failed to load chart data:", e);
  }
};
  // ── add-hive flow ──────────────────────────────────────────────────────────

const handleUseMyLocation = () => {
  setAddMenuOpen(false);
  
  // Geolocation requires HTTPS — on plain HTTP it will always be blocked by the browser
  if (window.location.protocol === 'http:' && window.location.hostname !== 'localhost') {
    alert('📍 "Use my location" requires HTTPS.\n\nUse "Click on map to place" instead while on the local network.');
    return;
  }

  if (!navigator.geolocation) {
    alert('Geolocation is not available in this browser.');
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => setFormModal({ open: true, mode: 'create', lng: pos.coords.longitude, lat: pos.coords.latitude, name: '' }),
    (err) => alert('Location error: ' + err.message),
    { enableHighAccuracy: true, timeout: 10000 }
  );
};

  const handleClickOnMap = () => {
    setAddMenuOpen(false);
    if (!onRequestMapClick) { alert("Map click mode not available"); return; }
    onRequestMapClick((lng, lat) => {
      setFormModal({ open: true, mode: "create", lng, lat, name: "" });
    });
  };

  // ── enriched + filtered list ───────────────────────────────────────────────

  const enriched = useMemo<EnrichedBeehive[]>(() =>
    beehives.map((h) => {
      const notifs = notifications[h.id] ?? [];
      const unread = notifs.filter((n) => !n.read).length;

      return {
        ...h,
        unread,
        status: h.status ?? "ok",
      };
    }),
    [beehives, notifications]
  );

  const visible = useMemo(() => {
    let list = enriched;
    if (search.trim()) { const q = search.trim().toLowerCase(); list = list.filter((h) => h.name.toLowerCase().includes(q)); }
    if (filter !== "all") list = list.filter((h) => h.status === filter);
    const order: Record<Status, number> = { alert: 0, warn: 1, ok: 2 };
    return [...list].sort((a, b) => order[a.status] !== order[b.status] ? order[a.status] - order[b.status] : b.unread - a.unread);
  }, [enriched, search, filter]);

  const alertCount = enriched.filter((h) => h.status === "alert").length;
  const warnCount  = enriched.filter((h) => h.status === "warn").length;

  const chips: Array<{ key: "all" | Status; label: string; color?: string }> = [
    { key: "all",   label: `All (${enriched.length})` },
    { key: "alert", label: `Critical (${alertCount})`,                       color: "#d43c3c" },
    { key: "warn",  label: `Warning (${warnCount})`,                          color: "#e8a020" },
    { key: "ok",    label: `Healthy (${enriched.length - alertCount - warnCount})`, color: "#3a9e6e" },
  ];

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ width: "100%", height: "100%", background: "#fff", display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif", userSelect: "none" }}>

      {/* Header */}
      <div style={{ padding: "10px 12px 8px", borderBottom: "0.5px solid rgba(0,0,0,0.07)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 500, color: "#9a8070", textTransform: "uppercase", letterSpacing: "0.05em" }}>My hives</span>

          {/* Add hive button + dropdown */}
          <div style={{ position: "relative" }}>
            <button onClick={() => setAddMenuOpen((v) => !v)}
              style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 500, color: "#6f4e37", background: "rgba(111,78,55,0.1)", border: "1px solid rgba(111,78,55,0.25)", borderRadius: 6, padding: "4px 8px", cursor: "pointer" }}>
              + Add hive
            </button>
            {addMenuOpen && (
              <div style={{ position: "absolute", right: 0, top: 32, background: "white", border: "1px solid #e0d5c8", borderRadius: 8, padding: 4, boxShadow: "0 6px 16px rgba(0,0,0,0.12)", zIndex: 100, minWidth: 170, whiteSpace: "nowrap" }}>
                <button onClick={handleUseMyLocation} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "7px 10px", background: "transparent", border: "none", borderRadius: 5, textAlign: "left", cursor: "pointer", fontSize: 13, color: "#3a2a1a" }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "#f5f0e8")}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "transparent")}>
                  📍 Use my location
                </button>
                <button onClick={handleClickOnMap} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "7px 10px", background: "transparent", border: "none", borderRadius: 5, textAlign: "left", cursor: "pointer", fontSize: 13, color: "#3a2a1a" }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "#f5f0e8")}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "transparent")}>
                  🗺️ Click on map to place
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Search */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#f5f0e8", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 7, padding: "5px 8px" }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}><circle cx="11" cy="11" r="7" stroke="#b0a090" strokeWidth="2" /><path d="m16.5 16.5 4 4" stroke="#b0a090" strokeWidth="2" strokeLinecap="round" /></svg>
          <input type="text" placeholder="Search hives…" value={search} onChange={(e) => setSearch(e.target.value)}
            style={{ border: "none", background: "transparent", outline: "none", fontSize: 12, color: "#4a3728", width: "100%" }} />
          {search && <button onClick={() => setSearch("")} style={{ border: "none", background: "transparent", cursor: "pointer", color: "#b0a090", fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>}
        </div>
      </div>

      {/* Filter chips */}
      <div style={{ display: "flex", gap: 5, padding: "7px 12px", borderBottom: "0.5px solid rgba(0,0,0,0.06)", flexShrink: 0 }}>
        {chips.map(({ key, label, color }) => (
          <button key={key} onClick={() => setFilter(key)}
            style={{ fontSize: 10, padding: "3px 7px", borderRadius: 20, border: filter === key ? `1px solid ${color ?? "#6f4e37"}` : "1px solid rgba(0,0,0,0.1)", background: filter === key ? (color ?? "#6f4e37") : "#f5f0e8", color: filter === key ? "#fff" : (color ?? "#7a6050"), cursor: "pointer", fontWeight: filter === key ? 600 : 400, transition: "all 0.12s", whiteSpace: "nowrap" }}>
            {label}
          </button>
        ))}
      </div>

      {/* Hive list */}
      <ul style={{ flex: 1, overflowY: "auto", padding: "8px 8px 4px", margin: 0 }}>
        {visible.length === 0 && (
          <li style={{ listStyle: "none", padding: "20px 8px", textAlign: "center", color: "#b0a090", fontSize: 13 }}>
            {search ? "No hives match your search." : "No hives found."}
          </li>
        )}
        {visible.map((hive) => (
          <HiveCard key={hive.id} beehive={hive} isSelected={selectedId === hive.id}
            onSelect={() => { setSelectedId(hive.id); const m = getMap(); if (m) try { m.flyTo({ center: [hive.lng, hive.lat], zoom: 16 }); } catch {} }}
            onEdit={() => setFormModal({ open: true, mode: "edit", id: hive.id, lng: hive.lng, lat: hive.lat, name: hive.name })}
            onDelete={() => setConfirmDelete({ open: true, id: hive.id, name: hive.name })}
            onView={() => openView(hive)}
            onBellClick={() => {
              setNotifModal({ open: true, beehiveId: hive.id, name: hive.name });
              setNotifications((prev) => ({ ...prev, [hive.id]: (prev[hive.id] ?? []).map((n) => ({ ...n, read: true })) }));
              updateMarkerIcon(hive.id);
            }}
          />
        ))}
      </ul>

      {/* Footer */}
      <div style={{ padding: "7px 12px", borderTop: "0.5px solid rgba(0,0,0,0.07)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <span style={{ fontSize: 11, color: "#9a8070" }}><strong style={{ color: "#6f4e37" }}>{enriched.length}</strong> hives{alertCount > 0 && <>{" · "}<strong style={{ color: "#d43c3c" }}>{alertCount} critical</strong></>}</span>
        <span style={{ fontSize: 11, color: "#9a8070" }}>{filter !== "all" ? `${visible.length} shown` : "sort: alerts ↓"}</span>
      </div>

      {/* ── Form modal (create / edit) ──────────────────────────────────────── */}
      {formModal.open && (
        <Overlay>
          <ModalBox width={480}>
            <ModalHeader title={formModal.mode === "create" ? "Add beehive" : "Edit beehive"} onClose={() => setFormModal({ open: false, mode: "create" })} />
            <div style={{ padding: 16, overflowY: "auto" }}>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: "block", fontSize: "0.9rem", marginBottom: 4, fontWeight: 500 }}>Name</label>
                <input className="form-control" autoFocus value={formModal.name ?? ""} onChange={(e) => setFormModal((s) => ({ ...s, name: e.target.value }))}
                  style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #ddd", fontSize: 14, boxSizing: "border-box" }} />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: "0.9rem", marginBottom: 4, fontWeight: 500 }}>Longitude, Latitude</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <input className="form-control" value={formModal.lng ?? ""} onChange={(e) => setFormModal((s) => ({ ...s, lng: Number(e.target.value) }))} placeholder="Longitude"
                    style={{ flex: 1, padding: "6px 8px", borderRadius: 6, border: "1px solid #ddd", fontSize: 14 }} />
                  <input className="form-control" value={formModal.lat ?? ""} onChange={(e) => setFormModal((s) => ({ ...s, lat: Number(e.target.value) }))} placeholder="Latitude"
                    style={{ flex: 1, padding: "6px 8px", borderRadius: 6, border: "1px solid #ddd", fontSize: 14 }} />
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button onClick={() => setFormModal({ open: false, mode: "create" })} style={{ padding: "6px 14px", borderRadius: 6, border: "1px solid #ddd", background: "white", cursor: "pointer" }}>Cancel</button>
                <button onClick={handleFormSave} style={{ padding: "6px 14px", borderRadius: 6, border: "none", background: "#6f4e37", color: "white", cursor: "pointer", fontWeight: 600 }}>
                  {formModal.mode === "create" ? "Add" : "Save"}
                </button>
              </div>
            </div>
          </ModalBox>
        </Overlay>
      )}

      {/* ── Confirm delete modal ────────────────────────────────────────────── */}
      {confirmDelete.open && (
        <Overlay>
          <ModalBox width={320}>
            <ModalHeader title="Confirm delete" onClose={() => setConfirmDelete({ open: false })} />
            <div style={{ padding: 16 }}>
              <p style={{ margin: "0 0 16px", fontSize: 14 }}>Delete beehive "<strong>{confirmDelete.name}</strong>"? This cannot be undone.</p>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button onClick={() => setConfirmDelete({ open: false })} style={{ padding: "6px 14px", borderRadius: 6, border: "1px solid #ddd", background: "white", cursor: "pointer" }}>Cancel</button>
                <button onClick={async () => { if (confirmDelete.id) await handleDelete(confirmDelete.id); setConfirmDelete({ open: false }); }}
                  style={{ padding: "6px 14px", borderRadius: 6, border: "none", background: "#d43c3c", color: "white", cursor: "pointer", fontWeight: 600 }}>Delete</button>
              </div>
            </div>
          </ModalBox>
        </Overlay>
      )}

      {/* ── View (telemetry) modal ──────────────────────────────────────────── */}
      {viewData && (
        <Overlay>
          <ModalBox width="80vw">
            <ModalHeader title={viewData.name ?? viewData.id} onClose={() => setViewData(null)} />
            <div style={{ padding: 16, overflowY: "auto", flex: 1 }}>
              <div className="bee-view-chart-main">
                {[
                    { label: "Temperature", key: "temperature", color: "#ff6b6b", unit: "°C" },
                    { label: "Humidity",    key: "humidity",    color: "#4da6ff", unit: "%" },
                    { label: "Weight",      key: "weight",      color: "#00cc44", unit: "Kg" },
                ].map(({ label, key, color, unit }) => (
                  <div key={key} className="bee-view-chart-item">
                    <h4 style={{ marginBottom: 6 }}>{label}</h4>
                    <LineChart series={viewData[key] ?? []} color={color} height={140} />
                    <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
                      <thead><tr className="bee-view-chart-tbl-row-title"><th style={{ textAlign: "center", color: "#3e78ff", fontWeight: "bold" }}>Time</th><th style={{ textAlign: "center", color: "#3e78ff", fontWeight: "bold" }}>{unit}</th></tr></thead>
                      <tbody>
                        {(viewData[key] ?? [])
                          .slice(-20)
                          .reverse()
                          .map((t: any, i: number) => (
                            <tr key={i}>
                              <td style={{ padding: "4px 8px" }}>
                                {t.time}
                              </td>

                              <td style={{ padding: "4px 8px" }}>
                                {t.value}
                              </td>
                            </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            </div>
          </ModalBox>
        </Overlay>
      )}

      {/* ── Notifications modal ─────────────────────────────────────────────── */}
      {notifModal.open && (
        <Overlay>
          <ModalBox width={420}>
            <ModalHeader title={`Notifications — ${notifModal.name}`} onClose={() => setNotifModal({ open: false })} />
            <div style={{ padding: "8px 0", display: "flex", justifyContent: "flex-end", paddingRight: 12, flexShrink: 0 }}>
              <button onClick={() => { if (!notifModal.beehiveId) return; const bid = notifModal.beehiveId; setNotifications((p) => { const c = { ...p }; delete c[bid]; return c; }); updateMarkerIcon(bid); }}
                style={{ fontSize: 12, padding: "3px 10px", borderRadius: 6, border: "1px solid #d43c3c", background: "white", color: "#d43c3c", cursor: "pointer" }}>
                Clear all
              </button>
            </div>
            <div style={{ padding: "0 12px 12px", overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
              {(notifModal.beehiveId && (notifications[notifModal.beehiveId] ?? []).length > 0) ? (
                (notifications[notifModal.beehiveId] ?? []).map((n) => (
                  <div key={n.id} style={{ padding: 10, border: "1px solid #eee", borderRadius: 6, background: n.read ? "#fff" : "#fff9f9" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <strong style={{ fontSize: 13 }}>{n.title}</strong>
                      <small style={{ color: "#888" }}>{n.time}</small>
                    </div>
                    <div style={{ fontSize: 13, color: "#333", marginBottom: 6 }}>{n.body}</div>
                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                      <button onClick={() => { const bid = notifModal.beehiveId; if (!bid) return; setNotifications((p) => { const c = { ...p }; c[bid] = (c[bid] ?? []).filter((x) => x.id !== n.id); if (!c[bid]?.length) updateMarkerIcon(bid); return c; }); }}
                        style={{ fontSize: 12, padding: "2px 8px", borderRadius: 5, border: "1px solid #d43c3c", background: "white", color: "#d43c3c", cursor: "pointer" }}>
                        Delete
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ padding: 12, color: "#666", textAlign: "center" }}>No notifications</div>
              )}
            </div>
          </ModalBox>
        </Overlay>
      )}
    </div>
  );
}
