# Repaso OPOS · Tarjetas

App de tarjetas de repaso (flashcards) para la oposición de **Maestro de Educación Primaria** (Comunitat Valenciana). Funciona en **móvil, tablet y ordenador**, se puede **instalar como app** (PWA) y **funciona sin conexión**.

## ¿Qué hace?

1. Abres la app y **eliges uno o varios temas** (multiselección; hay un botón «Seleccionar todos»).
2. Eliges cuántas tarjetas quieres esta sesión: **15, 30, 50 o todas**.
3. Empiezan a aparecer preguntas abiertas. **Tocas la tarjeta y se gira** para ver la respuesta.
4. En cada tarjeta puedes pulsar **«Ver opciones (test)»** para responder entre **4 opciones** (incluidas del tipo *«A y B son correctas»*). Te marca en verde/rojo si aciertas.
5. Te autoevalúas con **«La sabía / No la sabía»** y, al final, ves tu resultado y puedes **repasar solo las falladas**.

- **2.400 preguntas** en total: **100 por cada uno de los 24 temas** desarrollados.
- Barajado aleatorio, swipe para pasar (móvil) y flechas ← → (teclado).

## Archivos

```
flashcards-opos/
├── index.html          ← la app (interfaz y estilos)
├── app.js              ← lógica (selección, sesión, giro, test, resultados)
├── data/preguntas.js   ← BANCO DE PREGUNTAS (aquí se editan/añaden)
├── manifest.webmanifest← configuración de la app instalable
├── sw.js               ← service worker (uso sin conexión)
├── icons/              ← iconos de la app
└── _serve.js           ← solo para probar en local (no afecta al publicar)
```

## Publicar en GitHub Pages (acceder desde cualquier móvil/tablet)

1. Crea una cuenta en <https://github.com> (si no la tienes).
2. Crea un repositorio nuevo, por ejemplo `repaso-opos` (público).
3. Sube **el contenido de esta carpeta** (`index.html`, `app.js`, la carpeta `data/`, `icons/`, `manifest.webmanifest`, `sw.js`). Puedes arrastrarlos en *Add file → Upload files*.
4. Ve a **Settings → Pages**.
5. En *Build and deployment → Source* elige **Deploy from a branch**, rama **main** y carpeta **/(root)**. Guarda.
6. Espera 1-2 minutos: aparecerá la URL pública, tipo
   `https://TU-USUARIO.github.io/repaso-opos/`
7. Abre esa URL en el móvil/tablet. En el navegador, usa **«Añadir a pantalla de inicio»** para instalarla como app.

> Si prefieres lo más rápido sin cuenta técnica: entra en <https://app.netlify.com/drop> y **arrastra la carpeta** `flashcards-opos`. Te dará una URL al instante.

## Probar en local

Desde esta carpeta: `node _serve.js` y abre <http://localhost:8123>.

## Añadir o editar preguntas

Edita `data/preguntas.js`. Cada pregunta es un objeto:

```js
{ id:"t1-031", tema:1,
  q:"Texto de la pregunta abierta",
  a:"Respuesta que aparece al girar la tarjeta",
  opciones:["A ...","B ...","C ...","D ..."],   // 4 opciones, orden fijo A-D
  correcta:0 },                                  // índice 0-3 de la opción correcta
```

- El `id` debe ser **único**.
- Las opciones **no se barajan**, para que funcionen las del tipo *«A y B son correctas»* (colócalas como opción C o D refiriéndose a las opciones A y B, que van primero).
- Para que las novedades se descarguen estando la app instalada, **sube el número de versión** en `sw.js` (`var VERSION = 'repaso-opos-v2';`).

## Temas incluidos

Bloque docente (1-6), Conocimiento del Medio (7-10), Educación Artística (12-13), Lengua Castellana y Literatura (14-19) y Matemáticas (20-25). *(No existe Tema 11 en el temario.)*
