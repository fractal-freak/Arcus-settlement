/** The published feed nests simulation facts under life; raw saves do not. */
export function criticContext(saved) {
  const life = saved.life ?? saved;
  if (!life.quality?.scores || !Array.isArray(life.placements)) {
    throw new Error('Critic input is missing settlement quality or placements');
  }
  const byTag = {};
  for (const p of life.placements) byTag[p.tag] = (byTag[p.tag] ?? 0) + 1;
  return { quality: life.quality, byTag };
}
