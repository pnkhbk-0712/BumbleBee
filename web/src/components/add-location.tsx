import { useEffect, useState, useRef } from "react";
import maplibregl from "maplibre-gl";
import { useMap } from "@vis.gl/react-maplibre";
import { Beehive as BeehiveType, getBeehives, saveBeehive, deleteBeehive, updateBeehive } from "../lib/api";
// telemetry sample data (not required — we'll synthesize if missing)


interface AddLocationControlProps {
  beehives: BeehiveType[];
  setBeehives: React.Dispatch<React.SetStateAction<BeehiveType[]>>;
}

export default function AddLocationControl({ beehives, setBeehives }: AddLocationControlProps) {

  const [panelPos, setPanelPos] = useState({ x: 12, y: 12 });
  const draggingRef = useRef(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const { current: map } = useMap();
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  // keep map of id -> Marker so we can remove/update markers
  const markersRef = useRef<Record<string, any>>({});
  // modal form state for create/edit
  const onMouseDown = (e: React.MouseEvent) => {
  draggingRef.current = true;
  dragOffsetRef.current = {
    x: e.clientX - panelPos.x,
    y: e.clientY - panelPos.y,
  };
  e.preventDefault();
};

useEffect(() => {
  const onMouseMove = (e: MouseEvent) => {
    if (!draggingRef.current) return;
    setPanelPos({
      x: e.clientX - dragOffsetRef.current.x,
      y: e.clientY - dragOffsetRef.current.y,
    });
  };

  const onMouseUp = () => {
    draggingRef.current = false;
  };

  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("mouseup", onMouseUp);

  return () => {
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
  };
}, [panelPos]);

  const [formModal, setFormModal] = useState<{
    open: boolean;
    mode: 'create' | 'edit';
    id?: string;
    lng?: number;
    lat?: number;
    name?: string;
  }>({ open: false, mode: 'create' });
  // confirm delete modal
  const [confirmDelete, setConfirmDelete] = useState<{ open: boolean; id?: string; name?: string }>({ open: false });
  // view modal state (show hive telemetry)
  const [viewData, setViewData] = useState<any | null>(null);
  // per-beehive notifications (in-memory demo)
  const [notifications, setNotifications] = useState<Record<string, Array<{ id: string; title: string; body: string; time: string; read: boolean }>>>({});
  const [notifModal, setNotifModal] = useState<{ open: boolean; beehiveId?: string; name?: string }>({ open: false });
  // which beehive's inline menu (view/edit/delete) is open
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  // when set to an id, next map click will move that beehive (enter move-on-map mode)
  const [moveModeForId, setMoveModeForId] = useState<string | null>(null);


  /*--------------------------------- change beehive icon BEGIN ---------------------*/
  // Helper: fetch an SVG from public/images and cache it per `type` key on window.
  // `type` can be e.g. 'norBee', 'queen-lost', 'high-temp' and should map to
  // `/images/${type}.svg`. Falls back to `/images/norBee.svg` or emoji.
  async function getSvgDataUrl(type?: string) {
    const key = type || 'default';
    (window as any).__beeSvgDataUrl = (window as any).__beeSvgDataUrl || {};
    if ((window as any).__beeSvgDataUrl[key]) return (window as any).__beeSvgDataUrl[key];

    const candidates = type ? [`/images/${type}.svg`, '/images/norBee.svg'] : ['/images/norBee.svg'];
    for (const p of candidates) {
      try {
        const resp = await fetch(p);
        if (resp.ok) {
          const text = await resp.text();
          const data = 'data:image/svg+xml;utf8,' + encodeURIComponent(text);
          (window as any).__beeSvgDataUrl[key] = data;
          return data;
        }
      } catch {}
    }
    return undefined;
  }

  // Update the icon for an existing marker (by id). If marker DOM element can't
  // be updated, re-render the marker using `renderMarker` when available.
  async function updateMarkerIcon(id: string, iconType?: string) {
    const m = markersRef.current[id];
    if (!m) {
      console.warn('updateMarkerIcon: no marker for id', id);
      return;
    }

    const getMarkerElement = (marker: any): HTMLElement | null => {
      if (!marker) return null;
      if (typeof marker.getElement === 'function') {
        try { return marker.getElement(); } catch {}
      }
      if (typeof marker.getEl === 'function') {
        try { return marker.getEl(); } catch {}
      }
      if (marker._element) return marker._element;
      if (marker._el) return marker._el;
      if (marker.element && marker.element instanceof HTMLElement) return marker.element as HTMLElement;
      // if the stored value *is* already an HTMLElement
      if (marker instanceof HTMLElement) return marker as HTMLElement;
      return null;
    };

    const el = getMarkerElement(m);
    const svgDataUrl = await getSvgDataUrl(iconType);
    if (el) {
      try {
        let img = el.querySelector && (el.querySelector('img') as HTMLImageElement | null);
        if (svgDataUrl) {
          if (!img) {
            el.innerHTML = '';
            img = document.createElement('img');
            el.appendChild(img);
          }
          img.src = svgDataUrl;
          img.alt = id;
          img.style.width = '28px';
          img.style.height = '28px';
          img.style.transform = 'translateY(-6px)';
          img.style.display = 'block';
          img.style.userSelect = 'none';
        } else {
          el.innerHTML = '🐝';
          el.style.fontSize = '22px';
          el.style.lineHeight = '22px';
          el.style.transform = 'translateY(-2px)';
        }
        return;
      } catch (e) {
        console.warn('updateMarkerIcon failed to update DOM, will re-render', e);
      }
    }

    // fallback: try to re-render marker using existing beehive data
    const b = beehives.find((x) => x.id === id);
    if (b) setTimeout(() => { try { (renderMarker as any)(b, iconType); } catch {} }, 0);
  }

  // Render a marker for a beehive, optionally using a specific icon type (file
  // under public/images/{iconType}.svg). This is a standalone renderer used when
  // adding markers initially or re-creating them.
  async function renderMarker(b: BeehiveType, iconType?: string) {
    if (!map) return;
    try {
      const svgDataUrl = await getSvgDataUrl(iconType);

      const el = document.createElement('div');
      if (svgDataUrl) {
        const img = document.createElement('img');
        img.src = svgDataUrl;
        img.alt = b.name;
        img.style.width = '28px';
        img.style.height = '28px';
        img.style.transform = 'translateY(-6px)';
        img.style.display = 'block';
        img.style.userSelect = 'none';
        el.appendChild(img);
      } else {
        el.innerHTML = '🐝';
        el.style.fontSize = '22px';
        el.style.lineHeight = '22px';
        el.style.transform = 'translateY(-2px)';
      }

      console.log(`Rendering beehive marker ${b.name} at ${b.lng},${b.lat}`);

      const marker = new maplibregl.Marker({ element: el as any })
        .setLngLat([b.lng, b.lat])
        .setPopup(new maplibregl.Popup({ offset: 10 }).setText(b.name));

      const targetMap = (map as any)?.getMap ? (map as any).getMap() : ((map as any)?.map ? (map as any).map : map);
      try {
        if (targetMap && typeof marker.addTo === 'function') {
          marker.addTo(targetMap as any);
        } else if (map && map.getContainer) {
          const container = map.getContainer ? map.getContainer() : (map as any).getContainer ? (map as any).getContainer() : null;
          if (container) {
            container.appendChild(el);
          }
        }
      } catch (err) {
        try { marker.addTo(map as any); } catch (e) { console.warn('Failed to add marker via addTo', e); }
      }

      try {
        markersRef.current[b.id] = marker;
        console.log('renderMarker: stored marker for', b.id, marker);
      } catch {}
    } catch (err) {
      console.warn('renderMarker error', err);
    }
  }

  /*--------------------------------- change beehive icon END ---------------------*/

  // load persisted beehives on map ready
  useEffect(() => {
    if (!map) return;
    (async () => {
      try {
        const existing = await getBeehives();
        setBeehives(existing);
        existing.forEach((b) => renderMarker(b));
        // initialize demo notifications for each beehive if none exist
        setNotifications((prev) => {
          const next = { ...prev };
          existing.forEach((b) => {
            if (!next[b.id]) {
              const now = Date.now();
              const count = Math.floor(Math.random() * 3); // 0-2 demo notifications
              const arr = [] as Array<{ id: string; title: string; body: string; time: string; read: boolean }>;
              for (let i = 0; i < count; i++) {
                const ts = new Date(now - i * 60 * 60 * 1000);
                arr.push({ id: `${b.id}-n-${i}-${Math.random().toString(36).slice(2,6)}`, title: i === 0 ? 'New temperature alert' : 'Reminder', body: i === 0 ? `Temperature exceeded threshold for ${b.name}` : `Weekly check reminder for ${b.name}`, time: ts.toLocaleString(), read: false });
              }
              next[b.id] = arr;
            }
          });
          return next;
        });
      } catch {
        // ignore
      }
    })();
  }, [map]);

  // Demo: periodically generate a notification for a random beehive every ~20 seconds
  useEffect(() => {
    if (!beehives || beehives.length === 0) return;

    /*--------------------------------- change beehive icon BEGIN ---------------------*/
  // notification types and mapping to image filenames in public/images
    const NOTIF_TYPES: Array<{ key: string; title: string; body: (name: string) => string; icon?: string }> = [
        { key: 'temperature', title: 'Temperature alert', body: (n) => `High temperature detected at ${n}`, icon: 'hotbee' },
      { key: 'humidity', title: 'Humidity alert', body: (n) => `High humidity detected at ${n}`, icon: 'wetbee' },
      { key: 'queen-lost', title: 'Queen lost', body: (n) => `Possible queen loss at ${n}`, icon: 'noqueen' },
    
    ];
 

  //   const iv = setInterval(() => {
  //     try {
  //       const idx = Math.floor(Math.random() * beehives.length);
  //       const b = beehives[idx];
  //       if (!b) return;
  //       const n = {
  //         id: `${b.id}-auto-${Date.now()}`,
  //         title: 'Auto alert',
  //         body: `Auto-generated notification for ${b.name} testing`,
  //         time: new Date().toLocaleString(),
  //         read: false,
  //       };
  //       setNotifications((prev) => {
  //         const copy = { ...prev };
  //         copy[b.id] = [n].concat(copy[b.id] || []);
  //         return copy;
  //       });
  //       // optional: briefly flash the notif modal if it's open for this beehive
  //     } catch (e) {
  //       console.warn('auto-notif err', e);
  //     }
  //   }, 20000);
  //   return () => clearInterval(iv);
  // }, [beehives]);
    const iv = setInterval(async () => {
      try {
        const idx = Math.floor(Math.random() * beehives.length);
        const b = beehives[idx];
        if (!b) return;

        // pick random notification type
        const t = NOTIF_TYPES[Math.floor(Math.random() * NOTIF_TYPES.length)];
        const n = {
          id: `${b.id}-auto-${Date.now()}`,
          title: t.title,
          body: t.body(b.name),
          time: new Date().toLocaleString(),
          read: false,
        };

        setNotifications((prev) => {
          const copy = { ...prev };
          copy[b.id] = [n].concat(copy[b.id] || []);
          return copy;
        });

        // update marker icon according to notification type; resets after 15s
        try {
          console.log('auto-notif -> type:', t.key, 'icon:', t.icon, 'for', b.id);
          console.log(t.icon);
          if (t.icon) await updateMarkerIcon(b.id, t.icon);
          else await updateMarkerIcon(b.id);
          setTimeout(() => { try { updateMarkerIcon(b.id); } catch {} }, 15000);
        } catch (e) {
          console.warn('failed to update marker icon for notif', e);
        }

      } catch (e) {
        console.warn('auto-notif err', e);
      }
    }, 5000);
    return () => clearInterval(iv);
  }, [beehives]);

   /*--------------------------------- change beehive icon END ---------------------*/

  // Keep markers in sync whenever beehives array changes.
  // This ensures markers are created for new beehives, updated for changed coords/name,
  // and removed when beehives are deleted.
  useEffect(() => {
    if (!map) return;
    const ids = new Set(beehives.map((b) => b.id));

    // remove stale markers
    for (const id of Object.keys(markersRef.current)) {
      if (!ids.has(id)) {
        try { markersRef.current[id].remove(); } catch {}
        delete markersRef.current[id];
      }
    }

    // add or update markers
    beehives.forEach((b) => {
      const m = markersRef.current[b.id];
      if (m) {
        try {
          m.setLngLat([b.lng, b.lat]);
          m.setPopup(new maplibregl.Popup({ offset: 10 }).setText(b.name));
        } catch (e) {
          // fallback: re-render marker
          try { m.remove(); } catch {}
          renderMarker(b);
        }
      } else {
        renderMarker(b);
      }
    });
  }, [beehives, map]);

  // const renderMarker = async (b: BeehiveType) => {
  //   if (!map) return;
  //   try {
  //     // load SVG once and reuse as data URL to avoid path issues
  //     let svgDataUrl = (window as any).__beeSvgDataUrl as string | undefined;
  //     if (!svgDataUrl) {
  //       try {
  //         // try to fetch the svg from public
  //         const resp = await fetch('/images/norBee.svg');
  //         if (resp.ok) {
  //           const text = await resp.text();
  //           svgDataUrl = 'data:image/svg+xml;utf8,' + encodeURIComponent(text);
  //           (window as any).__beeSvgDataUrl = svgDataUrl;
  //         }
  //       } catch {
  //         // ignore fetch errors, we'll fallback later
  //       }
  //     }

  //     // create element for marker
  //     const el = document.createElement('div');
  //     if (svgDataUrl) {
  //       const img = document.createElement('img');
  //       img.src = svgDataUrl;
  //       img.alt = b.name;
  //       img.style.width = '28px';
  //       img.style.height = '28px';
  //       img.style.transform = 'translateY(-6px)';
  //       img.style.display = 'block';
  //       img.style.userSelect = 'none';
  //       el.appendChild(img);
  //     } else {
  //       // fallback to emoji
  //       el.innerHTML = '🐝';
  //       el.style.fontSize = '22px';
  //       el.style.lineHeight = '22px';
  //       el.style.transform = 'translateY(-2px)';
  //     }

  //     console.log(`Rendering beehive marker ${b.name} at ${b.lng},${b.lat}`);

  //     const marker = new maplibregl.Marker({ element: el as any })
  //       .setLngLat([b.lng, b.lat])
  //       .setPopup(new maplibregl.Popup({ offset: 10 }).setText(b.name));

  //     // `map` may be a wrapper object from @vis.gl/react-maplibre; try to get the raw map instance.
  //     const targetMap = (map as any)?.getMap ? (map as any).getMap() : ((map as any)?.map ? (map as any).map : map);
  //     try {
  //       if (targetMap && typeof marker.addTo === 'function') {
  //         marker.addTo(targetMap as any);
  //       } else if (map && map.getContainer) {
  //         // Fallback: manually append the element to the map container
  //         const container = map.getContainer ? map.getContainer() : (map as any).getContainer ? (map as any).getContainer() : null;
  //         if (container) {
  //           container.appendChild(el);
  //         }
  //       }
  //     } catch (err) {
  //       // Some map wrappers don't match the exact MapLibre API; try addTo(map) as last resort
  //       try { marker.addTo(map as any); } catch (e) { console.warn('Failed to add marker via addTo', e); }
  //     }

  //     // store marker reference so we can remove or update later
  //     try {
  //       markersRef.current[b.id] = marker;
  //     } catch {}
  //   } catch (err) {
  //     console.warn('renderMarker error', err);
  //   }
  // };

  const addBeehive = async (b: { id: string; name: string; lng: number; lat: number }) => {
    if (!map) return;
    try {
      const saved = await saveBeehive(b);
      setBeehives((s) => [...s, saved]);
      renderMarker(saved);
    } catch (err) {
      console.error('saveBeehive error', err);
      const message = err && (err as any).message ? (err as any).message : String(err);
      alert('Unable to save beehive: ' + message);
    }
  };

  const handleFormSave = async () => {
    if (!formModal.open) return;
    const { mode, id, name, lng, lat } = formModal;
    if (!name || typeof name !== 'string' || name.trim() === '') {
      alert('Please enter a name');
      return;
    }
    if (mode === 'create') {
      if (typeof lng !== 'number' || typeof lat !== 'number') {
        alert('Invalid coordinates');
        return;
      }
      const newId = Date.now().toString(); // <--- generate custom ID

      await addBeehive({ id: newId, name: name.trim(), lng, lat });
      setFormModal({ open: false, mode: 'create' });
    } else {
      if (!id) return;
      try {
        const updated = await updateBeehive(id, { name: name.trim(), lng, lat });
        if (!updated) throw new Error('not found');
        setBeehives((s) => s.map((x) => (x.id === id ? updated : x)));
        // update marker
        const m = markersRef.current[id];
        if (m) {
          try {
            if (typeof lng === 'number' && typeof lat === 'number') m.setLngLat([lng, lat]);
            m.setPopup(new maplibregl.Popup({ offset: 10 }).setText(updated.name));
          } catch {
            try { m.remove(); } catch {}
            renderMarker(updated);
          }
        } else {
          renderMarker(updated);
        }
        setFormModal({ open: false, mode: 'create' });
      } catch (err) {
          console.error('updateBeehive error', err);
          const message = err && (err as any).message ? (err as any).message : String(err);
          alert('Unable to update beehive: ' + message);
      }
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteBeehive(id);
      setBeehives((s) => s.filter((x) => x.id !== id));
      const m = markersRef.current[id];
      if (m && typeof m.remove === 'function') {
        try { m.remove(); } catch {}
      }
      delete markersRef.current[id];
    } catch (err) {
        console.error('deleteBeehive error', err);
        const message = err && (err as any).message ? (err as any).message : String(err);
        alert('Unable to delete beehive: ' + message);
    }
  };

  const handleEdit = async (b: BeehiveType) => {
    // open edit modal instead of prompt
    setFormModal({ open: true, mode: 'edit', id: b.id, lng: b.lng, lat: b.lat, name: b.name });
  };

  // show telemetry/view modal for a beehive by id (or name fallback)
  const handleView = (id: string, name?: string) => {
    // Generate lightweight synthetic telemetry if we don't have real data in beeData.json
    // or always generate random data for demo purposes.
    const makeSeries = (points = 24, min = 15, max = 35, variance = 2) => {
      const arr: Array<{ time: string; value: number }> = [];
      const now = Date.now();
      const step = Math.round((60 * 60 * 1000)); // 1 hour
      let base = (min + max) / 2;
      for (let i = points - 1; i >= 0; i--) {
        const ts = new Date(now - i * step);
        const hh = ts.getHours().toString().padStart(2, '0');
        const mm = ts.getMinutes().toString().padStart(2, '0');
        // small random walk
        base += (Math.random() - 0.5) * variance;
        const v = Math.max(min, Math.min(max, Number((base + (Math.random() - 0.5) * variance).toFixed(2))));
        arr.push({ time: `${hh}:${mm}`, value: v });
      }
      return arr;
    };

    const temp = makeSeries(24, 15, 35, 1.8);
    const hum = makeSeries(24, 30, 90, 3).map((p) => ({ time: p.time, value: Math.round(p.value) }));
    const weight = makeSeries(24, 20, 40, 1.8);
    setViewData({ id, name, temperature: temp, humidity: hum,  Weight: weight});
  };

  // Small inline SVG line chart component for the modal
  // Accepts `width` as number (px) or string (e.g. '50%'). For percentage widths we draw
  // using a fixed virtual width and expose it via viewBox so the SVG scales responsively.
  const LineChart = ({ series, color = '#ff6b6b', width = 220, height = 100 }: { series: Array<{ time: string; value: number }>; color?: string; width?: number | string; height?: number }) => {
    if (!series || series.length === 0) return <div style={{ width: typeof width === 'number' ? width : '100%', height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>No data</div>;

    // virtualWidth is the internal drawing width used for coordinates; when `width` is a percentage
    // we keep a stable virtual width and let the SVG scale via viewBox. If a numeric width is
    // provided we use that for both drawing and the width attribute.
    const virtualWidth = typeof width === 'number' ? width : 480;
    const svgWidthAttr = typeof width === 'number' ? width : (width || '100%');

    const values = series.map((s) => s.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const padLeft = 8;
    const padTop = 8;
    const padBottom = 18; // reserve space for x-axis labels
    const w = virtualWidth - padLeft * 2;
    const h = height - padTop - padBottom;
    const stepX = w / Math.max(1, series.length - 1);
    const points = series.map((s, i) => {
      const x = padLeft + i * stepX;
      const y = padTop + (max === min ? h / 2 : h - ((s.value - min) / (max - min)) * h);
      return `${x},${y}`;
    }).join(' ');
    const pathD = series.map((s, i) => {
      const x = padLeft + i * stepX;
      const y = padTop + (max === min ? h / 2 : h - ((s.value - min) / (max - min)) * h);
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    }).join(' ');

    // draw a few horizontal grid lines with labels
    const ticks = max === min ? 1 : 4;
    const tickLines: Array<{ y: number; value: number }> = [];
    if (max === min) {
      tickLines.push({ y: padTop + h / 2, value: max });
    } else {
      for (let i = 0; i <= ticks; i++) {
        const y = padTop + (i / ticks) * h;
        const value = Number((max - (i / ticks) * (max - min)).toFixed(1));
        tickLines.push({ y, value });
      }
    }

    return (
      <svg width={svgWidthAttr} height={height} viewBox={`0 0 ${virtualWidth} ${height}`} preserveAspectRatio="xMidYMid meet" style={{ display: 'block' }}>
        <rect x={0} y={0} width={virtualWidth} height={height} rx={6} fill="#fff" stroke="#eee" />
        {/* grid lines + labels */}
        {tickLines.map((t, i) => (
          <g key={i}>
            <line x1={padLeft} x2={virtualWidth - padLeft} y1={t.y} y2={t.y} stroke="#f0f0f0" strokeWidth={1} />
            <text x={4} y={t.y + 4} fontSize={10} fill="#666">{t.value}</text>
          </g>
        ))}

        {/* curve */}
        <polyline points={points} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <path d={pathD} fill="none" stroke={color} strokeWidth={2} strokeOpacity={0.12} />
        {/* area under curve */}
        <path d={`${pathD} L ${padLeft + (series.length - 1) * stepX} ${padTop + h} L ${padLeft} ${padTop + h} Z`} fill={color} fillOpacity={0.08} />

        {/* x-axis ticks and labels */}
        {(() => {
          const maxXTicks = Math.min(6, series.length);
          const labels: Array<{ x: number; label: string }> = [];
          if (series.length > 0) {
            for (let i = 0; i < maxXTicks; i++) {
              const idx = Math.round((i * (series.length - 1)) / (maxXTicks - 1));
              const x = padLeft + idx * stepX;
              labels.push({ x, label: series[idx].time });
            }
          }
          return labels.map((t, i) => (
            <g key={`x-${i}`}>
              <line x1={t.x} x2={t.x} y1={padTop + h} y2={padTop + h + 6} stroke="#ccc" strokeWidth={1} />
              <text x={t.x} y={padTop + h + 16} fontSize={10} fill="#666" textAnchor="middle">{t.label}</text>
            </g>
          ));
        })()}
      </svg>
    );
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not available in this browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lng = pos.coords.longitude;
        const lat = pos.coords.latitude;
        // open create modal with coords
        setFormModal({ open: true, mode: 'create', lng, lat, name: '' });
      },
      (err) => {
        alert("Unable to get current location: " + err.message);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // close inline menu when clicking outside
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const id = menuOpenId;
      if (!id) return;
      const target = e.target as HTMLElement | null;
      if (!target) return;
      // if click inside the menu/button for this id, keep it open
      const inside = target.closest && (target.closest(`[data-menu-id="${id}"]`) as HTMLElement | null);
      if (!inside) setMenuOpenId(null);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpenId]); 

  if (!map) return null;

  return (
    /* Position absolute so the control is inside the .main-map container (not fixed to the viewport) */
    <div
      style={{
        position: "absolute",
        left: panelPos.x,
        top: panelPos.y,
        zIndex: 10,
        cursor: "move",
      }}
      onMouseDown={onMouseDown}
    >

      <div style={{ background: "white", padding: 8, borderRadius: 6, boxShadow: "0 1px 6px rgba(0,0,0,0.2)", fontFamily: "sans-serif" }}>
        <div style={{ marginBottom: 6 }}>
          <button className="btn btn-outline-danger btn-sm me-2" onClick={() => setOpen((v) => !v)}>
            {open ? "Close" : "Add beehive"}
          </button>
          {open && (
            <>
              <button className="btn btn-outline-primary btn-sm me-2" onClick={useMyLocation}>Use my location</button>
              <button className="btn btn-outline-primary btn-sm me-2" onClick={() => setPicking(true)}>Click on map to place</button>
            </>
          )}
        </div>

        {beehives.length > 0 && (
          <div style={{ fontSize: 12 }}>
            {/* <strong>Beehives:</strong> */}
            <ul style={{ margin: 6, paddingLeft: 16 }}>
              {beehives.map((b) => (
                <li key={b.id} style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
                  <span
                    role="button"
                    className="btn btn-outline-primary btn-sm me-2"
                    tabIndex={0}
                    onMouseDown={(e) => e.preventDefault()} /* prevent focus caret */
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        try { (map as any).flyTo({ center: [b.lng, b.lat], zoom: 16 }); } catch {}
                      }
                    }}
                    onClick={() => {
                      if (!map) return;
                      try {
                        (map as any).flyTo({ center: [b.lng, b.lat], zoom: 16 });
                      } catch {
                        // ignore
                      }
                      //setOpenId(openId === b.id ? null : b.id); // toggle box open/close
                    }}
                    style={{ cursor: 'pointer', flex: 1, userSelect: 'none', outline: 'none' }}
                    title={`Zoom to ${b.name}`}
                  >
                    {b.name} — {b.lng.toFixed(5)}, {b.lat.toFixed(5)}
                  </span>

                  {openId === b.id && (
                    <div
                      style={{
                        position: "absolute",
                        left: "100%",
                        marginLeft: 10,
                        background: "white",
                        border: "1px solid #ccc",
                        borderRadius: 8,
                        padding: 10,
                        boxShadow: "0 4px 8px rgba(0,0,0,0.1)",
                        minWidth: 150,
                        zIndex: 10,
                      }}
                    >
                      <strong>{b.name}</strong>
                      <div>Temperature: {b.lng.toFixed(5)}</div>
                      <div>Huminity: {b.lat.toFixed(5)}</div>
                      <button
                        className="btn btn-sm btn-light"
                        onClick={() => setOpenId(null)}
                        style={{ marginTop: 8, fontSize: 12 }}
                      >
                        Close
                      </button>
                    </div>
                  )}

                  <div style={{ position: 'relative', display: 'flex', gap: 6, marginLeft: 5 }}>
                    {/* Notification button (bell) with unread badge */}
                    <button       
                      className="bee-btn-menu"             
                      onClick={(e) => { 
                        e.stopPropagation();
                        setNotifModal({ open: true, beehiveId: b.id, name: b.name });
                        // mark all as read when opening modal
                        setNotifications((prev) => {
                          const copy = { ...prev };
                          if (copy[b.id]) copy[b.id] = copy[b.id].map(n => ({ ...n, read: true }));
                          return copy;
                        });
                        /*--------------------------------- change beehive icon BEGIN ---------------------*/
                        try { updateMarkerIcon(b.id); } catch {}
                        /*--------------------------------- change beehive icon END ---------------------*/
                      }}
                      title="Notifications"
                      style={{ width: 36, height: 36, padding: 4, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: '1px solid #ddd', background: 'white', position: 'relative' }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 22a2 2 0 0 0 2-2H10a2 2 0 0 0 2 2zm6-6V11c0-3.07-1.63-5.64-4.5-6.32V4a1.5 1.5 0 1 0-3 0v.68C7.63 5.36 6 7.92 6 11v5l-1.99 2H20l-2-2z" fill="#333"/>
                      </svg>
                      {((notifications[b.id] || []).filter(n => !n.read).length > 0) && (
                        <span style={{ cursor: 'pointer', position: 'absolute', top: 2, right: 2, minWidth: 16, height: 16, padding: '0 4px', background: '#c62828', color: 'white', borderRadius: 10, fontSize: 11, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                          {(notifications[b.id] || []).filter(n => !n.read).length}
                        </span>
                      )}
                    </button>
                    <button
                     className="bee-btn-menu" 
                      onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === b.id ? null : b.id); }}
                      data-menu-id={b.id}
                      aria-haspopup="true"
                      aria-expanded={menuOpenId === b.id}
                      title="Actions"
                      style={{ width: 36, height: 36, padding: 4, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: '1px solid #ddd', background: 'white' }}
                    >
                      {/* vertical ellipsis icon */}
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="12" cy="5" r="1.5" fill="#333" />
                        <circle cx="12" cy="12" r="1.5" fill="#333" />
                        <circle cx="12" cy="19" r="1.5" fill="#333" />
                      </svg>
                    </button>

                    {menuOpenId === b.id && (
                      <div
                        data-menu-id={b.id}
                        role="menu"
                        aria-label={`Actions for ${b.name}`}
                        style={{ position: 'absolute', right: 0, top: '36px', background: 'white', border: '1px solid #ddd', borderRadius: 6, padding: 6, boxShadow: '0 6px 12px rgba(0,0,0,0.12)', zIndex: 20, minWidth: 140 }}
                      >
                        <button
                          role="menuitem"
                          className="bee-menu-item-beehive"
                          onClick={(e) => { e.stopPropagation(); setMenuOpenId(null); handleView(b.id, b.name); }}
                          style={{ display: 'flex', gap: 8, alignItems: 'center', width: '100%', padding: '6px 8px', background: 'white', border: 'none', textAlign: 'left', cursor: 'pointer' }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 5c-7 0-11 7-11 7s4 7 11 7 11-7 11-7-4-7-11-7zm0 12a5 5 0 1 1 0-10 5 5 0 0 1 0 10z" fill="#333"/><circle cx="12" cy="12" r="2.5" fill="#fff"/></svg>
                          View
                        </button>
                        <button
                          role="menuitem"
                          className="bee-menu-item-beehive"
                          onClick={(e) => { e.stopPropagation(); setMenuOpenId(null); handleEdit(b); }}
                          style={{ display: 'flex', gap: 8, alignItems: 'center', width: '100%', padding: '6px 8px', background: 'white', border: 'none', textAlign: 'left', cursor: 'pointer' }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z" fill="#333"/><path d="M20.71 7.04a1.003 1.003 0 0 0 0-1.42l-2.34-2.34a1.003 1.003 0 0 0-1.42 0l-1.83 1.83 3.75 3.75 1.84-1.82z" fill="#333"/></svg>
                          Edit
                        </button>
                        <button
                          role="menuitem"
                          className="bee-menu-item-beehive"
                          onClick={(e) => { e.stopPropagation(); setMenuOpenId(null); setConfirmDelete({ open: true, id: b.id, name: b.name }); }}
                          style={{ display: 'flex', gap: 8, alignItems: 'center', width: '100%', padding: '6px 8px', background: 'white', border: 'none', textAlign: 'left', cursor: 'pointer' }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12z" fill="#333333"/><path d="M19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" fill="#333333"/></svg>
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Form modal for create/edit */}
      {formModal.open && (
        <div style={{ position: 'fixed', left: 0, top: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
          <div style={{ background: 'white', padding: 16, borderRadius: 8, width: 480 }}>
            <h3 style={{ marginTop: 0 }}>{formModal.mode === 'create' ? 'Add beehive' : 'Edit beehive'}</h3>
            <div style={{ marginBottom: 8 }}>
              <label className="form-label" style={{ display: 'block', fontSize: '1rem' }}>Name</label>
              <input className="form-control" autoFocus value={formModal.name ?? ''} onChange={(e) => setFormModal((s) => ({ ...s, name: e.target.value }))} style={{ width: '95%', padding: 6 }} />
            </div>
            <div className="mb-3" style={{ marginBottom: 8 }}>
              <label style={{ display: 'block', fontSize: '1rem' }}>Longitude, Latitude</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="form-control" value={formModal.lng ?? ''} onChange={(e) => setFormModal((s) => ({ ...s, lng: Number(e.target.value) }))} style={{ flex: 1, padding: 6, width: 120 }} />
                <input className="form-control" value={formModal.lat ?? ''} onChange={(e) => setFormModal((s) => ({ ...s, lat: Number(e.target.value) }))} style={{ flex: 1, padding: 6, width: 120 }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              {formModal.mode === 'edit' && (
                <button onClick={() => {
                  // enter move-on-map mode for this id
                  if (formModal.id) {
                    setMoveModeForId(formModal.id);
                    setFormModal((s) => ({ ...s, open: false }));
                    alert('Click on the map to choose a new location for the beehive');
                  }
                }} style={{ marginRight: 'auto' }} className="btn btn-outline-success btn-sm">Move on map</button>
              )}
                <button className="btn btn-secondary btn-sm" onClick={() => setFormModal({ open: false, mode: 'create' })}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={handleFormSave}>{formModal.mode === 'create' ? 'Add' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {/* View modal for telemetry */}
      {viewData && (
        <div style={{ position: 'fixed', left: 0, top: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
              <div style={{ background: 'white', borderRadius: 8, width: '80vw', maxHeight: '80vh', position: 'relative', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fafafa', zIndex: 2, padding: '12px 16px', borderTopLeftRadius: 8, borderTopRightRadius: 8, borderBottom: '1px solid #eee', flex: '0 0 auto' }}>
                  <h3 style={{ margin: 0, color: 'rgb(13, 110, 253)' }}>{viewData?.name ?? viewData?.id ?? 'Unknown'}</h3>
                  <button
                    onClick={() => setViewData(null)}
                    aria-label="Close"
                    title="Close"
                    style={{
                      border: 'none',
                      background: 'transparent',
                      width: 32,
                      height: 32,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer'
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M18.3 5.71a1 1 0 0 0-1.41 0L12 10.59 7.11 5.7A1 1 0 0 0 5.7 7.11L10.59 12l-4.89 4.89a1 1 0 1 0 1.41 1.41L12 13.41l4.89 4.89a1 1 0 0 0 1.41-1.41L13.41 12l4.89-4.89a1 1 0 0 0 0-1.4z" fill="#333"/>
                    </svg>
                  </button>
                </div>
                <div style={{ padding: 16, overflowY: 'auto', flex: '1 1 auto' }}>
                  {viewData && viewData._notFound ? (
                    <div>
                      <p>No telemetry data found for this beehive (id: {viewData.id}, name: {viewData.name}).</p>
                    </div>
                  ) : (
                    <div className="bee-view-chart-main">
                      <div className="bee-view-chart-item">
                        <h4 style={{ marginBottom: 6 }}>Temperature</h4>
                        <LineChart series={(viewData?.temperature ?? [])} color="#ff6b6b" width={"100%"} height={140} />
                        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8 }}>
                          <thead>
                            <tr className="bee-view-chart-tbl-row-title"><th style={{ textAlign: 'center', color:'#3e78ff', fontWeight:"bold" }}>Time</th><th style={{ textAlign: 'center', color:'#3e78ff', fontWeight:"bold" }}>°C</th></tr>
                          </thead>
                          <tbody>
                            {(viewData?.temperature ?? []).map((t: any, i: number) => (
                              <tr key={i}><td style={{ padding: '4px 8px' }}>{t.time}</td><td style={{ padding: '4px 8px' }}>{t.value}</td></tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                        <div className="bee-view-chart-item">
                        <h4 style={{ marginBottom: 6 }}>Humidity</h4>
                        <LineChart series={(viewData?.humidity ?? [])} color="#4da6ff" width={"100%"} height={140} />
                        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8 }}>
                          <thead>
                            <tr className="bee-view-chart-tbl-row-title"><th style={{ textAlign: 'center', color:'#3e78ff', fontWeight:"bold" }}>Time</th><th style={{ textAlign: 'center', color:'#3e78ff', fontWeight:"bold" }}>%</th></tr>
                          </thead>
                          <tbody>
                            {(viewData?.humidity ?? []).map((h: any, i: number) => (
                              <tr key={i}><td style={{ padding: '4px 8px' }}>{h.time}</td><td style={{ padding: '4px 8px' }}>{h.value}</td></tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="bee-view-chart-item">
                        <h4 style={{ marginBottom: 6 }}>Weight</h4>
                        <LineChart series={(viewData?.Weight ?? [])} color="#00ff1eff" width={"100%"} height={140} />
                        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8 }}>
                          <thead>
                            <tr className="bee-view-chart-tbl-row-title"><th style={{ textAlign: 'center', color:'#3e78ff', fontWeight:"bold" }}>Time</th><th style={{ textAlign: 'center', color:'#3e78ff', fontWeight:"bold" }}>Kg</th></tr>
                          </thead>
                          <tbody>
                            {(viewData?.Weight ?? []).map((h: any, i: number) => (
                              <tr key={i}><td style={{ padding: '4px 8px' }}>{h.time}</td><td style={{ padding: '4px 8px' }}>{h.value}</td></tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
            
          </div>
        </div>
      )}

      {/* Notifications modal */}
      {notifModal.open && (
        <div style={{ position: 'fixed', left: 0, top: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
          <div style={{ background: 'white', borderRadius: 8, width: 420, maxHeight: '70vh', position: 'relative', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fafafa', zIndex: 2, padding: '12px 16px', borderTopLeftRadius: 8, borderTopRightRadius: 8, borderBottom: '1px solid #eee', flex: '0 0 auto' }}>
              <h3 style={{ margin: 0, fontSize:'1rem', color:'#0d6efd' }}>Notifications — {notifModal.name}</h3>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button className="btn btn-outline-danger btn-sm" onClick={() => {
                  // clear all notifications for this beehive
                  if (!notifModal.beehiveId) return;
                  /*--------------------------------- change beehive icon BEGIN ---------------------*/
                  const bid = notifModal.beehiveId;
                  setNotifications((prev) => {
                    const copy = { ...prev };
                    delete copy[bid!];
                    return copy;
                  });
                  try { updateMarkerIcon(bid!); } catch {}
                  /*--------------------------------- change beehive icon END ---------------------*/

                }} style={{ fontSize: 12 }}>Clear all</button>
                <button onClick={() => setNotifModal({ open: false })} aria-label="Close" title="Close" style={{ border: 'none', background: 'transparent', width: 32, height: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M18.3 5.71a1 1 0 0 0-1.41 0L12 10.59 7.11 5.7A1 1 0 0 0 5.7 7.11L10.59 12l-4.89 4.89a1 1 0 1 0 1.41 1.41L12 13.41l4.89 4.89a1 1 0 0 0 1.41-1.41L13.41 12l4.89-4.89a1 1 0 0 0 0-1.4z" fill="#333"/>
                  </svg>
                </button>
              </div>
            </div>
            <div style={{ padding: 12, overflowY: 'auto', flex: '1 1 auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(notifModal.beehiveId && (notifications[notifModal.beehiveId] || []).length > 0) ? (
                (notifications[notifModal.beehiveId] || []).map((n) => (
                  <div key={n.id} style={{ padding: 10, border: '1px solid #eee', borderRadius: 6, background: n.read ? '#fff' : '#fff9f9', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong>{n.title}</strong>
                      <small style={{ color: '#888' }}>{n.time}</small>
                    </div>
                    <div style={{ color: '#333' }}>{n.body}</div>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button className="btn btn-outline-danger btn-sm" onClick={() => {
                        // delete this notification
                        const bid = notifModal.beehiveId;
                        if (!bid) return;
                        setNotifications((prev) => {
                          const copy = { ...prev };
                          copy[bid] = (copy[bid] || []).filter((x: any) => x.id !== n.id);
                          /*--------------------------------- change beehive icon BEGIN ---------------------*/
                          // if none left, reset marker icon
                          if (!copy[bid] || copy[bid].length === 0) {
                            setTimeout(() => { try { updateMarkerIcon(bid); } catch {} }, 0);
                          }
                        /*--------------------------------- change beehive icon END ---------------------*/
                          return copy;
                        });
                      }} style={{ fontSize: 12 }}>Delete</button>
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ padding: 12, color: '#666' }}>No notifications</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Confirm delete modal */}
      {confirmDelete.open && (
        <div style={{ position: 'fixed', left: 0, top: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
          <div style={{ background: 'white', padding: 16, borderRadius: 8, width: 320 }}>
            <h3 style={{ marginTop: 0 }}>Confirm delete</h3>
            <p>Delete beehive "{confirmDelete.name}"?</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmDelete({ open: false })}>Cancel</button>
              <button onClick={async () => {
                if (!confirmDelete.id) return;
                await handleDelete(confirmDelete.id);
                setConfirmDelete({ open: false });
              }} style={{ fontWeight: 'bold' }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
