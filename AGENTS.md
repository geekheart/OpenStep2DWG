# OpenStep2DWG

- Keep STEP import, exact HLR projection, DWG encoding and roundtrip validation inside browser Web Workers. Static hosting must be sufficient.
- Keep the editor concise; explain workflows and limitations in README and docs.
- Preserve CAD millimetres, exact lines/arcs/NURBS, native dimensions and title blocks. Disclose any tolerance-based approximation.
- Use general geometric rules; never branch on a customer's board name, filename or coordinates.
- Do not commit private STEP/HDK archives, machine paths or local regression outputs. Use the generated demo fixture.
- After changing geometry or DWG output: run `npm test`, browser conversion/download tests, and independent CAD roundtrip verification where available.
- Keep all deployed paths relative so GitHub Pages project sites work.
- Maintain the source and licensing notices for the two replaceable WebAssembly engines.

## Localization, licensing and releases

- Keep `README.md` in Simplified Chinese and maintain a complete `README.en.md`; put reciprocal language links at the top.
- Application code is MIT, copyright 2026 geekheart. Keep `package.json` / lockfile licensing aligned and preserve third-party licenses and notices.
- Default to `zh-CN`. The header `#language-select` offers `zh-CN` and `en`; `?lang=en` deep-links to English without storing a design or resetting a session.
- Put UI strings, dynamic statuses, validation errors, Worker progress, aria labels and tooltips in explicit keys in `src/i18n.js`. Annotate static UI with `data-i18n` / attribute keys; never scan Chinese text or translate rendered user data.
- Worker progress and errors must carry `messageKey` and `values` so the main thread can render them in the current language even when the language changes during computation. Never tie recovery or geometry behavior to translated text.
- Language changes preserve model geometry, layout, history, filenames and user-entered title-block content. Keep JSON keys, CAD layer names, units, native entities and technical drawing conventions stable.
- Keep a local inline SVG GitHub link `#github-link` to this repository, with translated accessible text, `target="_blank"` and `rel="noopener noreferrer"`.
- Check both languages, English deep links, language switching with an edited project, Worker messages and export feedback. Locale tests must verify CAD output and project data do not change.
- Release tags must match package and lockfile versions. Add bilingual `docs/releases/V<version>.md` notes and a changelog entry before publishing; the tag Action uses these notes for the GitHub Release.
