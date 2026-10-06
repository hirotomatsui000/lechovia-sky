import { Quaternion, Vector3 } from 'three';
import { kestrel } from '../../shared/data/aircraft/kestrel.ts';
import { createFlightState } from '../../shared/physics/flight-model.ts';
import { createSeeker } from '../../shared/targeting/ir-seeker.ts';
import { createRadarLock } from '../../shared/targeting/radar-lock.ts';
import type { AircraftView } from '../session/game-session.ts';

/** An aircraft view for client tests: level at 1 km, x = id × 100 m, heading north at 200 m/s. */
export function testView(id: number, over: Partial<AircraftView> = {}): AircraftView {
  const config = over.config ?? kestrel;
  const flight = createFlightState({ position: new Vector3(id * 100, 1000, 0), headingRad: 0, speed: 200, throttle: 0.5 });
  const s = config.stores;
  return {
    id,
    callsign: `P${id}`,
    team: config.team,
    config,
    isLocal: false,
    isBot: false,
    alive: true,
    hp: config.damage.hitPoints,
    spawnGen: 1,
    position: flight.pos.clone(),
    quaternion: new Quaternion(),
    flight,
    boundarySecondsLeft: null,
    respawnInS: null,
    gStrain: 0,
    blackedOutS: null,
    kills: 0,
    deaths: 0,
    firingCannon: false,
    stores: { cannonRounds: s.cannonRounds, srm: s.srm, mrm: s.mrm, countermeasures: s.countermeasures, bombs: 0, fuelKg: config.physics.fuelKg },
    bombLoad: 0,
    targetId: null,
    contacts: [],
    datalink: [],
    seeker: createSeeker(),
    radarLock: createRadarLock(),
    lockedByRadar: false,
    incoming: null,
    ...over,
  };
}
