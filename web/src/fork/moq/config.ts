export function normalizeStreamKey(key: string): string {
  return decodeURIComponent(key).replace(/ /g, '_');
}

export const relayUrl = import.meta.env?.VITE_MOQ_RELAY_URL || 'https://moq-relay.cum.army';
