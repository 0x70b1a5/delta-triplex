# Editing game copy

Edit **en.json** for all shipped English interface text. Keys stay fixed when wording changes; edit the values only. No JavaScript or HTML edits are needed for existing copy.

The theme selector uses:

- `theme.welcome.title`, `.help`, `.note`, `.start`
- `theme.light.label` / `.description` (likewise `dark`, `system`, `colorful`)
- `theme.label` and `theme.lowContrast`

The same theme labels appear in the welcome dialog and Appearance menu. Other groups cover tutorials, menus (`ui` / `home`), editor, errors, rotation, sharing, difficulty descriptions, level names, and the site wrapper (`site`). User-entered puzzle names, share-link codes, saved preferences, and CSV column identifiers are data, not translated copy.

Values are plain text, never HTML. A newline (`\n` in JSON) produces a line break in HTML labels. Keep named placeholders such as `{time}`, `{count}`, and `{name}` intact; their order can change. Count-sensitive messages use plural objects with `one` and `other` entries. Both forms must retain the placeholders. Avoid splitting a new sentence into separately translated pieces.

Rebuild with `./build.sh`, then run `npm --prefix game-source test`. The build embeds the catalog into `public/game.html` and `dist/static/index.html`; exported playable HTML carries that catalog too. Do not edit generated HTML or `src/levels.h`. Built-in level names use stable catalog keys emitted by the puzzle generator, so renaming a level does not change its solution.

## Adding a translation

Copy `en.json` to a language-tag filename such as `fr.json`. A partial catalog is allowed: omitted keys fall back to English. Unknown keys, changed placeholder names, and invalid plural forms fail the build. Plurals follow `Intl.PluralRules` for the selected locale; add `zero`, `two`, `few`, or `many` where needed, and always include `other`.

Build a translated standalone game with `COPY_LOCALE=fr ./build.sh`. The document language, static labels, runtime messages, and offline exports all use that catalog. There is no runtime language picker yet. The React hosting wrapper currently imports English `site.*` copy; a future language-routing feature should select its catalog alongside the game locale.

## Adding new text in code

1. Add a stable key and English value to `en.json`.
2. In `shell.html`, use `{{copy:your.key}}` for text or text-bearing attributes.
3. In JavaScript, use `TriCopy.t("your.key", { name: value })` with `textContent`, `setAttribute`, or notifications. For an HTML template, use `TriCopy.html(...)` to escape both the message and its parameters.
4. Add every supported built-in level's `levels.N` key when adding levels. Protocol values (theme IDs, difficulty IDs, keyboard names) stay in code.

The copy tests exercise translated onboarding, runtime interpolation, plural rules, safe HTML escaping, English fallback, validation, and standalone export/reload.
