# Continue Booth Studio

Repository: https://github.com/yitzhach/booth-studio
Production branch: main
Cloudflare Worker/project: booth-studio
Build: npm run build
Deploy: npx wrangler deploy
User enabled non-production branch builds and left Cloudflare Access off.

Read README.md, this note, docs/VERIFICATION.md, and the current source before editing. Do not rebuild from scratch. The independent Commission Studio repository must remain untouched.

The implementation follows docs/ORIGINAL-HANDOFF.md and the approved desktop/mobile references in docs/references. It additionally includes the user's requested booth-photo composition workflow.

Current prototype:
- Three.js measured booth, modular walls, canopy, image panels, wall-plane drag, numeric editing, 1-inch snap, cameras, spotlights/shadows.
- Canvas booth-photo editor with separate original photo, projective artwork layers, corner handles/numeric coordinates, shadow/light overlays.
- IndexedDB local autosave, undo/redo, all-assets JSON import/export, new layout/alternative backed up before replacement.
- 2048/4096 px PNG export and printable dimensioned HTML wall guide.
- Desktop, tablet and phone layouts; no active future Artist OS tools.

Immediate next trial: upload six of Isaac's actual artwork images (they have not been supplied for this build), enter their measured sizes, arrange the actual booth, review on his physical Mac/iPhone, and compare an exported image against the real installation. Sample panels and test graphics are not the user's artwork.

Important limits:
- A single booth photo cannot provide measured geometry or physically accurate relighting. Existing photographed content is baked in. Added artwork and lighting are separate visual overlays.
- 3D source image pixels remain intact in backups, with 2048px preview textures. Images are proportionally fitted with a visible warning if panel dimensions disagree.
- No real relief from artwork photos, no physical-device certification, no cross-device sync, no automatic object removal, no native app.
- Actual cloud accounts, payments, AI effects and inventory integrations remain out of scope.

When continuing:
1. Review deployment status and the actual live URL; do not infer deployment success from a git push alone.
2. Preserve the v1 format or write an explicit migration. Test backup round trips whenever changing it.
3. Preserve original assets and all user data. Imported projects are validated before replacing the current project.
4. Keep Cloudflare Worker static-assets configuration and deployment paths. Never commit secrets, test browser profiles, node_modules, or generated dist.
5. Browser integration tests: npm run test:browser after npx playwright install chromium. Use BOOTH_TEST_CHROMIUM to override executable in constrained CI environments.
