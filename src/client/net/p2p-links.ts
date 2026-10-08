import type { HostJsonMessage } from '../../shared/net/protocol.ts';
import type { Peer } from '../../shared/net/room.ts';
import type { HostLink } from '../session/host-session.ts';
import type { Transport } from '../session/network-session.ts';

/*
 * The links of an online room over a peer-to-peer mesh (revision 28). Every browser in a room is connected to every
 * other, but only the host's matters: pilots send their hello to everyone they meet, the host alone answers, and from
 * its welcome on a pilot talks to the host only. JSON goes as text, inputs and snapshots as binary, on one ordered,
 * reliable channel per pair, so a welcome always arrives before the first snapshot.
 */

/** What the links need of a mesh room (Trystero's, or a fake in tests). */
export interface MeshRoom {
  sendText(text: string, to: string | null): void;
  sendBinary(buf: ArrayBuffer, to: string): void;
  onText: ((text: string, from: string) => void) | null;
  onBinary: ((buf: ArrayBuffer, from: string) => void) | null;
  onPeerJoin: ((id: string) => void) | null;
  onPeerLeave: ((id: string) => void) | null;
  peers(): string[];
  leave(): void;
  /** the handlers are set: what arrived before them can be delivered now */
  ready?(): void;
}

/** The host's end: every pilot who says hello becomes a Peer of the Room. */
export class MeshHostLink implements HostLink {
  onJson: HostLink['onJson'] = null;
  onBinary: HostLink['onBinary'] = null;
  onLeave: HostLink['onLeave'] = null;
  private readonly mesh: MeshRoom;
  private readonly peers = new Map<string, Peer>();
  private closed = false;

  constructor(mesh: MeshRoom) {
    this.mesh = mesh;
    mesh.onText = (text, from) => this.onJson?.(this.peer(from), text);
    mesh.onBinary = (buf, from) => this.onBinary?.(from, buf);
    mesh.onPeerLeave = (id) => {
      this.peers.delete(id);
      this.onLeave?.(id);
    };
    mesh.ready?.();
  }

  /** Browsers connected to this room now (pilots or still saying hello). */
  get connected(): number {
    return this.mesh.peers().length;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    // Let the shutdown message go before the links close.
    setTimeout(() => this.mesh.leave(), 300);
  }

  private peer(id: string): Peer {
    let p = this.peers.get(id);
    if (!p) {
      const mesh = this.mesh;
      p = {
        id,
        sendJson: (msg: HostJsonMessage) => mesh.sendText(JSON.stringify(msg), id),
        sendBinary: (buf: ArrayBuffer) => mesh.sendBinary(buf, id),
      };
      this.peers.set(id, p);
    }
    return p;
  }
}

/** A pilot's end: says hello to every browser in the room, then talks to whichever answered as the host. */
export class MeshClientLink implements Transport {
  onMessage: Transport['onMessage'] = null;
  onClose: Transport['onClose'] = null;
  /** the host's peer id, once it has answered */
  hostId: string | null = null;
  private readonly mesh: MeshRoom;
  private hello: string | null = null;
  private closed = false;

  constructor(mesh: MeshRoom) {
    this.mesh = mesh;
    mesh.onPeerJoin = (id) => {
      if (this.hello !== null && this.hostId === null) mesh.sendText(this.hello, id);
    };
    mesh.onPeerLeave = (id) => {
      if (id === this.hostId) this.end("The host's connection dropped: the room has closed.");
    };
    mesh.onText = (text, from) => {
      if (this.closed) return;
      if (this.hostId === null) {
        // Only the host answers a hello.
        let type: unknown;
        try {
          type = (JSON.parse(text) as { type?: unknown }).type;
        } catch {
          return;
        }
        if (type !== 'welcome' && type !== 'reject') return;
        this.hostId = from;
      }
      if (from === this.hostId) this.onMessage?.(text);
    };
    mesh.onBinary = (buf, from) => {
      if (!this.closed && from === this.hostId) this.onMessage?.(buf);
    };
    mesh.ready?.();
  }

  send(data: string | ArrayBuffer): void {
    if (this.closed) return;
    if (typeof data === 'string') {
      if (this.hostId !== null) {
        this.mesh.sendText(data, this.hostId);
      } else {
        // The hello, to everyone here now and to whoever comes later.
        this.hello = data;
        this.mesh.sendText(data, null);
      }
    } else if (this.hostId !== null) {
      this.mesh.sendBinary(data, this.hostId);
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.mesh.leave();
  }

  private end(reason: string): void {
    if (this.closed) return;
    this.closed = true;
    this.mesh.leave();
    this.onClose?.(reason);
  }
}
