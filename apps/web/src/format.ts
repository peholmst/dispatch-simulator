export function formatTime(seconds: number | undefined): string {
  if (seconds === undefined) {
    return "-";
  }
  const rounded = Math.round(seconds);
  const minutes = Math.floor(rounded / 60).toString().padStart(2, "0");
  const remaining = (rounded % 60).toString().padStart(2, "0");
  return `${minutes}:${remaining}`;
}

export function formatCapabilities(capabilities: Record<string, number>): string {
  const entries = Object.entries(capabilities).filter(([, value]) => value > 0);
  return entries.length === 0 ? "none" : entries.map(([capability, value]) => `${capability} ${value}`).join(", ");
}

export function formatCoordinates(location: { lat: number; lon: number }): string {
  return `${location.lat.toFixed(4)}, ${location.lon.toFixed(4)}`;
}
