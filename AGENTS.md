# OpenStep2DWG

- Keep STEP import, exact HLR projection, DWG encoding and roundtrip validation inside browser Web Workers. Static hosting must be sufficient.
- Keep the editor concise; explain workflows and limitations in README and docs.
- Preserve CAD millimetres, exact lines/arcs/NURBS, native dimensions and title blocks. Disclose any tolerance-based approximation.
- Use general geometric rules; never branch on a customer's board name, filename or coordinates.
- Do not commit private STEP/HDK archives, machine paths or local regression outputs. Use the generated demo fixture.
- After changing geometry or DWG output: run `npm test`, browser conversion/download tests, and independent CAD roundtrip verification where available.
- Keep all deployed paths relative so GitHub Pages project sites work.
- Maintain the source and licensing notices for the two replaceable WebAssembly engines.
