import { useState } from "react";
import type { Diagnostic } from "../../src/validate/index";
import type { Spec } from "./edits";
import type { Selection } from "./forms";

// "entities[2].fields[0]" → the item the studio should open.
export function selectionFor(path: string): Selection {
  const match = /^(entities|endpoints|pages|jobs|slots)\[(\d+)\]/.exec(path);
  return match ? { section: match[1] as Selection["section"], index: Number(match[2]) } : { section: "settings", index: 0 };
}

export function Problems(props: { diagnostics: Diagnostic[]; select: (s: Selection) => void }) {
  if (props.diagnostics.length === 0) return <p className="ok">No problems. The spec is valid.</p>;
  return (
    <ul className="problems">
      {props.diagnostics.map((d, i) => (
        <li key={i}>
          <button className={`problem ${d.level}`} onClick={() => props.select(selectionFor(d.path))}>
            <span className="code">{d.code}</span>
            {d.message}
            <span className="path">{d.path}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function Files(props: { files: Map<string, string> | null; stale: boolean }) {
  const [open, setOpen] = useState("api/src/server.ts");
  if (!props.files) return <p className="muted">Fix the problems to preview the generated app.</p>;
  const paths = [...props.files.keys()];
  const current = props.files.has(open) ? open : paths[0]!;
  const lines = props.files.get(current)!.split("\n").length;
  return (
    <div className="files">
      {props.stale && <p className="warn">Showing the last valid version while the spec has problems.</p>}
      <select value={current} onChange={(e) => setOpen(e.target.value)} aria-label="Generated file">
        {paths.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
      <p className="muted">
        {paths.length} files · {current} · {lines} lines
      </p>
      <pre className="code-view">{props.files.get(current)}</pre>
    </div>
  );
}

// Entity boxes in a grid with belongsTo lines between them.
export function Diagram(props: { spec: Spec; select: (s: Selection) => void }) {
  const entities = props.spec.entities;
  const W = 200;
  const LINE = 18;
  const cols = 2;
  const heights = entities.map((e) => 34 + Math.max(1, e.fields.length) * LINE + 10);
  const rowHeight = Math.max(...heights, 60) + 50;
  const pos = entities.map((_, i) => ({ x: 20 + (i % cols) * (W + 60), y: 20 + Math.floor(i / cols) * rowHeight }));
  const center = (i: number) => ({ x: pos[i]!.x + W / 2, y: pos[i]!.y + heights[i]! / 2 });
  const byName = new Map(entities.map((e, i) => [e.name, i]));
  const lines = entities.flatMap((e, i) =>
    (e.relations ?? []).flatMap((r) => {
      const j = byName.get(r.target);
      return r.kind === "belongsTo" && j !== undefined ? [{ from: center(i), to: center(j), label: r.name }] : [];
    }),
  );
  const height = 40 + Math.ceil(entities.length / cols) * rowHeight;
  return (
    <svg className="diagram" viewBox={`0 0 ${20 + cols * (W + 60)} ${height}`} role="img" aria-label="Entity diagram">
      {lines.map((l, i) => (
        <g key={i}>
          <line x1={l.from.x} y1={l.from.y} x2={l.to.x} y2={l.to.y} className="edge" />
          <text x={(l.from.x + l.to.x) / 2 + 4} y={(l.from.y + l.to.y) / 2 - 4} className="edge-label">
            {l.label}
          </text>
        </g>
      ))}
      {entities.map((e, i) => (
        <g key={i} className="node" transform={`translate(${pos[i]!.x} ${pos[i]!.y})`} onClick={() => props.select({ section: "entities", index: i })}>
          <rect width={W} height={heights[i]} rx={8} />
          <text x={12} y={22} className="node-title">
            {e.name}
            {e.owned ? " · owned" : ""}
          </text>
          {e.fields.map((f, k) => (
            <text key={k} x={12} y={44 + k * LINE} className="node-field">
              {f.name}: {f.type}
              {f.required ? "" : "?"}
            </text>
          ))}
        </g>
      ))}
    </svg>
  );
}
