# Red de Patrullaje – Apps Script (API) + GitHub Pages (pantallas)

```
apps-script/   → se pega en Google Apps Script (base de datos, correos, lógica)
github/        → se sube a un repositorio de GitHub (app policial y panel)
```

## PARTE 1 – Apps Script (backend)

1. Cree una **Hoja de cálculo de Google** → menú **Extensiones → Apps Script**.
2. Cree estos archivos de **script** y pegue su contenido (mismo nombre, sin `.gs`):
   `Config`, `Db`, `Utils`, `Auth`, `Code`, `Api`, `Policia`.
   - En **Configuración del proyecto** marque "Mostrar archivo de manifiesto" y pegue `appsscript.json`.
   - Si tenía la versión anterior, **borre** los archivos HTML (`Admin`, `AdminJs`, `Policia` HTML, `PoliciaJs`, `Estilos`) y reemplace todos los `.gs`.
3. En `Config.gs` edite:
   - `SUPERADMIN_INICIAL.email` y `cedula`.
   - `FRONTEND_URL` → la dirección de GitHub Pages (paso 2.4), ej. `https://miusuario.github.io/red-patrullaje/`
4. **Implementar → Nueva implementación → tipo "Aplicación web"**
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquier persona**
   - Copie la **URL que termina en `/exec`**.
5. En el editor seleccione la función **`instalar`** → **Ejecutar** → autorice los permisos.
   Llega un correo con la clave temporal del Super Admin (también aparece en el registro de ejecución).

> Prueba: abra la URL `/exec` en el navegador. Debe mostrar `{"ok":true,"data":{"estado":"API activa"...}}`.

## PARTE 1B – Clave de Google Maps

1. Entre a https://console.cloud.google.com con su cuenta de Google.
2. Arriba: selector de proyecto → **Proyecto nuevo** → nombre `red-patrullaje` → Crear.
3. Menú ☰ → **Facturación** → vincule una cuenta de facturación (tarjeta). Es obligatorio para Google Maps,
   pero la API de mapas incluye un uso gratuito mensual (miles de cargas de mapa); un sistema de este tamaño normalmente no paga.
   Recomendado: Facturación → **Presupuestos y alertas** → cree un presupuesto de 1 USD con alerta por correo.
4. Menú ☰ → **APIs y servicios → Biblioteca** → busque **Maps JavaScript API** → **Habilitar**.
5. **APIs y servicios → Credenciales → + Crear credenciales → Clave de API**. Copie la clave (empieza con `AIza...`).
6. Haga clic en la clave para **restringirla** (importante, porque la clave queda visible en GitHub):
   - Restricciones de aplicación: **Sitios web** → Agregar: `https://TU-USUARIO.github.io/*`
   - Restricciones de API: **Restringir clave** → marque solo **Maps JavaScript API** → Guardar.
7. (Recomendado) Menú ☰ → **Google Maps Platform → Administración de mapas → Crear ID de mapa**
   → tipo **JavaScript** → Crear. Copie el **ID de mapa**. (Para pruebas puede dejar `DEMO_MAP_ID`).

## PARTE 2 – GitHub Pages (frontend)

1. Cree una cuenta en https://github.com (gratis).
2. Botón **New repository** → nombre `red-patrullaje` → **Public** → *Create repository*.
3. Edite `github/js/config.js` y pegue la URL `/exec`, la clave de Maps y el ID de mapa:
   ```js
   var API_URL = 'https://script.google.com/macros/s/XXXXXXXX/exec';
   var GOOGLE_MAPS_KEY = 'AIzaSy....';
   var GOOGLE_MAP_ID = 'DEMO_MAP_ID';   // o su ID de mapa
   ```
4. En el repositorio: **Add file → Upload files** → arrastre **todo el contenido** de la carpeta `github/`
   (`index.html`, `panel.html`, `manifest.json`, `sw.js` y las carpetas `css`, `js`, `icons`) → *Commit changes*.
5. **Settings → Pages** → *Source*: "Deploy from a branch" → Branch: `main` / `(root)` → **Save**.
   En 1–2 minutos aparece la dirección: `https://miusuario.github.io/red-patrullaje/`
6. Verifique que esa dirección sea la misma que puso en `FRONTEND_URL` (Config.gs). Si la cambió,
   vuelva a implementar: **Implementar → Gestionar implementaciones → ✏️ → Versión: Nueva → Implementar**.

## Direcciones finales
| Para | Dirección |
|---|---|
| Panel de control (Super Admin / Admin) | `https://miusuario.github.io/red-patrullaje/panel.html` |
| App policial (registro, ruta, escáner) | `https://miusuario.github.io/red-patrullaje/` |
| Cada QR impreso | `https://miusuario.github.io/red-patrullaje/?qr=CODIGO` |

En Android la app policial muestra el botón **"Instalar"** (queda con ícono como una app).
En iPhone: Safari → Compartir → "Agregar a pantalla de inicio".

## Cómo actualizar
- **Cambios en `.gs`**: Implementar → Gestionar implementaciones → ✏️ → *Nueva versión*.
  Así la URL `/exec` **no cambia**. (Si crea una implementación nueva, actualice `API_URL` en GitHub).
- **Cambios en HTML/JS**: suba el archivo modificado a GitHub; se actualiza en 1–2 minutos.
  Si un celular sigue mostrando la versión vieja, cambie `patrullaje-v1` por `patrullaje-v2` en `sw.js`.

## Problemas con el mapa
| Mensaje | Solución |
|---|---|
| "Configure GOOGLE_MAPS_KEY" | Falta la clave en `js/config.js`. |
| "Google Maps rechazó la clave" / mapa gris con "Esta página no puede cargar Google Maps" | API no habilitada, facturación sin vincular, o la restricción de sitios no incluye `https://TU-USUARIO.github.io/*`. Los cambios de restricción tardan hasta 5 minutos. |
| Marcadores no aparecen | Revise que `GOOGLE_MAP_ID` tenga un valor (`DEMO_MAP_ID` o su ID). |

## Notas
- Cédula: acepta 9 o 10 dígitos; siempre se guarda con 10 (antepone el 0).
- El repositorio público solo contiene las pantallas. Los datos, claves y correos quedan en Google.
- Cuota de correos: 100/día (Gmail) o 1.500/día (Google Workspace).
- La cámara requiere que el policía acepte el permiso la primera vez. Si lo negó:
  candado junto a la dirección → Permisos → Cámara → Permitir.
