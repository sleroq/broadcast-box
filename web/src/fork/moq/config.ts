export function normalizeStreamKey(key: string): string {
  return decodeURIComponent(key).replace(/ /g, '_');
}

export function broadcastName(key: string): string {
  return `live/${key.endsWith('.hang') ? key : `${key}.hang`}`;
}

export const relayUrl = import.meta.env?.VITE_MOQ_RELAY_URL || 'https://moq-relay.cum.army';
