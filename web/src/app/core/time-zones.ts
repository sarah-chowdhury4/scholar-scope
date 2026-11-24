/** A time zone as shown in a dropdown: the IANA name as the value, a readable label with the current UTC offset. */
export type TimeZoneOption = { value: string; label: string };
export type TimeZoneGroup = { region: string; zones: TimeZoneOption[] };

/** "GMT+6" style offset of a zone right now ("GMT" for UTC itself). Empty if the browser cannot say. */
function offsetOf(zone: string, at: Date): string {
  try {
    const part = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'shortOffset' })
      .formatToParts(at)
      .find((p) => p.type === 'timeZoneName');
    return part?.value.replace(/^GMT$/, 'UTC').replace(/^GMT/, 'UTC') ?? '';
  } catch {
    return '';
  }
}

/** "America/Argentina/Buenos_Aires" → "Argentina / Buenos Aires". */
function placeOf(zone: string): string {
  const rest = zone.includes('/') ? zone.slice(zone.indexOf('/') + 1) : zone;
  return rest.replace(/_/g, ' ').replace(/\//g, ' / ');
}

/**
 * Every time zone the browser knows, grouped by region ("Africa", "America", "Asia", …) for a <select>.
 * `extra` adds zones the list may lack, such as a saved "UTC", so the current value is always selectable.
 */
export function timeZoneGroups(extra: string[] = [], at = new Date()): TimeZoneGroup[] {
  const zones = new Set<string>(Intl.supportedValuesOf('timeZone'));
  zones.add('UTC');
  for (const z of extra) if (z) zones.add(z);
  const groups = new Map<string, TimeZoneOption[]>();
  for (const zone of zones) {
    const region = zone.includes('/') ? zone.slice(0, zone.indexOf('/')) : 'Other';
    const offset = offsetOf(zone, at);
    const label = zone === 'UTC' ? 'UTC (Coordinated Universal Time)' : `${placeOf(zone)}${offset ? ` (${offset})` : ''}`;
    groups.set(region, [...(groups.get(region) ?? []), { value: zone, label }]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === 'Other' ? 1 : b === 'Other' ? -1 : a.localeCompare(b)))
    .map(([region, list]) => ({ region, zones: list.sort((a, b) => a.label.localeCompare(b.label)) }));
}
