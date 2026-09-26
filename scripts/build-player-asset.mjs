// Builds public/assets/players/soldier.glb from Mixamo FBX downloads.
// Sources live in assets/players/mixamo/ (git-ignored: Mixamo forbids
// redistributing the raw files). Run: npm run build:player-asset
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { dedup, prune } from '@gltf-transform/functions';

const require = createRequire(import.meta.url);
const convert = require('fbx2gltf');

const SOURCE_DIR = 'assets/players/mixamo';
const OUTPUT = 'public/assets/players/soldier.glb';
/** File name (without .fbx) → clip name expected by RemotePlayerAvatar. */
const CLIPS = {
  idle: 'Idle',
  walk: 'Walk',
  run: 'Run',
  aim: 'Aim',
  fire: 'Fire',
  reload: 'Reload',
  death: 'Death',
};
const REQUIRED = ['character', 'idle', 'walk'];
const CONVERTER_ARGS = ['--anim-framerate', 'bake30', '--pbr-metallic-roughness'];

async function toGlb(name, workDir) {
  const source = join(SOURCE_DIR, `${name}.fbx`);
  const target = join(workDir, `${name}.glb`);
  await convert(source, target, CONVERTER_ARGS);
  return target;
}

function copyAccessor(document, accessor, buffer, transform) {
  const array = accessor.getArray().slice();
  transform?.(array);
  return document.createAccessor()
    .setType(accessor.getType())
    .setNormalized(accessor.getNormalized())
    .setArray(array)
    .setBuffer(buffer);
}

/** Locomotion is driven by gameplay movement; root motion on the hips would double it. */
function lockHorizontalRoot(array) {
  const x = array[0];
  const z = array[2];
  for (let index = 0; index < array.length; index += 3) {
    array[index] = x;
    array[index + 2] = z;
  }
}

async function main() {
  const missing = REQUIRED.filter((name) => !existsSync(join(SOURCE_DIR, `${name}.fbx`)));
  if (missing.length > 0) {
    throw new Error(`Missing ${missing.map((name) => `${name}.fbx`).join(', ')} in ${SOURCE_DIR}`);
  }
  const workDir = await mkdtemp(join(tmpdir(), 'zeroed-soldier-'));
  try {
    const io = new NodeIO();
    const document = await io.read(await toGlb('character', workDir));
    const root = document.getRoot();
    for (const animation of root.listAnimations()) animation.dispose();
    const buffer = root.listBuffers()[0];
    const nodes = new Map(root.listNodes().map((node) => [node.getName(), node]));

    for (const [file, clipName] of Object.entries(CLIPS)) {
      if (!existsSync(join(SOURCE_DIR, `${file}.fbx`))) {
        console.info(`- ${clipName}: not provided (optional)`);
        continue;
      }
      const source = (await io.read(await toGlb(file, workDir))).getRoot().listAnimations();
      if (source.length === 0) throw new Error(`${file}.fbx has no animation`);
      const clip = document.createAnimation(clipName);
      let matched = 0;
      let skipped = 0;
      for (const channel of source[0].listChannels()) {
        const targetName = channel.getTargetNode()?.getName() ?? '';
        const target = nodes.get(targetName);
        if (!target) {
          skipped++;
          continue;
        }
        const path = channel.getTargetPath();
        const sampler = channel.getSampler();
        const rootMotion = path === 'translation' && /hips$/i.test(targetName);
        const copied = document.createAnimationSampler()
          .setInterpolation(sampler.getInterpolation())
          .setInput(copyAccessor(document, sampler.getInput(), buffer))
          .setOutput(copyAccessor(document, sampler.getOutput(), buffer, rootMotion ? lockHorizontalRoot : undefined));
        clip.addSampler(copied).addChannel(
          document.createAnimationChannel().setTargetNode(target).setTargetPath(path).setSampler(copied),
        );
        matched++;
      }
      if (matched === 0) throw new Error(`${file}.fbx does not share bone names with character.fbx`);
      console.info(`- ${clipName}: ${matched} channels${skipped ? `, ${skipped} unmatched` : ''}`);
    }

    await document.transform(prune(), dedup());
    await mkdir('public/assets/players', { recursive: true });
    await io.write(OUTPUT, document);

    const joints = root.listSkins().reduce((count, skin) => count + skin.listJoints().length, 0);
    let triangles = 0;
    for (const mesh of root.listMeshes()) {
      for (const primitive of mesh.listPrimitives()) {
        triangles += (primitive.getIndices()?.getCount() ?? primitive.getAttribute('POSITION')?.getCount() ?? 0) / 3;
      }
    }
    const textures = root.listTextures().map((texture) => {
      const [width, height] = texture.getSize() ?? [0, 0];
      return `${texture.getName() || texture.getURI() || 'texture'} ${width}x${height}`;
    });
    const { size } = await stat(OUTPUT);
    console.info(`\n${OUTPUT}: ${(size / 1024 / 1024).toFixed(2)} MB, ${Math.round(triangles)} triangles, ${joints} joints`);
    console.info(`Textures: ${textures.join(', ') || 'none'}`);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
