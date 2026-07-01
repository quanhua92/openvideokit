# legacy/openvideokit-mvp (frozen)

The original monolithic MVP that shipped templates via Jinja2 + form submits +
`npx hyperframes render`. Kept here as a **reference**, not imported by the new
`openvideokit` package.

- Not on `sys.path` of the installed package.
- Modules are copied / re-implemented into `src/openvideokit/` as needed.
- Do not edit unless porting a specific piece forward.
