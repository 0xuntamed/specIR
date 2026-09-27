import type { Spec } from "../../ir/types";
import { Imports } from "../imports";
import { HEADER, MARKER } from "../names";
import { humanize, type Site } from "./site";

const VERSIONS = {
  "@types/react": "^19.3.0",
  "@types/react-dom": "^19.3.0",
  "@vitejs/plugin-react": "^6.1.1",
  react: "^19.3.0",
  "react-dom": "^19.3.0",
  "react-router": "^8.4.0",
  typescript: "^7.0.2",
  vite: "^8.3.1",
};
const pick = (names: string[]) => Object.fromEntries(names.map((n) => [n, VERSIONS[n as keyof typeof VERSIONS]]));

export function webPackageJson(spec: Spec): string {
  const pkg = {
    "//": `${MARKER} — do not edit`,
    name: `${spec.app.name}-web`,
    version: "0.0.0",
    private: true,
    type: "module",
    scripts: { dev: "vite", build: "tsc && vite build", typecheck: "tsc" },
    dependencies: pick(["react", "react-dom", "react-router"]),
    devDependencies: pick(["@types/react", "@types/react-dom", "@vitejs/plugin-react", "typescript", "vite"]),
  };
  return `${JSON.stringify(pkg, null, 2)}\n`;
}

export function webTsconfig(): string {
  return `${HEADER}
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["vite/client"]
  },
  "include": ["src"]
}
`;
}

export function viteConfig(): string {
  return `${HEADER}
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    // The typed client lives in ../contract.
    fs: { allow: [".."] },
    // In production nginx does this; for \`npm run dev\`, point it at a running API.
    proxy: { "/api": { target: "http://localhost:3000", rewrite: (path) => path.replace(/^\\/api/, "") } },
  },
});
`;
}

export function indexHtml(spec: Spec): string {
  return `<!doctype html>
<!-- ${MARKER} — do not edit -->
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${spec.app.name}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;
}

export function apiModule(): string {
  return `${HEADER}
import { createApiClient } from "../../contract/client";
import { session } from "./session";

export type * from "../../contract/client";
export { ApiError } from "../../contract/client";

// Same origin: nginx (and the Vite dev server) proxy /api to the backend.
export const api = createApiClient({
  baseUrl: "/api",
  token: () => session.token(),
  // A rejected token signs the user out; RequireAuth then redirects to login.
  fetch: async (input, init) => {
    const response = await fetch(input, init);
    if (response.status === 401 && session.token()) session.set(null);
    return response;
  },
});
`;
}

export function sessionModule(spec: Spec, site: Site): string {
  return `${HEADER}
import { useSyncExternalStore, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router";

export const HOME = ${JSON.stringify(site.home)};
const KEY = ${JSON.stringify(`${spec.app.name}.token`)};
const listeners = new Set<() => void>();
let token = read();

function read(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

// The bearer token, kept in localStorage so a reload stays signed in.
export const session = {
  token: (): string | null => token,
  set(next: string | null): void {
    token = next;
    try {
      if (next) localStorage.setItem(KEY, next);
      else localStorage.removeItem(KEY);
    } catch {
      // Storage unavailable (private mode): the session lasts until reload.
    }
    for (const listener of listeners) listener();
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

export function useToken(): string | null {
  return useSyncExternalStore(session.subscribe, session.token);
}

// Only same-app paths, so ?next= can't send users elsewhere.
export function nextPath(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : HOME;
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const token = useToken();
  const location = useLocation();
  if (!token) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={${JSON.stringify(site.loginRoute ?? "/")} + "?next=" + next} replace />;
  }
  return children;
}
`;
}

export function layoutModule(spec: Spec, site: Site): string {
  const imports = new Imports().add("react-router", "Link", "NavLink", "Outlet");
  const authed = site.nav.filter((p) => p.page.auth !== "public");
  const open = site.nav.filter((p) => p.page.auth === "public");
  const link = (route: string, label: string) => `<NavLink to=${JSON.stringify(route)}>${label}</NavLink>`;
  const lines: string[] = [];
  lines.push(...open.map((p) => `            ${link(p.page.route, humanize(p.page.id))}`));
  if (authed.length > 0) {
    lines.push("            {token && (", "              <>", ...authed.map((p) => `                ${link(p.page.route, humanize(p.page.id))}`), "              </>", "            )}");
  }
  let end: string[] = [];
  if (spec.auth) {
    imports.add("../session", "session", "useToken");
    const guest = [site.loginRoute && link(site.loginRoute, "Log in"), site.registerRoute && link(site.registerRoute, "Register")].filter(Boolean);
    end = [
      '          <div className="nav-end">',
      "            {token ? (",
      '              <button className="link" onClick={() => session.set(null)}>',
      "                Log out",
      "              </button>",
      "            ) : (",
      `              <>${guest.join(" ")}</>`,
      "            )}",
      "          </div>",
    ];
  }
  return [
    HEADER,
    ...imports.render(),
    "",
    "export function Layout() {",
    ...(spec.auth ? ["  const token = useToken();"] : []),
    "  return (",
    "    <>",
    '      <header className="nav">',
    '        <div className="container nav-inner">',
    `          <Link className="brand" to="/">`,
    `            ${spec.app.name}`,
    "          </Link>",
    "          <nav>",
    ...lines,
    "          </nav>",
    ...end,
    "        </div>",
    "      </header>",
    '      <main className="container">',
    "        <Outlet />",
    "      </main>",
    "    </>",
    "  );",
    "}",
    "",
  ].join("\n");
}

export function mainModule(site: Site): string {
  const imports = new Imports()
    .add("react", "StrictMode")
    .add("react-dom/client", "createRoot")
    .add("react-router", "BrowserRouter", "Route", "Routes")
    .add("./components/Layout", "Layout");
  const routes: string[] = [];
  if (!site.pages.some((p) => p.page.route === "/")) {
    imports.add("react-router", "Navigate");
    routes.push(`          <Route path="/" element={<Navigate to=${JSON.stringify(site.home)} replace />} />`);
  }
  for (const p of site.pages) {
    imports.add(`./pages/${p.file}`, p.component);
    let element = `<${p.component} />`;
    if (p.page.auth !== "public") {
      imports.add("./session", "RequireAuth");
      element = `<RequireAuth>${element}</RequireAuth>`;
    }
    routes.push(`          <Route path=${JSON.stringify(p.page.route)} element={${element}} />`);
  }
  routes.push('          <Route path="*" element={<p>Page not found.</p>} />');

  return `${HEADER}
${imports.render().join("\n")}
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
${routes.join("\n")}
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
`;
}

// Built from the repo root, since the client lives in ../contract.
export function webDockerfile(): string {
  return `# ${MARKER} — do not edit
FROM node:22-alpine AS build
WORKDIR /app
COPY web/package.json web/
RUN cd web && npm install
COPY contract contract
COPY web web
RUN cd web && npm run build

FROM nginx:1.27-alpine
COPY web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/web/dist /usr/share/nginx/html
`;
}

// Serves the SPA and proxies /api/* to the api service (prefix stripped).
export function nginxConf(): string {
  return `# ${MARKER} — do not edit
server {
  listen 80;
  root /usr/share/nginx/html;

  location /api/ {
    proxy_pass http://api:3000/;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }

  location /assets/ {
    add_header Cache-Control "public, max-age=31536000, immutable";
  }

  location / {
    try_files $uri /index.html;
  }
}
`;
}
