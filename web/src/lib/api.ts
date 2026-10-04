import { middleOfUSA } from "./constants";

export interface LocationResponse {
  status: string;
  country: string;
  countryCode: string;
  region: string;
  regionName: string;
  city: string;
  zip: string;
  lat: number;
  lon: number;
  timezone: string;
  isp: string;
  org: string;
  as: string;
  query: string;
}

export async function getLocation() {
  try {
    const response = await fetch("http://ip-api.com/json/");
    const json = (await response.json() as LocationResponse);
    if (typeof json.lat === "number" && typeof json.lon === "number") {
      return [json.lon, json.lat];
    }
  } catch {}
  return middleOfUSA;
}

// ---------------------------------------------------------
// --------------------- FIREBASE CONFIG --------------------
// ---------------------------------------------------------
const FB_BASE =
  "https://testing-4cc77-default-rtdb.asia-southeast1.firebasedatabase.app";
const FB_TOKEN = "DJEHZBDC41oUYcyp3alfd6xK4VNgeo6ObUYJD3am";


// ---------------------------------------------------------
// ---------------------- INTERFACES ------------------------
// ---------------------------------------------------------

// ---------------------------------------------------------
// ---------------------- SAVE BEEHIVE ----------------------
// ---------------------------------------------------------
export async function saveBeehive(b: {
  name: string;
  id: string; // <--- add this
  lng: number;
  lat: number;
}): Promise<Beehive> {
  const url = `${FB_BASE}/beehives/${b.id}.json?auth=${FB_TOKEN}`;

  const beehiveData = {
    name: b.name,
    lng: b.lng,
    lat: b.lat,
    createdAt: new Date().toISOString()
  };

  const resp = await fetch(url, {
    method: "PUT", // <--- use PUT instead of POST
    headers: { "content-type": "application/json" },
    body: JSON.stringify(beehiveData),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Firebase returned ${resp.status}: ${text}`);
  }

  return {
    id: b.id,
    ...beehiveData,
  };
}


// ---------------------------------------------------------
// ---------------------- GET BEEHIVES ----------------------
// ---------------------------------------------------------
export interface Beehive {
  id: string;       // Firebase custom ID
  name: string;
  lat: number;
  lng: number;
  createdAt: string;
}

export async function getBeehives(): Promise<Beehive[]> {
  const url = `${FB_BASE}/beehives.json?auth=${FB_TOKEN}`;

  const resp = await fetch(url);
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Firebase returned ${resp.status}: ${text}`);
  }

  const data = await resp.json();
  if (!data) return [];

  // Map each entry to include the Firebase key as id
  return Object.entries(data).map(([firebaseId, value]: any) => ({
    id: firebaseId,    // this is the custom ID like "1763535317891"
    name: value.name,
    lat: value.lat,
    lng: value.lng,
    createdAt: value.createdAt,
  }));
}


// ---------------------------------------------------------
// ---------------------- DELETE BEEHIVE --------------------
// ---------------------------------------------------------
export async function deleteBeehive(id: string): Promise<void> {
  const url = `${FB_BASE}/beehives/${id}.json?auth=${FB_TOKEN}`;

  const resp = await fetch(url, { method: "DELETE" });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Firebase returned ${resp.status}: ${text}`);
  }
}

// ---------------------------------------------------------
// ---------------------- UPDATE BEEHIVE --------------------
// ---------------------------------------------------------
export async function updateBeehive(
  id: string,
  data: Partial<Pick<Beehive, "name" | "lng" | "lat">>
): Promise<Beehive> {
  const url = `${FB_BASE}/beehives/${id}.json?auth=${FB_TOKEN}`;

  const resp = await fetch(url, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Firebase returned ${resp.status}: ${text}`);
  }

  const json = await resp.json();
  return { id, ...json };
}



// ---------------------------------------------------------
// ---------------------- GET LATEST SENSOR DATA --------------------
// ---------------------------------------------------------
export async function getLatestSensorData(hiveId: string) {
  // Use fetch instead of the SDK functions
  const url = `${FB_BASE}/sensor_data/${hiveId}.json?auth=${FB_TOKEN}&orderBy="timestamp"&limitToLast=1`;
  try {
    const resp = await fetch(url);
    const data = await resp.json();
    if (!data || Object.keys(data).length === 0) return null;
    const key = Object.keys(data)[0];
    return data[key];
  } catch (e) {
    return null;
  }
}

export async function getSensorHistory(hiveId: string) {
  const url = `${FB_BASE}/sensor_data/${hiveId}.json?auth=${FB_TOKEN}`;
  try {
    const resp = await fetch(url);
    return await resp.json();
  } catch (e) {
    return {};
  }
}

export function subscribeToSensorData(
  hiveId: string,
  onUpdate: (data: any) => void
) {
  let active = true;

  const poll = async () => {
    while (active) {
      try {
        const latest = await getLatestSensorData(hiveId);

        if (latest) {
          onUpdate(latest);
        }
      } catch (e) {
        console.error("Polling error:", e);
      }

      // refresh every 2 seconds
      await new Promise((r) => setTimeout(r, 2000));
    }
  };

  poll();

  return () => {
    active = false;
  };
}

//helper to parse timestamp from sensor data (which can be either string or number)
export function parseTimestamp(timestamp: any): Date | null {
  if (!timestamp) return null;

  let date: Date;

  if (typeof timestamp === "string") {
    date = new Date(timestamp);
  } else {
    date = new Date(Number(timestamp) * 1000);
  }

  return isNaN(date.getTime()) ? null : date;
}

// ---------------------------------------------------------
// ---------------------- GET STATUS DATA -------------------
// ---------------------------------------------------------

export async function getLatestStatusData(hiveId: string) {
  const url =
    `${FB_BASE}/beehives/${hiveId}/status.json?auth=${FB_TOKEN}`;

  try {
    const resp = await fetch(url);
    const data = await resp.json();

    if (!data) return null;

    const values = Object.values(data) as any[];

    if (values.length === 0) return null;

    // newest status
    values.sort(
      (a: any, b: any) =>
        Number(b?.timestamp || 0) -
        Number(a?.timestamp || 0)
    );

    return values[0];
  } catch (e) {
    console.error("Failed to load status", e);
    return null;
  }
}