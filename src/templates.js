// The user's own templates: a home saved without its artwork or images, kept
// in this browser, that "Start a new home" can begin from instead of the
// starter floor. Rooms, furniture, finishes and lighting come across; the
// work and anything that points at an uploaded image stay with the project
// they belong to.
import { GROUND_KINDS, blankProject, uid } from "./model.js";

/**
 * A template is the floor and its lighting without the work: no artwork, no
 * images, no photo composition. Small enough to keep in localStorage.
 */
export function templateOf(p, label) {
  const booth = structuredClone(p.booth);
  // Anything that points at an uploaded image goes: the images stay with the
  // project they belong to. A photographed floor falls back to its preset.
  delete booth.surroundAsset;
  delete booth.groundAsset;
  delete booth.underlay;
  delete booth.models;
  if (!GROUND_KINDS.includes(booth.ground)) booth.ground = GROUND_KINDS.includes(booth.groundPreset) ? booth.groundPreset : undefined;
  if (booth.ground === undefined) delete booth.ground;
  return {
    id: uid(),
    label: String(label || p.name || "My home").trim().slice(0, 80) || "My home",
    booth,
    lights: structuredClone(p.lights || []),
    ambient: p.ambient,
  };
}

/** A new project standing in a saved template's floor. */
export function fromTemplate(t, name) {
  const p = blankProject();
  p.art = [];
  p.booth = { ...p.booth, ...structuredClone(t.booth) };
  if (Array.isArray(t.lights)) p.lights = structuredClone(t.lights);
  if (Number.isFinite(t.ambient)) p.ambient = t.ambient;
  p.name = String(name || t.label).trim().slice(0, 120) || "My home";
  return p;
}
