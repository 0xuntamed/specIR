import { useState, type ReactNode } from "react";
import type { Diagnostic } from "../../src/validate/index";
import type { Spec } from "./edits";
import type { Selection } from "./forms";
import { Icon, type IconName } from "./icons";

// "entities[2].fields[0]" → the item the studio should open.
export function selectionFor(path: string): Selection {
  const match = /^(entities|endpoints|pages|jobs|slots)\[(\d+)\]/.exec(path);
  return match ? { section: match[1] as Selection["section"], index: Number(match[2]) } : { section: "settings", index: 0 };
}

function PanelEmpty(props: { icon: IconName; tone?: "ok"; title: string; children: ReactNode }) {
  return (
    <div className="panel-empty">
      <span className={props.tone === "ok" ? "panel-empty-icon ok" : "panel-empty-icon"}>
        <Icon name={props.icon} size={20} />
      </span>
      <p className="panel-empty-title">{props.title}</p>
      <p>{props.children}</p>
    </div>
  );
}

export function Problems(props: { diagnostics: Diagnostic[]; select: (s: Selection) => void }) {
  if (props.diagnostics.length === 0) {
    return (
      <PanelEmpty icon="checkCircle" tone="ok" title="No problems">
        The spec is valid. Every edit is checked as you type.
      </PanelEmpty>
    );
  }
  return (
    <ul className="problems">
      {props.diagnostics.map((d, i) => (
        <li key={i}>
          <button type="button" className={`problem ${d.level}`} onClick={() => props.select(selectionFor(d.path))}>
            <Icon name={d.level === "error" ? "errorCircle" : "warning"} className="problem-icon" />
            <span className="problem-text">
              <span className="problem-message">{d.message}</span>
              <span className="problem-meta">
                <code>{d.code}</code>
                <span>{d.path}</span>
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

// Paths grouped by their top folder, in output order.
function groupsOf(paths: string[]): [string, string[]][] {
  const groups = new Map<string, string[]>();
  for (const path of paths) {
    const group = path.includes("/") ? `${path.split("/")[0]}/` : "project root";
    groups.set(group, [...(groups.get(group) ?? []), path]);
  }
  return [...groups];
}

export function Files(props: { files: Map<string, string> | null; stale: boolean }) {
  const [open, setOpen] = useState("api/src/server.ts");
  if (!props.files) {
    return (
      <PanelEmpty icon="file" title="No preview yet">
        Fix the problems and every file the compiler writes appears here.
      </PanelEmpty>
    );
  }
  const paths = [...props.files.keys()];
  const current = props.files.has(open) ? open : paths[0]!;
  const lines = props.files.get(current)!.replace(/\n$/, "").split("\n");
  return (
    <div className="files">
      {props.stale && (
        <p className="notice warning">
          <Icon name="warning" size={15} />
          Showing the last valid output while the spec has problems.
        </p>
      )}
      <div className="files-bar">
        <select className="mono" value={current} onChange={(e) => setOpen(e.target.value)} aria-label="Generated file">
          {groupsOf(paths).map(([group, members]) => (
            <optgroup key={group} label={group}>
              {members.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <span className="files-meta">
          {lines.length} lines · {paths.length} files
        </span>
      </div>
      <pre className="code-view" tabIndex={0} aria-label={`Contents of ${current}`}>
        <code>
          {lines.map((line, i) => (
            <span key={i} className="line">
              {`${line}\n`}
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
}

// Entity boxes in two columns, with an arrow from each belongsTo to its target.
const W = 212;
const HEAD = 36;
const LINE = 20;
const GAP_X = 72;
const GAP_Y = 56;

type Box = { x: number; y: number; w: number; h: number };

function edgePath(a: Box, b: Box): { d: string; mid: { x: number; y: number } } {
  const ac = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
  const bc = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  const horizontal = Math.abs(bc.x - ac.x) > Math.abs(bc.y - ac.y) * 0.6;
  let from, to, c1, c2;
  if (horizontal) {
    const dir = bc.x > ac.x ? 1 : -1;
    from = { x: dir > 0 ? a.x + a.w : a.x, y: a.y + Math.max(HEAD, a.h / 2) };
    to = { x: dir > 0 ? b.x : b.x + b.w, y: b.y + HEAD / 2 };
    const pull = Math.abs(to.x - from.x) / 2;
    c1 = { x: from.x + dir * pull, y: from.y };
    c2 = { x: to.x - dir * pull, y: to.y };
  } else {
    const dir = bc.y > ac.y ? 1 : -1;
    from = { x: ac.x, y: dir > 0 ? a.y + a.h : a.y };
    to = { x: bc.x, y: dir > 0 ? b.y : b.y + b.h };
    const pull = Math.abs(to.y - from.y) / 2;
    c1 = { x: from.x, y: from.y + dir * pull };
    c2 = { x: to.x, y: to.y - dir * pull };
  }
  // The curve's point at t = 0.5, for the label.
  const mid = { x: (from.x + 3 * c1.x + 3 * c2.x + to.x) / 8, y: (from.y + 3 * c1.y + 3 * c2.y + to.y) / 8 };
  return { d: `M${from.x} ${from.y} C${c1.x} ${c1.y} ${c2.x} ${c2.y} ${to.x} ${to.y}`, mid };
}

export function Diagram(props: { spec: Spec; select: (s: Selection) => void }) {
  const entities = props.spec.entities;
  if (entities.length === 0) {
    return (
      <PanelEmpty icon="entity" title="No entities yet">
        Add an entity or a resource and its table appears here, linked to the ones it belongs to.
      </PanelEmpty>
    );
  }
  const heights = entities.map((e) => HEAD + Math.max(1, e.fields.length) * LINE + 10);
  const rows = Math.ceil(entities.length / 2);
  const rowHeights = Array.from({ length: rows }, (_, r) => Math.max(heights[r * 2]!, heights[r * 2 + 1] ?? 0));
  const boxes: Box[] = entities.map((_, i) => {
    const row = Math.floor(i / 2);
    const y = 16 + rowHeights.slice(0, row).reduce((sum, h) => sum + h + GAP_Y, 0);
    return { x: 16 + (i % 2) * (W + GAP_X), y, w: W, h: heights[i]! };
  });
  const byName = new Map(entities.map((e, i) => [e.name, i]));
  const edges = entities.flatMap((e, i) =>
    (e.relations ?? []).flatMap((r) => {
      const j = byName.get(r.target);
      return r.kind === "belongsTo" && j !== undefined && j !== i ? [{ ...edgePath(boxes[i]!, boxes[j]!), label: r.name }] : [];
    }),
  );
  const width = 32 + 2 * W + GAP_X;
  const height = 32 + rowHeights.reduce((sum, h) => sum + h, 0) + (rows - 1) * GAP_Y;
  const open = (i: number) => props.select({ section: "entities", index: i });

  return (
    <figure className="diagram-wrap">
      <svg className="diagram" viewBox={`0 0 ${width} ${height}`} role="group" aria-label="Entity diagram">
        <defs>
          <marker id="diagram-arrow" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
            <path d="M1.5 1.5 8.5 5l-7 3.5" className="edge-arrow" />
          </marker>
        </defs>
        {edges.map((edge, i) => (
          <path key={i} d={edge.d} className="edge" markerEnd="url(#diagram-arrow)" />
        ))}
        {entities.map((e, i) => {
          const box = boxes[i]!;
          return (
            <g
              key={i}
              className="node"
              transform={`translate(${box.x} ${box.y})`}
              tabIndex={0}
              role="button"
              aria-label={`Edit ${e.name}`}
              onClick={() => open(i)}
              onKeyDown={(ev) => (ev.key === "Enter" || ev.key === " ") && (ev.preventDefault(), open(i))}
            >
              <rect width={W} height={box.h} rx={8} className="node-box" />
              <path d={`M0 ${HEAD}H${W}`} className="node-rule" />
              <text x={12} y={23} className="node-title">
                {e.name}
              </text>
              {e.owned && (
                <text x={W - 12} y={23} className="node-tag" textAnchor="end">
                  owned
                </text>
              )}
              {e.fields.length === 0 && (
                <text x={12} y={HEAD + 19} className="node-type">
                  no fields
                </text>
              )}
              {e.fields.map((f, k) => (
                <g key={k}>
                  <text x={12} y={HEAD + 19 + k * LINE} className="node-field">
                    {f.name}
                  </text>
                  <text x={W - 12} y={HEAD + 19 + k * LINE} className="node-type" textAnchor="end">
                    {f.type}
                    {f.required ? "" : "?"}
                  </text>
                </g>
              ))}
            </g>
          );
        })}
        {edges.map((edge, i) => (
          <text key={i} x={edge.mid.x} y={edge.mid.y - 6} className="edge-label" textAnchor="middle">
            {edge.label}
          </text>
        ))}
      </svg>
      <figcaption>Arrows run from a belongsTo relation to its target. Select an entity to edit it.</figcaption>
    </figure>
  );
}
