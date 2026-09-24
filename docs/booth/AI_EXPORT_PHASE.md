# Paid AI photorealistic export — proposed next phase

Status: design only. No AI requests, billing, account system, or uploads activated.
Keep the existing measured editor and local backups working without an account.

## Proposed export pipeline
1. User selects AI export and 1024, 2048, or 4096 px longest edge.
2. Freeze camera and project state; capture scene, depth/occlusion-aware artwork mask,
   and a transparent protected artwork/sign/label pass at final output resolution.
3. Server verifies user identity, paid entitlement and remaining credits, then reserves
   a credit idempotently. Show upload disclosure and estimated credit cost before submission.
4. A Cloudflare Worker sends the scene and photorealism instructions to BFL.
   API credentials stay in Worker secrets; never in Vite variables or browser code.
5. A durable job records request ID and status. Poll BFL from the backend with bounded
   retries/timeouts, validated provider URLs, per-user access checks and rate limits.
6. Fetch the temporary provider result promptly into private short-lived storage.
7. Upscale the surroundings where needed, then composite the protected artwork pass
   over the output. AI must never regenerate the visible artwork pixels.
8. Show before/after preview. Download separately without overwriting the booth project.
   Failed jobs release reserved credits; repeat requests cannot double-charge.

## Protecting original artwork
- Prompt instructions alone cannot guarantee preservation.
- Restore visible original artwork, including user-approved image edits/stretch,
  through an occlusion-aware alpha pass from the same camera and renderer.
- Protect signs and price/title labels as well.
- Preserve edges around foreground obstructions and antialiasing.
- Check for geometry drift: if AI relocates walls or introduces objects across art,
  reject or flag the result rather than claiming it is an exact booth representation.
- A composited result can preserve art pixels but may retain existing light on those pixels.
  Exact art preservation takes priority over AI relighting.
- Label output as an AI-enhanced visualization, not measured documentation.

## Initial provider and resolution
- Evaluate pinned FLUX.2 pro for repeatable production image editing.
- BFL documents POST /v1/flux-2-pro, x-key authentication, input_image, and async polling.
- Current FLUX.2 image editing documentation states up to 4 megapixels.
- 4MP does not imply 4096x4096 or UHD 3840x2160.
- Define 1K/2K/4K in the UI as longest-edge pixels, retain aspect ratio, and
  budget a separately tested upscale stage for outputs above the provider pixel cap.
- Composite originals after upscaling so AI upscaling cannot repaint the artwork.

## Required setup before activation
1. BFL account with credits and API key installed as BFL_API_KEY in Cloudflare secrets.
2. Choose identity and subscription/billing integration for the wider Artist OS.
3. Configure private object storage and a durable job/credit ledger.
4. Agree included monthly credits, extra export pricing, and data retention/deletion.
5. Test a representative set of booths, exterior views, signs, stretched art and
   foreground occlusion; compare protected artwork pixels against the original pass.
6. Enable for internal users first, then a limited paid beta with cost monitoring.

Sources checked 2026-09-15:
- https://docs.bfl.ai/flux_2/flux2_image_editing
  (image inputs, asynchronous request/poll flow, 4MP maximum, temporary result URLs)

Do not ask for API keys in chat. Do not enable paid endpoints before server-side
entitlement, credit accounting, artwork protection and failure handling are ready.
