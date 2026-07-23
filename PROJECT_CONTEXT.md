# Current Project State

Current stable version: v1.8

Main goals:
- Compact UI
- Large wall previews
- Minimal scrolling
- Touch-friendly

Set up new wall model selection:
- Load all charging wall models from `GET /check-in-stations/charging-wall-models` on page load.
- Use the first 2 characters of the charging wall serial as the serial prefix.
- Match exactly one cloud model where `model.serialPrefix === prefix`.
- The cloud response is the only source of truth for wall model selection.
- Remote cloud normalization preserves `serialPrefix` for the renderer and also keeps `SerialPrefix` for compatibility.
- Unknown or ambiguous prefixes block Save and show `Invalid wall serial number. Unknown serial prefix.` or an ambiguity error.
- The model selector is disabled; users cannot manually override the cloud-selected model.
- Welcome screen serial visibility and requirement come only from the selected model's `hasWelcomeScreen`.
