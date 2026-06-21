// Lightweight client-side device/browser detection (no extra dependencies).

export type DeviceInfo = {
  user_agent: string;
  device_type: string;
  device_name: string;
  browser: string;
  browser_version: string;
  os: string;
  os_version: string;
  language: string;
  timezone: string;
  screen_resolution: string;
};

export function getDeviceInfo(): DeviceInfo {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return {
      user_agent: "",
      device_type: "unknown",
      device_name: "unknown",
      browser: "unknown",
      browser_version: "",
      os: "unknown",
      os_version: "",
      language: "",
      timezone: "",
      screen_resolution: "",
    };
  }
  const ua = navigator.userAgent;
  const lower = ua.toLowerCase();

  // OS
  let os = "Unknown",
    os_version = "";
  if (/windows nt/i.test(ua)) {
    os = "Windows";
    const m = ua.match(/Windows NT ([\d.]+)/);
    if (m) os_version = m[1];
  } else if (/mac os x/i.test(ua)) {
    os = "macOS";
    const m = ua.match(/Mac OS X ([\d_\.]+)/);
    if (m) os_version = m[1].replace(/_/g, ".");
  } else if (/android/i.test(ua)) {
    os = "Android";
    const m = ua.match(/Android ([\d.]+)/);
    if (m) os_version = m[1];
  } else if (/iphone|ipad|ipod/i.test(ua)) {
    os = "iOS";
    const m = ua.match(/OS ([\d_]+)/);
    if (m) os_version = m[1].replace(/_/g, ".");
  } else if (/linux/i.test(ua)) {
    os = "Linux";
  }

  // Browser
  let browser = "Unknown",
    browser_version = "";
  const tests: [string, RegExp][] = [
    ["Edge", /edg\/([\d.]+)/i],
    ["Opera", /opr\/([\d.]+)/i],
    ["Chrome", /chrome\/([\d.]+)/i],
    ["Firefox", /firefox\/([\d.]+)/i],
    ["Safari", /version\/([\d.]+).*safari/i],
  ];
  for (const [name, re] of tests) {
    const m = ua.match(re);
    if (m) {
      browser = name;
      browser_version = m[1];
      break;
    }
  }

  // Device type
  let device_type = "desktop";
  if (/mobile|iphone|ipod/i.test(ua) && !/ipad/i.test(ua)) device_type = "mobile";
  else if (/tablet|ipad/i.test(ua)) device_type = "tablet";

  // Device name (best-effort)
  let device_name = `${os} ${device_type}`;
  if (/iphone/i.test(ua)) device_name = "iPhone";
  else if (/ipad/i.test(ua)) device_name = "iPad";
  else if (/macintosh/i.test(ua)) device_name = "Mac";
  else if (/windows/i.test(lower)) device_name = "Windows PC";
  else if (/android/i.test(lower)) {
    const m = ua.match(/;\s*([^;)]+)\s+Build/);
    device_name = m ? m[1].trim() : "Android Device";
  }

  return {
    user_agent: ua,
    device_type,
    device_name,
    browser,
    browser_version,
    os,
    os_version,
    language: navigator.language || "",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
    screen_resolution: `${window.screen.width}x${window.screen.height}`,
  };
}

export type GeoInfo = {
  ip_address: string;
  country: string;
  region: string;
  city: string;
};

export async function getGeoInfo(): Promise<GeoInfo> {
  try {
    const res = await fetch("https://ipapi.co/json/", { cache: "no-store" });
    if (!res.ok) throw new Error("geo failed");
    const j = await res.json();
    return {
      ip_address: String(j.ip ?? ""),
      country: String(j.country_name ?? j.country ?? ""),
      region: String(j.region ?? ""),
      city: String(j.city ?? ""),
    };
  } catch {
    // Fallback: just the IP.
    try {
      const r = await fetch("https://api.ipify.org?format=json", { cache: "no-store" });
      const j = await r.json();
      return { ip_address: String(j.ip ?? ""), country: "", region: "", city: "" };
    } catch {
      return { ip_address: "", country: "", region: "", city: "" };
    }
  }
}
