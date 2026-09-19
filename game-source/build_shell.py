from pathlib import Path
import base64
root=Path(__file__).parent
(root/'build').mkdir(exist_ok=True)
shell=(root/'shell.html').read_text()
for name in ('palette.js','share.js','app.js','editor.js','theme-welcome.js','flow.js','back.js','rotate.js','home.js'):
    shell=shell.replace(f'<script src="{name}"></script>', '<script>\n'+(root/name).read_text()+'\n</script>')
shell=shell.replace('fonts/Michroma.ttf', 'data:font/ttf;base64,'+base64.b64encode((root/'fonts/Michroma.ttf').read_bytes()).decode())
shell=shell.replace('../public/favicon.svg', 'data:image/svg+xml;base64,'+base64.b64encode((root.parent/'public/favicon.svg').read_bytes()).decode())
license_text=(root/'fonts/OFL-Michroma.txt').read_text()
shell=shell.replace('</head>', '<!-- Bundled Michroma font license:\n'+license_text.replace('--', '—')+'\n-->\n</head>')
(root/'build/shell.html').write_text(shell)
