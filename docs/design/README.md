# Design mocks (Claude Design export)

Snapshot export of the Claude Design project for the Q Hub / Anahit Friendly Chess Tournament. **Claude Design remains the editable source**; this copy is for versioning and offline reference. Open the `.dc.html` files in a browser from this folder (relative references to `support.js`, `doc-page.js`, `ios-frame.jsx` and `assets/` keep working because paths mirror the project).

- Project: https://claude.ai/design/p/b421af49-ce2b-4f55-b421-ebce41d2ae91
- Exported: 2026-09-30

The shipped site lives in `web/` and may have diverged from these mocks.

| Purpose | File | Etag | Note |
|---|---|---|---|
| Registration phase | `Chess Tournament Registration.dc.html` | 1790085405408408 | Desktop page with countdown, rules, register card, players |
| Registration phase | `Chess Tournament Registration Mobile.dc.html` | 1790002484745815 | iPhone frames of the registration page |
| Play phase | `Chess Tournament.dc.html` | 1790085405408408 | Desktop page with standings (single round robin) |
| Play phase | `Chess Tournament Mobile.dc.html` | 1789492015362582 | iPhone frames of the play page |
| Groups format | `Chess Tournament Groups.dc.html` | 1790608148467991 | Group stage + knockout bracket, stage switch via `?stage=` |
| Groups format | `Chess Tournament Groups Mobile.dc.html` | 1790607690199622 | iPhone frames: group stage, semis, finished |
| Print | `Chess Tournament Flyer.dc.html` | 1790153584108490 | A4 flyer with registration QR |
| Print | `Chess Tournament Flyer-print.dc.html` | 1790154161896784 | Print-frozen copy of the flyer |
| Print | `Chess Set Tags.dc.html` | 1790773940435174 | Kitchen chess set tags, 4 per A4 |
| Print | `Chess Set Tags-print.dc.html` | 1790774532570832 | Print-frozen copy of the set tags |
| Homepage | `Pouya Homepage.dc.html` | 1790077617540839 | Personal landing page |
| Runtime/support | `support.js` | 1789483330860107 | Runtime for `.dc.html` files |
| Runtime/support | `doc-page.js` | 1790000742878769 | `<doc-page>` paged-document component for print files |
| Runtime/support | `ios-frame.jsx` | 1789491975121539 | iPhone device frame used by the mobile canvases |
| Design system | `_ds/nafinco-design-system-019e01f6-6a65-7309-a936-21e4ecd4ed77/` | 1789483260105951 | README, tokens.css, manifest (Nafinco system) |
| Assets | `assets/qr-home.svg`, `assets/qr-register.svg` | 1790773916909807, 1790153442532791 | QR codes used by set tags and flyer |

## Skipped

- `.thumbnail`, `screenshots/`, `uploads/`: binary previews and pasted images.
- `assets/hero-simul.png` (2 MB): `web/assets` already has a jpg. The play and registration mocks reference it, so their hero image will not render here.
- `_ds/.../_ds_bundle.js`, `_ds/.../_adherence.oxlintrc.json`: generated or lint config, redundant.
