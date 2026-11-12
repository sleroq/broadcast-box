import { useEffect, useState } from 'react';
import { Broadcast, Net } from '@moq/watch';
import { relayUrl } from './config';

export function useMoqProbe(streamKey: string, enabled: boolean): boolean {
  const [live, setLive] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    const connection = new Net.Connection({ url: new URL(relayUrl) });
    const broadcast = new Broadcast({ origin: connection.origin, name: Net.Path.from(streamKey), enabled: true, announced: true });
    function update() { setLive(connection.status.peek() === 'connected' && !connection.error.peek() && broadcast.out.status.peek() === 'live'); }
    const unsubscribe = [connection.status.subscribe(update), connection.error.subscribe(update), broadcast.out.status.subscribe(update)];
    update();
    return () => {
      unsubscribe.forEach(dispose => dispose());
      broadcast.close();
      connection.close();
    };
  }, [streamKey, enabled]);
  return enabled && live;
}
