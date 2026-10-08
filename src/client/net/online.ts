import type { MapDefinition } from '../../shared/data/maps/map-definition.ts';
import type { MapId } from '../../shared/data/maps/registry.ts';
import type { Terrain } from '../../shared/map/terrain.ts';
import { newRoomCode, type RoomSettings } from '../../shared/net/protocol.ts';
import type { HostPilot } from '../../shared/net/room.ts';
import { HostSession } from '../session/host-session.ts';
import { type HelloOptions, NetworkSession } from '../session/network-session.ts';
import { MeshClientLink, MeshHostLink } from './p2p-links.ts';
import { openMesh, relayUrlsFromQuery } from './trystero-mesh.ts';

/** A pilot waits this long for the host to answer before giving up. */
export const JOIN_TIMEOUT_MS = 30_000;
/** Quick-chat keys: 7, 8, 9 and 0 send the four preset lines. */
export const CHAT_KEYS: readonly string[] = ['Digit7', 'Digit8', 'Digit9', 'Digit0'];

/** The invite link for a room: this page with `?join=CODE` (and the same relays, if any). */
export function inviteLink(code: string, location: { origin: string; pathname: string; search: string }): string {
  const q = new URLSearchParams();
  q.set('join', code);
  const relay = new URLSearchParams(location.search).get('relay');
  if (relay) q.set('relay', relay);
  return `${location.origin}${location.pathname}?${q.toString()}`;
}

/** Opens a room in this browser: the match runs here, and others join with the code. */
export async function hostOnline(settings: RoomSettings, host: HostPilot, map: MapDefinition, terrain: Terrain, search = location.search): Promise<HostSession> {
  const code = newRoomCode();
  const mesh = await openMesh(code, { relayUrls: relayUrlsFromQuery(search) });
  return new HostSession({ settings, host, map, terrain, code, link: new MeshHostLink(mesh) });
}

/**
 * Joins the room with this code: finds the host, says hello, and loads the room's map. Rejects with a message for the
 * pilot when no host answers, the host refuses, or no direct link can be opened.
 */
export async function joinOnline(code: string, hello: HelloOptions, load: (id: MapId) => Promise<{ map: MapDefinition; terrain: Terrain }>, search = location.search): Promise<NetworkSession> {
  let linkError: string | null = null;
  const mesh = await openMesh(code, { relayUrls: relayUrlsFromQuery(search), onLinkError: (m) => (linkError = m) });
  const link = new MeshClientLink(mesh);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      link.close();
      reject(
        new Error(
          linkError
            ? 'Found the room, but could not connect to the host directly: one of your networks blocks it. Try another network, or let someone else host.'
            : `No room answered to ${code}. Check the code; the host must have the game open.`,
        ),
      );
    }, JOIN_TIMEOUT_MS);
  });
  try {
    return await Promise.race([NetworkSession.connect(link, hello, load), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
