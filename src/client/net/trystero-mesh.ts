import type { MessageAction, Room as TrysteroRoom } from '@trystero-p2p/core';
import type { MeshRoom } from './p2p-links.ts';

/*
 * Browsers find each other through Trystero (revision 28): a room code names a meeting point on public Nostr relays,
 * where the browsers swap the offers that open WebRTC links between them; after that every message goes straight from
 * browser to browser, encrypted. `?relay=wss://…` swaps the public relays for self-hosted Trystero WebSocket relays (for
 * tests, or a place whose network blocks the public ones).
 */

/** The game's name on the relays: only browsers with the same one meet. */
export const APP_ID = 'lechovia-skies';
/** Public relays tried at once: any one both browsers reach is enough. */
const NOSTR_REDUNDANCY = 8;

export interface MeshOptions {
  /** self-hosted Trystero WebSocket relays instead of the public Nostr ones */
  relayUrls?: readonly string[];
  /** two browsers found each other but could not open a direct link */
  onLinkError?: (message: string) => void;
}

/** `?relay=wss://a,wss://b`: self-hosted relays, or none. */
export function relayUrlsFromQuery(search: string): string[] {
  const raw = new URLSearchParams(search).get('relay');
  if (!raw) return [];
  return raw
    .split(',')
    .map((u) => u.trim())
    .filter((u) => /^wss?:\/\/[^\s]+$/.test(u));
}

/** Joins the meeting point of a room code. The libraries load only now, for online play. */
export async function openMesh(code: string, opts: MeshOptions = {}): Promise<MeshRoom> {
  const roomId = `room-${code}`;
  const callbacks = { onJoinError: (d: { error: string }) => opts.onLinkError?.(d.error) };
  let room: TrysteroRoom;
  if (opts.relayUrls && opts.relayUrls.length > 0) {
    const { joinRoom } = await import('@trystero-p2p/ws-relay');
    room = joinRoom({ appId: APP_ID, relayConfig: { urls: [...opts.relayUrls], warnOnRelayFailure: false } }, roomId, callbacks);
  } else {
    const { joinRoom } = await import('@trystero-p2p/nostr');
    room = joinRoom({ appId: APP_ID, relayConfig: { redundancy: NOSTR_REDUNDANCY, warnOnRelayFailure: false } }, roomId, callbacks);
  }
  return new TrysteroMesh(room);
}

/** Binary messages come as an ArrayBuffer or a view of one, depending on the browser and the size: always a buffer here. */
function asArrayBuffer(data: unknown): ArrayBuffer | null {
  if (data instanceof ArrayBuffer) return data;
  if (ArrayBuffer.isView(data)) return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  return null;
}

type Early = { kind: 'join'; id: string } | { kind: 'leave'; id: string } | { kind: 'text'; text: string; from: string } | { kind: 'binary'; buf: ArrayBuffer; from: string };

/** A Trystero room as the links see it: text and binary messages, and peers coming and going. */
class TrysteroMesh implements MeshRoom {
  onText: MeshRoom['onText'] = null;
  onBinary: MeshRoom['onBinary'] = null;
  onPeerJoin: MeshRoom['onPeerJoin'] = null;
  onPeerLeave: MeshRoom['onPeerLeave'] = null;
  private readonly room: TrysteroRoom;
  private readonly text: MessageAction<string>;
  private readonly bin: MessageAction<ArrayBuffer>;
  /** what arrived before the links set their handlers */
  private early: Early[] | null = [];
  private left = false;

  constructor(room: TrysteroRoom) {
    this.room = room;
    this.text = room.makeAction<string>('j');
    this.bin = room.makeAction<ArrayBuffer>('b');
    this.text.onMessage = (data, { peerId }) => {
      if (this.early) this.early.push({ kind: 'text', text: data, from: peerId });
      else this.onText?.(data, peerId);
    };
    this.bin.onMessage = (data, { peerId }) => {
      const buf = asArrayBuffer(data);
      if (!buf) return;
      if (this.early) this.early.push({ kind: 'binary', buf, from: peerId });
      else this.onBinary?.(buf, peerId);
    };
    room.onPeerJoin = (id) => {
      if (this.early) this.early.push({ kind: 'join', id });
      else this.onPeerJoin?.(id);
    };
    room.onPeerLeave = (id) => {
      if (this.early) this.early.push({ kind: 'leave', id });
      else this.onPeerLeave?.(id);
    };
  }

  ready(): void {
    const early = this.early ?? [];
    this.early = null;
    for (const e of early) {
      switch (e.kind) {
        case 'join':
          this.onPeerJoin?.(e.id);
          break;
        case 'leave':
          this.onPeerLeave?.(e.id);
          break;
        case 'text':
          this.onText?.(e.text, e.from);
          break;
        case 'binary':
          this.onBinary?.(e.buf, e.from);
          break;
      }
    }
  }

  sendText(text: string, to: string | null): void {
    if (this.left) return;
    this.text.send(text, to === null ? undefined : { target: to }).catch(() => {});
  }

  sendBinary(buf: ArrayBuffer, to: string): void {
    if (this.left) return;
    this.bin.send(buf, { target: to }).catch(() => {});
  }

  peers(): string[] {
    return Object.keys(this.room.getPeers());
  }

  leave(): void {
    if (this.left) return;
    this.left = true;
    void this.room.leave().catch(() => {});
  }
}
