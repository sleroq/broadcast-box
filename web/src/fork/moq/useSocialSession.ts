import { useCallback, useEffect, useRef, useState } from 'react';
import { PeerConnectionSetup, type PeerConnectionDataChannels } from '../../components/player/functions/peerconnection';
import type { StreamStatus } from '../../providers/StatusProvider';
import type { PlayerProps } from './ProtocolPlayer';

export function useSocialSession(props: PlayerProps, onWebrtcLiveChange: (live: boolean) => void) {
  const { streamKey, onChatAdapterChange, onReactionSenderChange } = props;
  const videoRef = useRef<HTMLVideoElement>(null);
  const layerEndpointRef = useRef('');
  const [status, setStatus] = useState<StreamStatus>({ streamKey, motd: '', viewers: 0, isOnline: false });
  const [channels, setChannels] = useState<PeerConnectionDataChannels>();
  const [reactions, setReactions] = useState<{ id: number; x: number }[]>([]);
  const nextReaction = useRef(0);
  const animate = useCallback(() => {
    const id = ++nextReaction.current;
    setReactions(current => [...current.slice(-7), { id, x: Math.round((Math.random() - 0.5) * 32) }]);
  }, []);

  useEffect(() => {
    let disposed = false;
    const controller = new AbortController();
    let connection: RTCPeerConnection | undefined;
    function setup() {
      if (controller.signal.aborted) return;
      onWebrtcLiveChange(false);
      void PeerConnectionSetup({
        streamKey, receiveMedia: false, signal: controller.signal, videoRef, layerEndpointRef,
        onStateChange: () => {}, onStreamRestart: setup,
        onLayerStatus: () => {}, onAudioLayerChange: () => {}, onVideoLayerChange: () => {},
        onStreamStatus: next => { if (!disposed) { setStatus(next); onWebrtcLiveChange(next.isOnline); } },
        onError: () => { if (!disposed) onWebrtcLiveChange(false); },
        onDataChannelsChange: (next, active) => {
          if (!disposed) setChannels(current => active ? next : current === next ? undefined : current);
        },
      }).then(next => {
        if (disposed) next.close();
        else {
          connection = next;
          next.addEventListener('connectionstatechange', () => {
            if (next.connectionState === 'failed' || next.connectionState === 'closed' || next.connectionState === 'disconnected') onWebrtcLiveChange(false);
          });
        }
      }).catch(error => { if (!controller.signal.aborted) console.log('SocialPeerConnection.Error', error); });
    }
    setup();
    return () => { disposed = true; controller.abort(); connection?.close(); };
  }, [streamKey, onWebrtcLiveChange]);

  useEffect(() => {
    if (!channels) return;
    onChatAdapterChange?.(streamKey, channels.chatAdapter);
    return () => onChatAdapterChange?.(streamKey, undefined);
  }, [channels, onChatAdapterChange, streamKey]);

  useEffect(() => {
    if (!channels) return;
    const channel = channels.reactionDataChannel;
    function send() {
      if (channel.readyState !== 'open') return;
      try { channel.send(JSON.stringify({ type: 'reaction' })); animate(); }
      catch (error) { console.log('ReactionDataChannel.Send.Error', error); }
    }
    function update() { onReactionSenderChange?.(streamKey, channel.readyState === 'open' ? send : undefined); }
    function message(event: MessageEvent) {
      try { if (JSON.parse(event.data)?.type === 'reaction') animate(); } catch { /* Ignore non-JSON messages. */ }
    }
    channel.addEventListener('open', update);
    channel.addEventListener('close', update);
    channel.addEventListener('error', update);
    channel.addEventListener('message', message);
    update();
    return () => {
      channel.removeEventListener('open', update);
      channel.removeEventListener('close', update);
      channel.removeEventListener('error', update);
      channel.removeEventListener('message', message);
      onReactionSenderChange?.(streamKey, undefined);
    };
  }, [animate, channels, onReactionSenderChange, streamKey]);

  return { videoRef, status, reactions, removeReaction: (id: number) => setReactions(current => current.filter(item => item.id !== id)) };
}
