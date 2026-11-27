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

# Política de seguridad de contenidos (CSP): solo se ejecuta el código de esta web y los scripts en línea cuyo
# hash coincide (el import map y el aviso de navegador antiguo). Así, aunque se colara HTML ajeno, no se ejecutaría.
import base64, hashlib
supa = re.search(r"SUPABASE_URL = '(https://[^']+)'", (root / 'js/config.js').read_text())
supa = supa.group(1).rstrip('/') if supa else 'https://*.supabase.co'
inline = re.findall(r'<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>', html, flags=re.S)
hashes = ' '.join("'sha256-" + base64.b64encode(hashlib.sha256(code.encode()).digest()).decode() + "'" for code in inline)
csp = '; '.join([
    "default-src 'self'",
    f"script-src 'self' {hashes} https://cdnjs.cloudflare.com https://cdn.jsdelivr.net",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    f"img-src 'self' data: blob: {supa}",
    f"connect-src 'self' {supa} {supa.replace('https://', 'wss://')}",
    "worker-src 'self' blob:",
    "object-src 'none'", "base-uri 'self'", "form-action 'self'"
])
html = re.sub(r'<!-- csp:inicio -->.*?<!-- csp:fin -->',
              lambda _: f'<!-- csp:inicio -->\n  <meta http-equiv="Content-Security-Policy" content="{csp}">\n  <!-- csp:fin -->', html, flags=re.S)
(root / 'index.html').write_text(html)
print(f'index.html marcado con la versión {version} ({len(mods)} módulos, {len(inline)} scripts en línea con hash en la CSP)')
