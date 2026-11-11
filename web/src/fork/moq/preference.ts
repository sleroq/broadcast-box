export type Protocol = 'webrtc' | 'moq';
function storageKey(key: string) { return `broadcast-box.protocol.${key}`; }

export function readPreference(key: string): Protocol {
  try {
    return localStorage.getItem(storageKey(key)) === 'moq' ? 'moq' : 'webrtc';
  } catch {
    return 'webrtc';
  }
}

export function savePreference(key: string, protocol: Protocol): void {
  try {
    localStorage.setItem(storageKey(key), protocol);
  } catch {
    // The current selection still works without storage.
  }
}
