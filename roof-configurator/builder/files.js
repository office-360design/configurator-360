import { validateProject } from "./project.js?v=builder-game-3";
import { resolveProject } from "./geometry.js?v=builder-game-3";
import { planFace } from "./planner.js?v=builder-game-3";

// Validate file decisions as well as geometry before replacing a valid project.
// Legacy geometry limits remain face-local and do not prevent opening a drawing.
export function validateProjectFile(value) {
  const project = validateProject(value);
  for (const face of resolveProject(project).faces) {
    const settings = project.faceSettings[face.id];
    if (!settings) continue;
    try {
      const plan = planFace(face, settings),
        keys = new Set(plan.pieces.map((p) => p.key));
      for (const key of Object.keys(settings.partitions || {}))
        if (!keys.has(key)) throw Error("invalidProject");
    } catch (error) {
      if (
        /invalidProject|directionInvalid|offsetInvalid|partition|module count|coverage/i.test(
          error.message,
        )
      )
        throw Error("invalidProject");
    }
  }
  return project;
}
