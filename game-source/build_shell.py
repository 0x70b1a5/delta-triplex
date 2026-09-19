from pathlib import Path
root=Path(__file__).parent
(root/'build').mkdir(exist_ok=True)
shell=(root/'shell.html').read_text()
for name in ('palette.js','share.js','app.js','editor.js','flow.js','back.js','rotate.js'):
    shell=shell.replace(f'<script src="{name}"></script>', '<script>\n'+(root/name).read_text()+'\n</script>')
(root/'build/shell.html').write_text(shell)
