#!/usr/bin/env python3
"""Marca la versión en index.html para que el navegador cargue siempre los archivos nuevos.

Genera un import map con todos los módulos de js/ apuntando a «archivo.js?v=VERSIÓN» y añade ?v= al CSS
y a app.js. Ejecutar en cada versión nueva, después de subir APP_VERSION en js/version.js:
    python3 tools/versionar.py
"""
import json, pathlib, re

root = pathlib.Path(__file__).resolve().parent.parent
version = re.search(r"APP_VERSION = '([^']+)'", (root / 'js/version.js').read_text()).group(1)
mods = sorted(p.relative_to(root).as_posix() for p in (root / 'js').rglob('*.js'))
imports = {f'./{m}': f'./{m}?v={version}' for m in mods}
block = ('<!-- versión:inicio (generado por tools/versionar.py; no editar a mano) -->\n'
         '  <script type="importmap">\n  ' + json.dumps({'imports': imports}, ensure_ascii=False, indent=2).replace('\n', '\n  ') +
         '\n  </script>\n  <!-- versión:fin -->')
html = (root / 'index.html').read_text()
if '<!-- versión:inicio' in html:
    html = re.sub(r'<!-- versión:inicio.*?<!-- versión:fin -->', lambda _: block, html, flags=re.S)
else:
    html = html.replace('  <link rel="stylesheet" href="css/app.css', '  ' + block + '\n  <link rel="stylesheet" href="css/app.css', 1)
html = re.sub(r'href="css/app\.css(\?v=[^"]*)?"', f'href="css/app.css?v={version}"', html)
html = re.sub(r'src="js/app\.js(\?v=[^"]*)?"', f'src="js/app.js?v={version}"', html)
(root / 'index.html').write_text(html)
print(f'index.html marcado con la versión {version} ({len(mods)} módulos)')
