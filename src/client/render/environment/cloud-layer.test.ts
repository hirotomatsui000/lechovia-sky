import { type Mesh, type PlaneGeometry, Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { CloudField, WEATHER } from '../../../shared/world/weather.ts';
import { CloudLayer, DECK_SEGMENTS } from './cloud-layer.ts';

describe('the overcast deck', () => {
  it('is drawn in tiles of a few kilometres, not as one quad 400 km across (revision 25)', () => {
    // Regression: from just under the deck, its two huge triangles failed to hide what lay beyond.
    const scene = new Scene();
    const layer = new CloudLayer(scene, new CloudField(WEATHER.overcast, 7), 30000);
    for (const name of ['cloud-deck-top', 'cloud-deck-base']) {
      const mesh = scene.getObjectByName(name) as Mesh<PlaneGeometry>;
      expect(mesh.geometry.parameters.widthSegments).toBe(DECK_SEGMENTS);
      expect(mesh.geometry.parameters.width / DECK_SEGMENTS).toBeLessThanOrEqual(8000);
    }
    layer.dispose();
  });
});
