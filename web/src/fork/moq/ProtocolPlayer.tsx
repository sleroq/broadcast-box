import { useRef, useState, type ComponentProps } from 'react';
import Player from '../../components/player/Player';
import { normalizeStreamKey } from './config';
import { readPreference, savePreference, type Protocol } from './preference';
import { useMoqProbe } from './useMoqProbe';
import MoqPlayer from './MoqPlayer';

export type PlayerProps = ComponentProps<typeof Player>;

export default function ProtocolPlayer(props: PlayerProps) {
  const streamKey = normalizeStreamKey(props.streamKey);
  return <StreamPlayer key={streamKey} {...props} normalizedKey={streamKey} />;
}

function StreamPlayer({ normalizedKey, ...props }: PlayerProps & { normalizedKey: string }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [protocol, setProtocol] = useState<Protocol>(() => readPreference(normalizedKey));
  const [webrtcLive, setWebrtcLive] = useState(false);
  const moqLive = useMoqProbe(normalizedKey, protocol === 'webrtc');
  const otherLive = protocol === 'webrtc' ? moqLive : webrtcLive;
  const switchProtocol = () => {
    const next = protocol === 'webrtc' ? 'moq' : 'webrtc';
    savePreference(normalizedKey, next);
    setProtocol(next);
    setWebrtcLive(false);
  };
  function enterFullscreen() {
    void wrapperRef.current?.requestFullscreen();
  }
  return <div ref={wrapperRef} className={`relative w-full ${props.fillContainer ? 'h-full' : ''}`}>
    {protocol === 'webrtc' ? <Player {...props} /> : <MoqPlayer {...props} streamKey={normalizedKey} onWebrtcLiveChange={setWebrtcLive} onFullscreen={enterFullscreen} />}
    <button type="button" onClick={switchProtocol} onDoubleClick={event => event.stopPropagation()}
      className="player-drag-cancel absolute top-2 left-2 z-70 rounded-md bg-blue-950 px-2 py-1 text-sm text-white hover:bg-blue-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
      Switch to {protocol === 'webrtc' ? 'MoQ' : 'WebRTC'}{otherLive && <span className="ml-2 text-green-400">● Live</span>}
    </button>
  </div>;
}
