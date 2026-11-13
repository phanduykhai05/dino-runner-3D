# 3D model credits

## Flying Pteranodon

“Pteranodon (Animated)” by Chistodrako._. / Oscar López Riviello.

- Original: https://sketchfab.com/3d-models/pteranodon-animated-7d7683df41d1405283f160e81a5dff1b
- Creator: https://sketchfab.com/oscar.lopez.riviello
- License: CC BY 4.0, https://creativecommons.org/licenses/by/4.0/
- Prepared model: https://github.com/s010s/prehistoric-animal-museum/tree/main/src/content/animals/pteranodon
- Preparation by Prehistoric Animal Museum / Leon Made This: material conversion,
  normalized rig, repaired in-place flight loop, and mesh/texture compression.
- PoweredFlap and Glide animation derivatives by Prehistoric Animal Museum /
  Leon Made This, also CC BY 4.0:
  https://github.com/s010s/prehistoric-animal-museum/tree/main/src/flight-experience/assets
- Changes for this game: constant keyframes reduced, numeric precision compacted,
  scale and heading adjusted, smooth flap/glide blending, individual animation
  phases, body banking and flight paths. The original skeleton is kept.

The source license record is included as LICENSE-Pteranodon.txt. This model is
not covered by the CC0 license of the ground dinosaurs. Attribution is also
available in the game's “Nguồn mô hình 3D” link.

## Ground dinosaurs

Source: Grab3D, released under CC0 1.0 Universal.

- T-Rex: https://grab3d.com/models/creatures/t-rex/
- Triceratops: https://grab3d.com/models/creatures/triceratops/
- Brachiosaurus: https://grab3d.com/models/creatures/brachiosaurus/
- Stegosaurus: https://grab3d.com/models/creatures/stegosaurus/
- License: https://creativecommons.org/publicdomain/zero/1.0/

Grab3D describes these as AI-assisted models: meshes and textures generated
with Meshy, then cleaned up, scaled and checked in Blender. The source license
is included as LICENSE-Grab3D.txt.

Changes for this game: simplified the light GLBs to approximately 55,000
triangles each while preserving UVs and PBR textures, normalized their scale,
added a runtime skeleton and skin weights, and added a forest color variation
for T-Rex. The models and textures are hosted locally with the game.

`node scripts/optimize-dinosaurs.mjs` optimizes unmodified light GLBs downloaded
from the model pages. It skips files already optimized for this game.
