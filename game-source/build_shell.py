from pathlib import Path
import base64
import html
import json
import os
import re

ROOT = Path(__file__).parent


def load_catalog(locale="en"):
    if not re.fullmatch(r"[a-zA-Z0-9-]+", locale):
        raise ValueError("Locale must be a language tag such as en or fr-CA")
    base = json.loads((ROOT / "locales/en.json").read_text())
    translated = {} if locale == "en" else json.loads((ROOT / f"locales/{locale}.json").read_text())
    for key, value in translated.items():
        if key not in base:
            raise ValueError(f"Unknown copy key: {key}")
        if isinstance(value, dict) != isinstance(base[key], dict):
            raise ValueError(f"Copy key {key} must retain its text/plural type")
    messages = {**base, **translated}
    for key, value in messages.items():
        forms = value.values() if isinstance(value, dict) else [value]
        reference = base[key]["other"] if isinstance(base[key], dict) else base[key]
        if isinstance(value, dict) and ("other" not in value or not set(value) <= {"zero", "one", "two", "few", "many", "other"}):
            raise ValueError(f"Copy key {key} requires valid plural forms including other")
        for form in forms:
            if not isinstance(form, str) or set(re.findall(r"\{(\w+)\}", form)) != set(re.findall(r"\{(\w+)\}", reference)):
                raise ValueError(f"Copy key {key} must preserve named placeholders")
    return messages


def build_shell(locale="en"):
    messages = load_catalog(locale)
    shell = (ROOT / "shell.html").read_text()
    def text(match):
        value = messages[match[1]]
        if not isinstance(value, str):
            raise ValueError(f"Static copy {match[1]} cannot have plural forms")
        return html.escape(value, quote=True).replace("\n", "<br>")
    shell = re.sub(r"\{\{copy:([\w.-]+)\}\}", text, shell)
    shell = shell.replace('<html lang="en">', f'<html lang="{locale}">')
    # Prevent catalog text from terminating its script element in standalone HTML.
    catalog = json.dumps({"locale": locale, "messages": messages}, ensure_ascii=False).replace("<", "\\u003c")
    shell = shell.replace("{{COPY_CATALOG}}", catalog)
    for name in ("copy.js", "palette.js", "share.js", "app.js", "editor.js", "theme-welcome.js", "flow.js", "calendar.js", "tutorial-intro.js", "back.js", "rotate.js", "home.js"):
        shell = shell.replace(f'<script src="{name}"></script>', '<script>\n' + (ROOT / name).read_text() + '\n</script>')
    shell = shell.replace('fonts/Michroma.ttf', 'data:font/ttf;base64,' + base64.b64encode((ROOT / 'fonts/Michroma.ttf').read_bytes()).decode())
    shell = shell.replace('../public/favicon.svg', 'data:image/svg+xml;base64,' + base64.b64encode((ROOT.parent / 'public/favicon.svg').read_bytes()).decode())
    license_text = (ROOT / 'fonts/OFL-Michroma.txt').read_text()
    return shell.replace('</head>', '<!-- Bundled Michroma font license:\n' + license_text.replace('--', '—') + '\n-->\n</head>')


if __name__ == "__main__":
    (ROOT / "build").mkdir(exist_ok=True)
    (ROOT / "build/shell.html").write_text(build_shell(os.environ.get("COPY_LOCALE", "en")))
