import { useRef, useState, type ComponentProps } from 'react';
import { ArrowsRightLeftIcon } from '@heroicons/react/24/outline';
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
  const switchLabel = `Switch to ${protocol === 'webrtc' ? 'MoQ' : 'WebRTC'}${otherLive ? ' (live)' : ''}`;
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
    <button
      type="button"
      aria-label={switchLabel}
      title={switchLabel}
      onClick={switchProtocol}
      onDoubleClick={event => event.stopPropagation()}
      className={`player-drag-cancel absolute top-2 left-2 z-70 p-2 rounded-full border cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-white ${protocol === 'moq' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-black/60 border-gray-700 text-gray-200 hover:bg-gray-800'}`}
    >
      <ArrowsRightLeftIcon aria-hidden="true" className="h-5 w-5" />
      {otherLive && <span aria-hidden="true" className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-gray-950 bg-green-400" />}
    </button>
  </div>;
}
