# Red de Patrullaje – Apps Script (API) + GitHub Pages (pantallas)

```
apps-script/   → se pega en Google Apps Script (base de datos, fotos y lógica)
github/        → se sube a un repositorio de GitHub (app policial y panel)
```

## PARTE 1 – Apps Script (backend)

1. Cree una **Hoja de cálculo de Google** → menú **Extensiones → Apps Script**.
2. Cree estos archivos de **script** y pegue su contenido (mismo nombre, sin `.gs`):
   `Config`, `Db`, `Utils`, `Auth`, `Code`, `Api`, `Policia`.
   - En **Configuración del proyecto** marque "Mostrar archivo de manifiesto" y pegue `appsscript.json`.
   - Si tenía la versión anterior, **borre** los archivos HTML (`Admin`, `AdminJs`, `Policia` HTML, `PoliciaJs`, `Estilos`) y reemplace todos los `.gs`.
3. En `Config.gs` edite:
   - `SUPERADMIN_INICIAL.email` y **`cedula`** (su cédula real: será su usuario y su clave inicial).
   - `FRONTEND_URL` → la dirección de GitHub Pages (paso 2.4), ej. `https://miusuario.github.io/red-patrullaje/`
4. **Implementar → Nueva implementación → tipo "Aplicación web"**
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquier persona**
   - Copie la **URL que termina en `/exec`**.
5. En el editor seleccione la función **`instalar`** → **Ejecutar** → autorice los permisos.
   Esto crea las hojas, el Super Admin y la **limpieza diaria automática de fotos**.
   Ingrese al panel con su **cédula como usuario y como clave** (con o sin el 0); se le pedirá cambiarla.
   > El manifiesto activa el servicio avanzado **Drive API** (necesario para borrar fotos definitivamente).
   > Si el editor lo pide, en "Servicios" ➕ agregue **Drive API (v3)**.

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

## Sin correos
- El sistema **no envía correos**. Usuario y clave inicial de cada persona = **su cédula** (con o sin el 0); en el primer ingreso debe cambiarla.
- "Olvidé mi clave": el administrador la restablece con 🔑 (vuelve a ser la cédula).
- Las mallas se comparten con el botón **📄 PDF** (WhatsApp, chats de trabajo, etc.).

## Asignación de personal (pantalla Usuarios)
- Cree la malla (puntos, horas y vigencia) y luego asigne el personal desde **Usuarios**.
- Colores: ⚪ sin malla · 🟢 1 malla · 🟣 2 o más mallas.
- **Asignar** (uno o varios usuarios marcados → una o varias mallas), **Mover** (de una malla a otra u otras), **Limpiar** (retira de todas sus mallas vigentes).
- Nunca se permiten mallas que se crucen en fechas y horario para la misma persona; si hay un cruce en un lote, no se guarda nada.

## Fotos de evidencia: 10 días
- Las fotos se **borran definitivamente** a los `FOTOS_DIAS` (10) días con una tarea diaria automática (3:00 a.m.). Ajustable en `Config.gs`.

## Control anti-fraude (GPS + foto) y mallas con vigencia
- Flujo del policía: **escanear QR → botón "Activar GPS" → foto en vivo** (reto al azar: adelante, derecha, izquierda o atrás). No existe opción de adjuntar fotos de la galería.
- Si el celular está a más de `GEOCERCA_M` (50 m) del QR, el escaneo queda **NO VÁLIDO** con la ubicación real como evidencia y no cuenta para el cumplimiento. Cada QR puede tener su propio radio (campo "Radio de geocerca").
- Las fotos se guardan en Google Drive, carpeta **"Red de Patrullaje - Evidencias"**, del dueño del script (privadas).
- Ajustes en `Config.gs`: `GEOCERCA_M`, `GPS_PRECISION_MAX_M`, `FOTO_OBLIGATORIA`, `FOTOS_POR_ESCANEO`, `FOTO_LIMITE_SEG`.
- Las mallas tienen vigencia **desde/hasta** y PDF (📄).
- Las hojas se actualizan solas con las columnas nuevas (no hace falta volver a ejecutar `instalar`).

## Notas
- Cédula: acepta 9 o 10 dígitos; siempre se guarda con 10 (antepone el 0).
- El repositorio público solo contiene las pantallas. Los datos, claves y fotos quedan en Google.
- La cámara requiere que el policía acepte el permiso la primera vez. Si lo negó:
  candado junto a la dirección → Permisos → Cámara → Permitir.
