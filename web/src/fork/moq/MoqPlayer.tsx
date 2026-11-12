import { useEffect, useRef, useState, type ChangeEvent, type CSSProperties } from 'react';
import '@moq/watch/element';
import type MoqWatch from '@moq/watch/element';
import { ArrowsPointingOutIcon, HeartIcon, PauseIcon, PlayIcon, XMarkIcon } from '@heroicons/react/20/solid';
import { ChatBubbleLeftRightIcon } from '@heroicons/react/24/outline';
import VolumeComponent from '../../components/player/components/VolumeComponent';
import { StatusMessageComponent } from '../../components/player/components/StatusMessageComponent';
import { relayUrl } from './config';
import { Adaptation, profiles, type Profile } from './playback';
import { useSocialSession } from './useSocialSession';
import type { PlayerProps } from './ProtocolPlayer';
import type { PlayerLayout } from './layout';

type State = 'Loading' | 'Playing' | 'Offline' | 'Error';

export default function MoqPlayer(props: PlayerProps & { onWebrtcLiveChange: (live: boolean) => void; onFullscreen: () => void; onLayoutChange: (layout: PlayerLayout | undefined) => void }) {
  const { streamKey, onStreamStatusChange, onWebrtcLiveChange, onLayoutChange } = props;
  const { videoRef, status, reactions, removeReaction } = useSocialSession(props, onWebrtcLiveChange);
  const hostRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const watchRef = useRef<MoqWatch | null>(null);
  const adaptationRef = useRef(new Adaptation());
  const [state, setState] = useState<State>('Loading');
  const [isOnline, setIsOnline] = useState(false);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(true);
  const [volume, setVolume] = useState(50);
  const [profile, setProfile] = useState<Profile>('auto');

  useEffect(() => {
    const host = hostRef.current;
    const toolbar = toolbarRef.current;
    if (!host || !toolbar) return;

    const watch = document.createElement('moq-watch');
    const canvas = document.createElement('canvas');
    canvas.className = 'block w-full h-full object-contain object-top';
    watch.className = 'w-full h-full';
    watch.appendChild(canvas);
    watch.muted = true;
    watch.setAttribute('delay', '500ms');
    watch.name = streamKey;
    watch.url = relayUrl;
    watchRef.current = watch;
    host.appendChild(watch);

    const reportLayout = () => {
      const display = watch.video.out.display.peek();
      onLayoutChange({
        aspectRatio: display ? display.width / display.height : 16 / 9,
        controlsHeight: toolbar.offsetHeight,
      });
    };
    const toolbarObserver = new ResizeObserver(reportLayout);
    toolbarObserver.observe(toolbar);
    reportLayout();

    const update = () => {
      const connected = watch.connection.status.peek() === 'connected';
      const broadcast = watch.broadcast.out.status.peek();
      const live = connected && broadcast === 'live';
      const videoReady = watch.renderer.out.timestamp.peek() !== undefined;
      const audioReady = watch.emitter.out.enabled.peek()
        && watch.audio.out.context.peek()?.state === 'running'
        && watch.audio.out.timestamp.peek() !== undefined;
      setIsOnline(live);
      setState(watch.connection.error.peek() || watch.video.source.out.error.peek() === 'unsupported' ? 'Error'
        : !connected ? 'Loading' : broadcast === 'offline' ? 'Offline' : live && (videoReady || audioReady) ? 'Playing' : 'Loading');
    };

    const dispose = [
      watch.connection.status.subscribe(connectionStatus => {
        if (connectionStatus !== 'connected') adaptationRef.current.resetHealth();
        update();
      }),
      watch.connection.error.subscribe(update),
      watch.broadcast.out.status.subscribe(update),
      watch.video.source.out.error.subscribe(update),
      watch.emitter.out.enabled.subscribe(enabled => {
        if (enabled) adaptationRef.current.resetHealth();
        update();
      }),
      watch.renderer.out.timestamp.subscribe(update),
      watch.audio.out.timestamp.subscribe(update),
      watch.audio.out.context.subscribe(update),
      watch.video.out.display.subscribe(reportLayout),
      watch.controls.muted.subscribe(setMuted),
      watch.controls.volume.subscribe(value => setVolume(Math.round(value * 100))),
      watch.controls.paused.subscribe(setPaused),
    ];
    setMuted(watch.controls.muted.peek());
    setVolume(Math.round(watch.controls.volume.peek() * 100));
    setPaused(watch.controls.paused.peek());
    update();

    const timer = window.setInterval(() => {
      const videoActive = watch.renderer.out.visible.peek() && !!watch.video.source.out.config.peek();
      const audioActive = !watch.muted && watch.emitter.out.enabled.peek() && watch.audio.out.context.peek()?.state === 'running' && !!watch.audio.source.out.config.peek();
      const active = watch.connection.status.peek() === 'connected' && watch.broadcast.out.status.peek() === 'live' && !!watch.broadcast.out.active.peek() && !watch.paused && !document.hidden && !!(videoActive || audioActive);
      const stalled = !!((videoActive && watch.video.out.stalled.peek()) || (audioActive && watch.audio.out.stalled.peek()));
      watch.setAttribute('delay', `${adaptationRef.current.sample(performance.now(), active, stalled)}ms`);
    }, 250);

    return () => {
      clearInterval(timer);
      toolbarObserver.disconnect();
      dispose.forEach(unsubscribe => unsubscribe());
      watchRef.current = null;
      watch.remove();
      watch.signals.close();
      onLayoutChange(undefined);
    };
  }, [streamKey, onLayoutChange]);

  useEffect(() => {
    onStreamStatusChange?.(streamKey, { ...status, streamKey, isOnline });
  }, [onStreamStatusChange, streamKey, status, isOnline]);

  function togglePlayback() {
    const watch = watchRef.current;
    if (watch) watch.paused = !watch.paused;
  }

  function changeMuted(value: boolean) {
    if (watchRef.current) watchRef.current.muted = value;
  }

  function changeVolume(value: number) {
    if (watchRef.current) watchRef.current.volume = value / 100;
  }

  function selectProfile(event: ChangeEvent<HTMLSelectElement>) {
    const value = profiles.find(candidate => candidate === event.target.value) ?? 'auto';
    setProfile(value);
    adaptationRef.current = new Adaptation(value);
    if (watchRef.current) watchRef.current.setAttribute('delay', `${adaptationRef.current.delay}ms`);
  }

  function goLive() {
    const watch = watchRef.current;
    if (!watch) return;
    adaptationRef.current = new Adaptation(profile);
    watch.setAttribute('delay', `${adaptationRef.current.delay}ms`);
    watch.reset();
    watch.paused = false;
  }

  function retry() {
    const watch = watchRef.current;
    if (!watch) return;
    adaptationRef.current.resetHealth();
    watch.connection.enabled.set(false);
    window.setTimeout(() => {
      if (watchRef.current === watch) watch.connection.enabled.set(true);
    }, 0);
  }

  return (
    <div className={`w-full flex items-end ${props.fillContainer ? 'h-full' : ''}`}>
      <div
        className={`relative flex w-full flex-col rounded-md bg-gray-950 overflow-hidden ${props.fillContainer ? 'h-full' : ''}`}
        style={props.cinemaMode ? { maxHeight: '100vh', maxWidth: '100vw' } : {}}
      >
        <div ref={hostRef} className={`relative min-h-0 w-full ${props.fillContainer ? 'flex-1' : 'aspect-video'}`} />
        <video ref={videoRef} hidden muted playsInline />
        <div className="pointer-events-none absolute inset-0">
          <StatusMessageComponent streamKey={streamKey} state={state} />
        </div>
        <div className="absolute top-2 right-2 z-60 flex gap-2">
          {props.onToggleChat && (
            <button
              type="button"
              aria-label="Toggle chat"
              onClick={props.onToggleChat}
              className={`p-2 rounded-full border cursor-pointer ${props.isChatOpen ? 'bg-blue-600 border-blue-500 text-white' : 'bg-black/60 border-gray-700 text-gray-200 hover:bg-gray-800'}`}
            >
              <ChatBubbleLeftRightIcon className="h-5 w-5" />
            </button>
          )}
          {props.onCloseStream && (
            <button
              type="button"
              aria-label="Close stream"
              onClick={props.onCloseStream}
              className="p-2 rounded-full bg-red-400 hover:bg-red-500 cursor-pointer"
            >
              <XMarkIcon className="h-6 w-6 text-black" />
            </button>
          )}
        </div>
        <div ref={toolbarRef} className="player-drag-handle z-30 flex min-h-8 w-full shrink-0 flex-wrap items-center gap-2 rounded-md bg-blue-950 p-1 cursor-move">
          <button type="button" className="player-drag-cancel cursor-pointer" aria-label={paused ? 'Play' : 'Pause'} onClick={togglePlayback}>
            {paused ? <PlayIcon className="w-5" /> : <PauseIcon className="w-5" />}
          </button>
          <span className="player-drag-cancel cursor-pointer">
            <VolumeComponent
              isMuted={muted}
              volume={volume}
              onStateChanged={changeMuted}
              onVolumeChanged={changeVolume}
            />
          </span>
          <select
            aria-label="Playback delay"
            className="player-drag-cancel bg-blue-950 text-sm cursor-pointer"
            value={profile}
            onChange={selectProfile}
          >
            <option value="auto">Auto delay</option>
            <option value="low">250 ms</option>
            <option value="balanced">750 ms</option>
            <option value="resilient">1500 ms</option>
          </select>
          <button type="button" className="player-drag-cancel text-sm cursor-pointer" onClick={goLive}>Go live</button>
          <button type="button" className="player-drag-cancel text-sm cursor-pointer" onClick={retry}>Retry</button>
          <span className="flex-1" />
          <button type="button" className="player-drag-cancel cursor-pointer" aria-label="Fullscreen" onClick={props.onFullscreen}>
            <ArrowsPointingOutIcon className="w-5" />
          </button>
        </div>
        <div className="pointer-events-none absolute right-5 bottom-10 z-70 h-20 w-14 overflow-visible">
          {reactions.map(reaction => (
            <HeartIcon
              key={reaction.id}
              className="animate-reaction-float absolute right-0 bottom-0 h-7 w-7 text-rose-500 drop-shadow"
              style={Object.assign<CSSProperties, Record<string, string>>({}, { '--reaction-x': `${reaction.x}px` })}
              onAnimationEnd={() => removeReaction(reaction.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
