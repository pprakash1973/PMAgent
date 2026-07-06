"use client";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Download, Printer } from "lucide-react";

type Props = { artifactType: string; content: Record<string, unknown> };

export function ArtifactDocument({ artifactType, content }: Props) {
  const docRef = useRef<HTMLDivElement>(null);

  function handlePrint() {
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`
      <html><head><title>${artifactType.replace(/_/g, " ").toUpperCase()}</title>
      <style>
        body { font-family: Arial, sans-serif; font-size: 12px; color: #1a1a1a; padding: 32px; max-width: 900px; margin: 0 auto; }
        h1 { font-size: 20px; color: #1e3a8a; border-bottom: 2px solid #1e3a8a; padding-bottom: 8px; margin-bottom: 20px; }
        h2 { font-size: 14px; color: #1e40af; margin-top: 20px; margin-bottom: 8px; }
        h3 { font-size: 12px; color: #374151; margin-top: 12px; margin-bottom: 4px; }
        table { width: 100%; border-collapse: collapse; margin: 8px 0 16px; }
        th { background: #1e3a8a; color: white; padding: 6px 10px; text-align: left; font-size: 11px; }
        td { padding: 5px 10px; border-bottom: 1px solid #e5e7eb; vertical-align: top; font-size: 11px; }
        tr:nth-child(even) td { background: #f8fafc; }
        .badge { display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 10px; font-weight: 600; }
        .badge-red { background: #fee2e2; color: #991b1b; }
        .badge-amber { background: #fef3c7; color: #92400e; }
        .badge-green { background: #d1fae5; color: #065f46; }
        .badge-blue { background: #dbeafe; color: #1e40af; }
        .badge-gray { background: #f3f4f6; color: #374151; }
        ul { margin: 4px 0 8px 20px; padding: 0; }
        li { margin-bottom: 3px; }
        p { margin: 4px 0 8px; line-height: 1.5; }
        .field-row { display: flex; gap: 8px; margin-bottom: 6px; }
        .field-label { font-weight: 600; min-width: 140px; color: #374151; }
        .field-value { color: #1a1a1a; }
      </style></head><body>
      ${docRef.current?.innerHTML ?? ""}
      </body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 400);
  }

  const title = artifactType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div className="space-y-2">
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={handlePrint}>
          <Printer className="w-3 h-3" /> Print / Save PDF
        </Button>
      </div>
      <div ref={docRef} className="bg-white border border-slate-200 rounded-md p-6 text-sm text-slate-800 space-y-4 max-h-[600px] overflow-y-auto">
        <h1 className="text-lg font-bold text-blue-900 border-b-2 border-blue-900 pb-2">{title}</h1>
        <RenderValue value={content} depth={0} />
      </div>
    </div>
  );
}

function badge(val: string) {
  const v = val.toLowerCase();
  if (v === "red" || v === "high" || v === "critical") return <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800">{val}</span>;
  if (v === "amber" || v === "medium" || v === "moderate") return <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">{val}</span>;
  if (v === "green" || v === "low" || v === "achieved" || v === "completed" || v === "approved") return <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800">{val}</span>;
  if (v === "pending" || v === "planned" || v === "open") return <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">{val}</span>;
  return <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">{val}</span>;
}

const STATUS_KEYS = new Set(["status", "probability", "impact", "ragstatus", "overallstatus", "riskstatus", "engagementlevel", "priority"]);
const SKIP_KEYS = new Set(["id"]);

function formatKey(key: string) {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
}

function RenderValue({ value, depth, keyName }: { value: unknown; depth: number; keyName?: string }) {
  if (value === null || value === undefined) return <span className="text-slate-400">—</span>;

  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-slate-400">None</span>;

    // If array of objects → render as table
    if (typeof value[0] === "object" && value[0] !== null && !Array.isArray(value[0])) {
      const keys = Object.keys(value[0] as object).filter((k) => !SKIP_KEYS.has(k));
      return (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>{keys.map((k) => <th key={k} className="bg-blue-900 text-white px-3 py-1.5 text-left font-semibold">{formatKey(k)}</th>)}</tr>
            </thead>
            <tbody>
              {(value as Record<string, unknown>[]).map((row, i) => (
                <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                  {keys.map((k) => (
                    <td key={k} className="px-3 py-1.5 border-b border-slate-200 align-top">
                      <RenderValue value={row[k]} depth={depth + 1} keyName={k} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    // Array of primitives → bullet list
    return (
      <ul className="list-disc list-inside space-y-0.5 text-slate-700">
        {(value as unknown[]).map((item, i) => (
          <li key={i}><RenderValue value={item} depth={depth + 1} /></li>
        ))}
      </ul>
    );
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as object).filter(([k]) => !SKIP_KEYS.has(k));
    if (depth === 0) {
      return (
        <div className="space-y-5">
          {entries.map(([k, v]) => (
            <Section key={k} label={formatKey(k)} value={v} depth={depth} />
          ))}
        </div>
      );
    }
    return (
      <div className="space-y-1">
        {entries.map(([k, v]) => (
          <div key={k} className="flex gap-2 text-xs">
            <span className="font-semibold text-slate-600 min-w-[100px] shrink-0">{formatKey(k)}:</span>
            <RenderValue value={v} depth={depth + 1} keyName={k} />
          </div>
        ))}
      </div>
    );
  }

  const str = String(value);
  const isStatus = keyName && STATUS_KEYS.has(keyName.toLowerCase());
  if (isStatus) return badge(str);
  return <span>{str}</span>;
}

function Section({ label, value, depth }: { label: string; value: unknown; depth: number }) {
  return (
    <div>
      <h2 className="text-sm font-bold text-blue-800 uppercase tracking-wide border-b border-blue-100 pb-1 mb-2">{label}</h2>
      <RenderValue value={value} depth={depth + 1} keyName={label.toLowerCase().replace(/\s/g, "")} />
    </div>
  );
}
