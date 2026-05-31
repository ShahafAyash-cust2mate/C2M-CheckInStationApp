# Current Project State

Current stable version: v1.3

Main goals:
- Compact UI
- Large wall previews
- Minimal scrolling
- Touch-friendly

Set up new wall model selection:
- Load all charging wall models from the cloud on page load.
- Use the first 2 digits of the charging wall serial as the model designation.
- Known designations: 11 = C2M-403-G4-NS-WH, 12 = C2M-403-G4-WS-WH, 19 = C2M-403-G4-NS-GR, 20 = C2M-403-G4-WS-GR.
- Prefer a dedicated designation/prefix field from the cloud model when one exists.
- If no dedicated field exists, match the cloud model data against the designation mapping.
- If the prefix is unknown, warn the user and allow manual model selection.
- The selected model is editable and is the source of truth when saving.
