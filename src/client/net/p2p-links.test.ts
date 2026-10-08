import { describe, expect, it } from 'vitest';
import type { HostJsonMessage } from '../../shared/net/protocol.ts';
import { MeshClientLink, MeshHostLink, type MeshRoom } from './p2p-links.ts';

/** An in-memory mesh: every member of a room hears every other, at once. */
class FakeNetwork {
  readonly members = new Map<string, FakeMesh>();

  /** A browser joins the room: the others meet it, and it meets them (its handlers are already set). */
  connect(m: FakeMesh): FakeMesh {
    this.members.set(m.id, m);
    for (const other of this.members.values()) {
      if (other === m) continue;
      other.onPeerJoin?.(m.id);
      m.onPeerJoin?.(other.id);
    }
    return m;
  }

  host(id: string): { link: MeshHostLink; mesh: FakeMesh } {
    const mesh = new FakeMesh(id, this);
    const link = new MeshHostLink(mesh);
    this.connect(mesh);
    return { link, mesh };
  }

  client(id: string): MeshClientLink {
    const mesh = new FakeMesh(id, this);
    const link = new MeshClientLink(mesh);
    this.connect(mesh);
    return link;
  }

  leave(id: string): void {
    this.members.delete(id);
    for (const other of this.members.values()) other.onPeerLeave?.(id);
  }
}

class FakeMesh implements MeshRoom {
  onText: MeshRoom['onText'] = null;
  onBinary: MeshRoom['onBinary'] = null;
  onPeerJoin: MeshRoom['onPeerJoin'] = null;
  onPeerLeave: MeshRoom['onPeerLeave'] = null;
  readonly id: string;
  private readonly net: FakeNetwork;

  constructor(id: string, net: FakeNetwork) {
    this.id = id;
    this.net = net;
  }

  sendText(text: string, to: string | null): void {
    for (const m of this.net.members.values()) if (m.id !== this.id && (to === null || m.id === to)) m.onText?.(text, this.id);
  }

  sendBinary(buf: ArrayBuffer, to: string): void {
    this.net.members.get(to)?.onBinary?.(buf, this.id);
  }

  peers(): string[] {
    return [...this.net.members.keys()].filter((id) => id !== this.id);
  }

  leave(): void {
    this.net.leave(this.id);
  }
}

describe('online links over a mesh (revision 28)', () => {
  it('finds the host among the browsers in the room, before or after they join, and talks to it alone', () => {
    const net = new FakeNetwork();
    const other = net.client('other');
    const { link: host } = net.host('host');
    const heard: string[] = [];
    host.onJson = (peer, text) => {
      heard.push(`${peer.id}:${JSON.parse(text).type}`);
      if (JSON.parse(text).type === 'hello') peer.sendJson({ type: 'pong', t: 0, tick: 0 } as HostJsonMessage);
      if (JSON.parse(text).type === 'hello') peer.sendJson({ type: 'reject', reason: 'no' });
    };
    const binary: string[] = [];
    host.onBinary = (id) => binary.push(id);
    const me = net.client('me');
    const got: string[] = [];
    me.onMessage = (data) => got.push(typeof data === 'string' ? JSON.parse(data).type : 'binary');
    me.send(new ArrayBuffer(4)); // nothing to send it to yet
    me.send('{"type":"hello"}');
    // The pong came before the host was known (only a welcome or reject names it); the reject did.
    expect(me.hostId).toBe('host');
    expect(got).toEqual(['reject']);
    me.send('{"type":"ping"}');
    me.send(new ArrayBuffer(4));
    expect(heard).toEqual(['me:hello', 'me:ping']);
    expect(binary).toEqual(['me']);
    expect(host.connected).toBe(2);
    other.close();
  });

  it('says hello to a host who joins later', () => {
    const net = new FakeNetwork();
    const me = net.client('me');
    me.send('{"type":"hello"}');
    const heard: string[] = [];
    const mesh = new FakeMesh('host', net);
    const host = new MeshHostLink(mesh);
    host.onJson = (peer, text) => {
      heard.push(text);
      peer.sendJson({ type: 'reject', reason: 'full' });
    };
    net.connect(mesh);
    // The host joined after the hello went out: it hears it when the link opens.
    expect(heard).toEqual(['{"type":"hello"}']);
    expect(me.hostId).toBe('host');
  });

  it('tells the pilot when the host goes, and the host when a pilot goes', () => {
    const net = new FakeNetwork();
    const { link: host, mesh: hostMesh } = net.host('host');
    host.onJson = (peer) => peer.sendJson({ type: 'reject', reason: 'x' });
    const left: string[] = [];
    host.onLeave = (id) => left.push(id);
    const a = net.client('a');
    a.send('{"type":"hello"}');
    const b = net.client('b');
    b.send('{"type":"hello"}');
    a.close();
    expect(left).toEqual(['a']);
    let reason = '';
    b.onClose = (r) => (reason = r);
    hostMesh.leave();
    expect(reason).toMatch(/host/);
  });
});
