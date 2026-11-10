# Bonsai Care

A mobile web app (PWA) for winterizing and caring for bonsai: a 50-species care library, a “My trees” collection stored on the device, a month-by-month task list, USDA hardiness-zone lookup, and leaf identification.

Live: https://dpalcic-create.github.io/bonsai-care/

## Photo identification

The guided leaf key works entirely offline. Photo identification uses the [Pl@ntNet identify API](https://my.plantnet.org). Paste your own free personal API key in Settings (it is stored only on the device). Enable “Expose my API key” and authorize the domain `https://dpalcic-create.github.io`.

## Hardiness zones

ZIP lookup is derived from the 2023 USDA Plant Hardiness Zone Map ZIP tables published by the PRISM Climate Group at Oregon State University / USDA-ARS. This in-app lookup is **not** the official USDA Plant Hardiness Zone Map. A tree in a shallow pot is typically about 1–2 zones less hardy than the same species in the ground.

## Privacy

My trees, photos, notes, and the Pl@ntNet key stay on the device (localStorage and IndexedDB). There is no app server.
