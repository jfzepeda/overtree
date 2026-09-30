# Overtree

Editor de LaTeX **local-first** con colaboración en tiempo real por red local (LAN) y un
servidor **MCP** para que asistentes de IA (Claude, ChatGPT) lean, editen y compilen tus
proyectos directamente.

Es, a grandes rasgos, "Overleaf, pero todo vive en tu máquina": los proyectos son carpetas
normales, el compilador corre en local y quien esté en tu red edita contigo en vivo.

---

## Índice

1. [La necesidad que resuelve](#la-necesidad-que-resuelve)
2. [Qué hace](#qué-hace)
3. [Cómo funciona](#cómo-funciona)
4. [Instalación y uso](#instalación-y-uso)
5. [Dónde viven tus archivos](#dónde-viven-tus-archivos)
6. [Conectar clientes de IA (MCP)](#conectar-clientes-de-ia-mcp)
7. [App de escritorio (Electron)](#app-de-escritorio-electron)
8. [Configuración](#configuración)
9. [Estructura del repositorio](#estructura-del-repositorio)
10. [Seguridad y limitaciones conocidas](#seguridad-y-limitaciones-conocidas)
11. [Fuera del alcance de v1](#fuera-del-alcance-de-v1)
12. [Stack](#stack)

---

## La necesidad que resuelve

Escribir documentos en LaTeX (papers, tesis, reportes, presentaciones, currículums) hoy te
obliga a elegir entre dos extremos:

| Opción | Problema |
| --- | --- |
| **Overleaf / servicios en la nube** | Tus documentos viven en un servidor ajeno, requieren cuenta e internet, y la colaboración o los tiempos de compilación suelen estar limitados por plan. |
| **TeX local (TeX Live + editor)** | Privado y rápido, pero **no hay colaboración** en vivo y la instalación de TeX Live es pesada. |

Además, los asistentes de IA hoy trabajan "a ciegas" con LaTeX: pueden sugerir código, pero
no pueden abrir tu proyecto, aplicar el cambio, compilar y ver si falló.

Overtree cubre ese hueco:

- **Privacidad y propiedad**: nada sale de tu máquina; cada proyecto es una carpeta que puedes
  versionar con `git`, respaldar o mover.
- **Colaboración sin nube**: compartes una URL de tu red local y otros editan contigo con
  cursores en vivo.
- **Sin instalar TeX Live**: usa [Tectonic](https://tectonic-typesetting.github.io/), un motor
  TeX autocontenido que descarga solo los paquetes que necesita.
- **IA con manos**: un servidor MCP le da a la IA herramientas reales (leer, editar, compilar,
  ver el PDF) sobre tus proyectos, y los cambios aparecen en vivo en los editores abiertos.

---

## Qué hace

- **Editor en el navegador** basado en CodeMirror 6 (`basicSetup`: búsqueda, historial,
  autocompletado básico…) con resaltado LaTeX (`stex`) y tema oscuro.
- **Edición colaborativa en tiempo real** con cursores y presencia de cada persona, usando CRDTs
  (Yjs). Sin conflictos de fusión.
- **Compilación con un clic** (`Cmd+Enter`) con Tectonic; el log llega en streaming y los errores
  (`! ...` + `l.<línea>`) se extraen para mostrarse.
- **Vista previa del PDF** integrada, junto al editor.
- **Árbol de archivos** del proyecto (crear y borrar archivos o carpetas desde la UI; subir y
  renombrar están disponibles en la capa de archivos/API, pero no tienen botón en la UI).
- **Proyectos públicos o privados**: los públicos solo piden un nombre para entrar; los privados
  además piden contraseña (guardada con bcrypt).
- **Plantillas**: `article`, `beamer`, `report`, `letter`, `ieee`, `blank`.
- **Servidor MCP** con 13 herramientas + un recurso para navegar archivos del proyecto.
- **Empaquetado como app de macOS** (`.dmg`) con Electron.

---

## Cómo funciona

### Vista general

```
   Navegadores (LAN)                    Clientes de IA
   ┌────────────┐ ┌────────────┐      ┌───────────────┐ ┌────────────────┐
   │  Editor A  │ │  Editor B  │      │ Claude Desktop│ │ ChatGPT Desktop│
   └─────┬──────┘ └─────┬──────┘      │ / Claude Code │ └───────┬────────┘
         │ HTTP + WS (/_yjs/…)        └───────┬───────┘         │ HTTP
         │                                stdio│                │ /api/mcp
   ┌─────▼────────────────────────────────────▼─────────────────▼───────┐
   │  server.ts  (http + Next.js 16 + WebSocketServer para Yjs)         │
   │                                                                    │
   │  app/            UI + rutas /api/*                                 │
   │  lib/yjs/        salas Yjs (1 sala por archivo) + sync con disco   │
   │  lib/core/       proyectos, archivos, compilación, auth, settings  │
   │  lib/mcp/        herramientas MCP (compartidas por stdio y HTTP)   │
   └─────────────────────────────┬──────────────────────────────────────┘
                                 │ fs / spawn
                 ┌───────────────▼───────────────┐
                 │  ~/Documents/Overtree/projects │  ←  carpetas normales
                 │  tectonic (proceso hijo)       │
                 └────────────────────────────────┘
```

### 1. Un servidor Node personalizado (`server.ts`)

Un único proceso levanta un `http.Server` que sirve la app de **Next.js** y, en el mismo puerto,
acepta *upgrades* de WebSocket. Las conexiones a `/_yjs/…` van al servidor de Yjs; cualquier otro
*upgrade* (por ejemplo el HMR de Next en desarrollo) se delega a Next. Escucha en `0.0.0.0` para
ser alcanzable desde la LAN e imprime en consola las URLs locales y de red.

> Se fuerza `webpack: true` porque con servidor custom + Turbopack la hidratación se queda
> colgada en Next 16.

### 2. Colaboración en tiempo real (`lib/yjs/`)

- Cada **archivo** de cada proyecto es una *sala* (`Room`) con un `Y.Doc` y un `Y.Text`. El
  nombre de sala es `<projectId>:<ruta en base64url>`.
- El protocolo de sincronización de `y-websocket` está implementado **inline** con
  `y-protocols` (sync + awareness), sin depender del servidor de referencia.
- **Persistencia de historia CRDT**: el estado binario del documento se guarda en
  `.overtree/yjs/<archivo>.bin`. Así, tras reiniciar el servidor, los clientes que se reconectan
  fusionan limpiamente en vez de duplicar contenido.
- **Sincronización con el disco**, en ambos sentidos:
  - *Yjs → disco*: los cambios se escriben al archivo real con *debounce* (800 ms).
  - *Disco → Yjs*: `chokidar` vigila el archivo; si otra herramienta lo modifica (un `git checkout`,
    otro editor, una escritura de MCP), el cambio se refleja en el `Y.Text` y llega a todos los
    editores abiertos. Se usan hashes SHA-1 para no reaccionar a las propias escrituras (evita bucles).
- Las salas inactivas (sin conexiones) se liberan tras 5 minutos.

### 3. Acceso y sesiones (`lib/core/auth.ts`)

- Al entrar a un proyecto (`POST /api/join/[id]`) das un nombre; si es privado, también la
  contraseña (`bcryptjs`). El servidor emite una cookie **iron-session** cifrada (7 días) que
  recuerda a qué proyectos tienes acceso.
- El *upgrade* de WebSocket de Yjs valida esa misma cookie antes de aceptar la conexión.
- El `sessionSecret` se genera aleatoriamente la primera vez y se guarda en `~/.overtree/settings.json`.

### 4. Compilación (`lib/core/compile.ts`)

1. Antes de compilar, se **vuelca a disco** cualquier edición pendiente de Yjs, para compilar
   siempre lo último.
2. Se ejecuta `tectonic -X compile <main> --outdir output --keep-logs` dentro de la carpeta del
   proyecto.
3. stdout/stderr se emiten como eventos; `GET /api/compile/[id]` los transmite por **SSE** (y
   reproduce el log si te conectas tarde).
4. Al terminar se parsean los errores del log y se comprueba que `output/<main>.pdf` exista.
5. Solo hay una compilación activa por proyecto: si pides otra mientras corre, recibes la misma sesión.

### 5. Almacenamiento (`lib/core/storage.ts`, `projects.ts`, `files.ts`)

Un proyecto es una carpeta con UUID. Los metadatos (nombre, plantilla, archivo principal,
privacidad, hash de contraseña) van en `.overtree/project.json`. Todas las rutas de archivo se
resuelven con `resolveInProject`, que **rechaza rutas absolutas y `..`** (protección contra
*path traversal*) y valida que el id de proyecto sea seguro.

### 6. Servidor MCP (`lib/mcp/server.ts`)

Una sola definición de herramientas, expuesta por **dos transportes**:

- **stdio** (`mcp-server/stdio.ts`) para Claude Desktop y Claude Code.
- **HTTP streamable** (`POST/GET/DELETE /api/mcp`) para ChatGPT Desktop u otros clientes remotos.

| Herramienta | Qué hace |
| --- | --- |
| `list_projects` / `get_project_info` | Lista proyectos / devuelve metadatos (sin el hash de contraseña). |
| `create_project` / `delete_project` | Crea desde una plantilla / borra (exige `confirm: true`). |
| `list_templates` | Plantillas disponibles. |
| `list_files` / `read_file` | Árbol de archivos / contenido de un archivo de texto. |
| `write_file` / `edit_file` | Crea o sobrescribe / reemplaza **exactamente una** ocurrencia (falla si no existe o es ambigua). |
| `delete_file` | Borra archivo o carpeta (exige `confirm: true`). |
| `compile` | Compila y espera; devuelve éxito, errores parseados y la cola del log. |
| `get_compile_log` | Último log de compilación completo. |
| `get_pdf` | PDF compilado en base64, para que la IA lo inspeccione. |

Además expone el recurso `overtree://projects/{project_id}/{path}` para navegar archivos.

Cuando el servidor web está corriendo, las escrituras de MCP se aplican también a la sala de
Yjs, y `chokidar` cubre el caso de que el MCP corra en otro proceso: **los cambios de la IA
aparecen en vivo en los navegadores conectados**.

---

## Instalación y uso

### Requisitos

- macOS (la app empaquetada es solo macOS; el servidor web debería funcionar en otros sistemas
  con Node, pero no se ha probado).
- [Bun](https://bun.sh) (o Node + un gestor de paquetes; el repo trae `bun.lock`).
- [Tectonic](https://tectonic-typesetting.github.io/) en el `PATH`.

### Modo servidor (desarrollo)

```bash
# 1. Motor LaTeX
brew install tectonic

# 2. Dependencias
bun install

# 3. Arrancar
bun run dev
```

La consola imprime algo como:

```
  Overtree is up.

  Local:    http://localhost:3000
  Network:  http://192.168.1.42:3000
```

Abre la URL de *Network* en cualquier navegador de la misma red para colaborar. Puedes cambiar el
puerto con `PORT=4040 bun run dev`.

> Si macOS pide permiso, permite las conexiones entrantes en
> *Ajustes del Sistema → Red → Firewall*.

### Scripts

| Comando | Descripción |
| --- | --- |
| `bun run dev` | Servidor en modo desarrollo (`tsx watch server.ts`). |
| `bun run build` | `next build`. |
| `bun run start` | Servidor en modo producción. |
| `bun run doctor` | Diagnóstico: Tectonic instalado, settings, IPs de LAN. |
| `bun run mcp` | Servidor MCP por stdio. |
| `bun run mcp-config` | Imprime los snippets de configuración MCP. |
| `bun run electron:dev` | Next + Electron en desarrollo. |
| `bun run electron:build:server` | Empaqueta `server.ts` y el MCP a `dist/*.cjs` con esbuild. |
| `bun run app:dist` | Genera el instalador de macOS (`release/*.dmg` y `.zip`). |

### Atajos de teclado

| Atajo | Acción |
| --- | --- |
| `Cmd+S` | Guardar (vuelca Yjs a disco y encola una compilación). |
| `Cmd+Enter` | Compilar. |
| `Cmd+Z` / `Cmd+Shift+Z` | Deshacer / rehacer (undo colaborativo de Yjs). |

---

## Dónde viven tus archivos

```
~/Documents/Overtree/projects/
└── <uuid-del-proyecto>/
    ├── main.tex
    ├── refs.bib
    ├── output/
    │   └── main.pdf
    └── .overtree/
        ├── project.json      # metadatos (nombre, plantilla, privacidad, hash…)
        └── yjs/*.bin         # historia CRDT por archivo
```

Cada proyecto es una carpeta común: puedes hacer `git init` dentro, respaldarla o copiarla a otro lado.

---

## Conectar clientes de IA (MCP)

Con el servidor corriendo, abre <http://localhost:3000/settings> para ver snippets listos para
copiar, o ejecuta:

```bash
bun run mcp-config
```

| Cliente | Transporte | Cómo |
| --- | --- | --- |
| Claude Desktop | stdio | Pega el JSON en `~/Library/Application Support/Claude/claude_desktop_config.json` y reinicia. |
| Claude Code | stdio | `claude mcp add overtree -- bun /ruta/a/overtree/mcp-server/stdio.ts` |
| ChatGPT Desktop / otros | HTTP | Agrega `http://<ip-lan>:3000/api/mcp` como conector. |

Ejemplo de flujo: *"Crea un proyecto `ieee`, reescribe la introducción, compila y dime si hay errores."*
La IA usa `create_project` → `edit_file` → `compile` → `get_compile_log`, y tú ves el texto cambiar
en el editor mientras ocurre.

---

## App de escritorio (Electron)

`electron/main.cjs` empaqueta todo como app de macOS:

1. Busca un **puerto libre** y lanza `dist/server.cjs` como proceso hijo (con
   `ELECTRON_RUN_AS_NODE=1` y `OVERTREE_BUNDLE_ROOT` apuntando al bundle).
2. Espera hasta 30 s a que el puerto responda; si no, muestra un error con la ruta del log
   (`overtree-server.log` en la carpeta de logs de la app).
3. Abre una `BrowserWindow` apuntando a ese servidor local.
4. Solo permite una instancia y mata el servidor al cerrar.

El servidor se compila a CommonJS con **esbuild** (`scripts/build-server.mjs`); dependencias como
`next`, `ws`, `yjs` o `chokidar` quedan como *externals* y se resuelven desde `node_modules`.
`electron-builder` genera `.dmg` y `.zip` para `arm64` y `x64`.

Para desarrollo: `bun run electron:dev` espera al puerto **3737**, así que usa `"port": 3737` en
`~/.overtree/settings.json` o `PORT=3737`.

---

## Configuración

`~/.overtree/settings.json` se crea en el primer arranque:

```json
{
  "rootDir": "~/Documents/Overtree/projects",
  "port": 3000,
  "defaultEngine": "tectonic",
  "sessionSecret": "…generado…"
}
```

Reinicia para aplicar cambios. `PORT` en el entorno tiene prioridad sobre `port`.

---

## Estructura del repositorio

```
app/                    UI (Next.js App Router) y rutas API
  api/                  projects, files, save, compile (SSE), join, me, system, templates, mcp, health
  projects/             lista de proyectos, editor y pantalla de "unirse"
  settings/             snippets de conexión MCP y estado del sistema
components/             editor (CodeMirror + Yjs), árbol de archivos, visor PDF, log, presencia
lib/
  core/                 settings, storage, projects, files, templates, compile, auth
  yjs/                  doc-manager (salas + sync con disco) y ws-server (protocolo)
  mcp/server.ts         herramientas MCP compartidas
  lan.ts, identity.ts   IPs de red; nombre/color del usuario en el cliente
mcp-server/stdio.ts     entrada MCP por stdio
electron/               proceso principal y preload de la app de escritorio
scripts/                doctor, build-server (esbuild), print-mcp-config, probes de Yjs/HMR
templates/              article, beamer, blank, ieee, letter, report
server.ts               servidor HTTP + Next + WebSocket
```

---

## Seguridad y limitaciones conocidas

Overtree está pensado para una **red local de confianza**, no para exponerse a internet.

- **La contraseña de un proyecto protege la página del editor y el WebSocket de Yjs, pero no las
  rutas REST ni MCP.** `/api/projects`, `/api/files/*`, `/api/save/*`, `/api/compile/*` y
  `/api/mcp` no verifican la sesión; cualquiera que alcance el puerto puede listar, leer o
  escribir proyectos si conoce (o adivina) los ids. No lo expongas fuera de una LAN de confianza.
- Las cookies se emiten con `secure: false` (HTTP plano, por diseño para LAN).
- El servidor escucha en `0.0.0.0` (`server.ts` no respeta la variable `HOSTNAME`), también en la
  app de escritorio.
- **Tectonic no va incluido** en la app: hay que instalarlo aparte. Una app abierta desde
  Finder/Dock hereda un `PATH` reducido en macOS que puede no incluir `/opt/homebrew/bin`, y
  `electron/main.cjs` no lo ajusta; si la compilación falla en la app pero funciona en terminal,
  es la primera pista.
- En la app de escritorio el puerto es aleatorio, por lo que la URL de LAN que muestra
  `/api/system` (basada en `settings.port`) puede no coincidir con el puerto real.
- La vista previa del PDF usa el visor nativo del navegador en un `<iframe>`.

## Fuera del alcance de v1

- SyncTeX (clic PDF ↔ código)
- Gestor de bibliografía con búsqueda en CrossRef
- Interfaz de Git
- Comentarios de revisión en línea
- Corrector ortográfico
- Exportar a Word

## Stack

Next.js 16 (App Router) · React 19 · CodeMirror 6 · Yjs + `y-protocols` (servidor de sync
implementado inline) · `ws` · Tectonic · `@modelcontextprotocol/sdk` · iron-session · bcryptjs ·
chokidar · Tailwind CSS 4 · Electron 33 + electron-builder · esbuild · TypeScript · Bun.
