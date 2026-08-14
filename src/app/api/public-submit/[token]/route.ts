export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import crypto from "crypto";

// GET /api/public-submit/[token]
// Returns a self-contained HTML page — no Next.js layout, no auth providers.
// This page works on any browser, any machine, with no login required.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  // Validate token immediately so we can show the right state in the HTML
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const record = await prisma.collectionToken.findUnique({
    where: { tokenHash },
    include: {
      resource: { select: { id: true, name: true, role: true } },
      project: { select: { id: true, name: true } },
      cycle: {
        select: {
          id: true, cycleNumber: true, label: true,
          startDate: true, endDate: true, status: true, taskIds: true,
        },
      },
    },
  });

  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const submitApiUrl = `${baseUrl}/api/submit/${encodeURIComponent(token)}`;

  // ── Error states ─────────────────────────────────────────────────────────────
  if (!record) {
    return htmlResponse(errorPage("Invalid link", "This submission link is invalid or has already been used."));
  }
  if (record.status === "submitted") {
    return htmlResponse(errorPage("Already submitted", "Your actuals for this cycle have already been recorded. Contact your project manager if you need to make corrections."));
  }
  if (record.status === "expired" || record.expiresAt < new Date()) {
    return htmlResponse(errorPage("Link expired", "This submission link has expired. Please contact your project manager for a new link."));
  }
  if (record.cycle.status !== "open") {
    return htmlResponse(errorPage("Cycle closed", "The collection cycle has been closed by the project manager."));
  }

  // ── Resolve tasks ─────────────────────────────────────────────────────────────
  const cycleTaskIds: string[] = Array.isArray(record.cycle.taskIds) ? record.cycle.taskIds as string[] : [];

  const assignments = await prisma.taskAssignment.findMany({
    where: { resourceId: record.resourceId, projectId: record.projectId },
    select: { taskId: true },
  });
  const directTasks = await prisma.scheduleTask.findMany({
    where: { resourceId: record.resourceId, projectId: record.projectId },
    select: { id: true },
  });
  const resourceTaskIds = new Set([
    ...assignments.map((a) => a.taskId),
    ...directTasks.map((t) => t.id),
  ]);

  let taskFilter: string[] | undefined;
  if (cycleTaskIds.length > 0 && resourceTaskIds.size > 0) {
    taskFilter = cycleTaskIds.filter((id) => resourceTaskIds.has(id));
    if (taskFilter.length === 0) taskFilter = cycleTaskIds;
  } else if (cycleTaskIds.length > 0) {
    taskFilter = cycleTaskIds;
  } else if (resourceTaskIds.size > 0) {
    taskFilter = Array.from(resourceTaskIds);
  }

  const tasks = await prisma.scheduleTask.findMany({
    where: { projectId: record.projectId, ...(taskFilter ? { id: { in: taskFilter } } : {}) },
    orderBy: { sortOrder: "asc" },
  });

  const startStr = new Date(record.cycle.startDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const endStr = new Date(record.cycle.endDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const cyclePeriod = `${startStr} – ${endStr}`;

  const tasksJson = JSON.stringify(tasks.map(t => ({
    id: t.id,
    wbsCode: t.wbsCode,
    name: t.name,
    phase: t.phase,
    estimatedHours: t.estimatedHours,
    percentComplete: t.percentComplete,
    baselineStart: new Date(t.baselineStart).toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
    baselineFinish: new Date(t.baselineFinish).toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
  })));

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Submit Task Actuals – ${escHtml(record.project.name)}</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f1f5f9;color:#1e293b;min-height:100vh;padding:24px 16px}
.wrap{max-width:740px;margin:0 auto}
.header{background:#1e3a8a;color:#fff;border-radius:16px;padding:24px 28px;margin-bottom:20px}
.header .eyebrow{font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#93c5fd;margin-bottom:8px}
.header h1{font-size:20px;font-weight:700;margin-bottom:4px}
.header .sub{font-size:13px;color:#bfdbfe}
.intro{background:#fff;border-radius:12px;padding:18px 22px;margin-bottom:16px;font-size:14px;line-height:1.6;color:#475569;border:1px solid #e2e8f0}
.task-card{background:#fff;border-radius:12px;padding:22px;margin-bottom:14px;border:1px solid #e2e8f0}
.task-header{display:flex;align-items:flex-start;gap:10px;margin-bottom:18px}
.wbs{font-family:monospace;font-size:11px;background:#f1f5f9;color:#64748b;padding:3px 7px;border-radius:4px;flex-shrink:0;margin-top:2px}
.task-name{font-weight:600;font-size:14px;color:#0f172a;line-height:1.3}
.task-meta{font-size:12px;color:#94a3b8;margin-top:3px}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
@media(max-width:520px){.grid2{grid-template-columns:1fr}}
label{display:block;font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px}
input,select,textarea{width:100%;border:1px solid #cbd5e1;border-radius:8px;padding:8px 11px;font-size:13px;color:#0f172a;background:#fff;outline:none;font-family:inherit}
input:focus,select:focus,textarea:focus{border-color:#3b82f6;box-shadow:0 0 0 3px rgba(59,130,246,.15)}
textarea{resize:none}
.pct-wrap{position:relative}
.pct-suffix{position:absolute;right:11px;top:50%;transform:translateY(-50%);color:#94a3b8;font-size:13px;pointer-events:none}
.bar-track{margin-top:6px;height:4px;background:#e2e8f0;border-radius:999px;overflow:hidden}
.bar-fill{height:100%;background:#3b82f6;border-radius:999px;transition:width .2s}
.notes-row{margin-top:14px}
.submit-btn{display:block;width:100%;padding:14px;background:#1e3a8a;color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:600;cursor:pointer;margin-top:20px;transition:background .15s}
.submit-btn:hover{background:#1e40af}
.submit-btn:disabled{background:#94a3b8;cursor:not-allowed}
.spinner{display:inline-block;width:14px;height:14px;border:2px solid rgba(255,255,255,.4);border-top-color:#fff;border-radius:50%;animation:spin .7s linear infinite;vertical-align:middle;margin-right:6px}
@keyframes spin{to{transform:rotate(360deg)}}
.notice{text-align:center;font-size:12px;color:#94a3b8;margin-top:10px}
.success{background:#f0fdf4;border:1px solid #86efac;border-radius:12px;padding:32px;text-align:center;margin-top:20px}
.success-icon{width:52px;height:52px;background:#dcfce7;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 14px}
.success h2{font-size:17px;font-weight:700;color:#166534;margin-bottom:6px}
.success p{font-size:13px;color:#4ade80;color:#15803d}
.error-card{background:#fff;border-radius:12px;padding:40px 28px;text-align:center;border:1px solid #e2e8f0;max-width:400px;margin:60px auto}
.error-icon{width:48px;height:48px;background:#fee2e2;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 16px}
.error-card h2{font-size:17px;font-weight:700;color:#0f172a;margin-bottom:8px}
.error-card p{font-size:13px;color:#64748b;line-height:1.6}
</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <div class="eyebrow">PM Agent · Task Actuals</div>
    <h1>${escHtml(record.project.name)}</h1>
    <div class="sub">${escHtml(record.cycle.label ?? `Cycle ${record.cycle.cycleNumber}`)} &nbsp;·&nbsp; ${escHtml(cyclePeriod)}</div>
  </div>

  <div class="intro">
    Hi <strong>${escHtml(record.resource.name)}</strong> (${escHtml(record.resource.role)}). Please review your assigned tasks below and submit your actuals.
    Fields marked * are required.
  </div>

  <div id="form-area"></div>
  <div id="success-area" style="display:none">
    <div class="success">
      <div class="success-icon">
        <svg width="24" height="24" fill="none" stroke="#22c55e" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
      </div>
      <h2>Actuals submitted</h2>
      <p>Thank you, <strong>${escHtml(record.resource.name)}</strong>. Your actuals for <strong>${escHtml(record.project.name)}</strong> have been recorded. You can close this window.</p>
    </div>
  </div>
</div>

<script>
(function(){
  var TASKS = ${tasksJson};
  var API_URL = "${submitApiUrl}";
  var submissions = {};

  TASKS.forEach(function(t){
    submissions[t.id] = {
      taskId: t.id,
      hoursWorked: 0,
      percentComplete: t.percentComplete,
      etcHours: null,
      disposition: "actual",
      notes: ""
    };
  });

  var dispositions = [
    {value:"confirmed_as_planned", label:"Confirmed as planned"},
    {value:"actual",               label:"Actual (revised estimate)"},
    {value:"forecast",             label:"Forecast"},
    {value:"estimated",            label:"Estimated"},
    {value:"unknown",              label:"Not sure / Unknown"}
  ];

  function h(str){ return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }

  function renderForm(){
    var html = "";
    TASKS.forEach(function(t){
      var disp = dispositions.map(function(d){
        return '<option value="'+d.value+'"'+(d.value==="actual"?" selected":"")+'>'+d.label+'</option>';
      }).join("");
      html += '<div class="task-card" id="card-'+t.id+'">'
        +'<div class="task-header">'
          +'<span class="wbs">'+h(t.wbsCode)+'</span>'
          +'<div><div class="task-name">'+h(t.name)+'</div>'
          +'<div class="task-meta">'+h(t.phase)+' &middot; Baseline: '+h(t.baselineStart)+' &ndash; '+h(t.baselineFinish)+(t.estimatedHours!=null?' &middot; '+t.estimatedHours+'h estimated':'')+'</div></div>'
        +'</div>'
        +'<div class="grid2">'
          +'<div><label>Hours worked this period *</label>'
            +'<input type="number" min="0" step="0.5" required data-id="'+t.id+'" data-field="hoursWorked" value="0"></div>'
          +'<div><label>% Complete *</label>'
            +'<div class="pct-wrap">'
              +'<input type="number" min="0" max="100" required data-id="'+t.id+'" data-field="percentComplete" value="'+h(t.percentComplete)+'">'
              +'<span class="pct-suffix">%</span>'
            +'</div>'
            +'<div class="bar-track"><div class="bar-fill" id="bar-'+t.id+'" style="width:'+h(t.percentComplete)+'%"></div></div>'
          +'</div>'
          +'<div><label>Estimate to complete (hrs remaining)</label>'
            +'<input type="number" min="0" step="0.5" placeholder="Optional" data-id="'+t.id+'" data-field="etcHours"></div>'
          +'<div><label>Confidence *</label>'
            +'<select data-id="'+t.id+'" data-field="disposition">'+disp+'</select></div>'
        +'</div>'
        +'<div class="notes-row"><label>Notes / blockers</label>'
          +'<textarea rows="2" placeholder="Any blockers, risks, or context for the PM…" data-id="'+t.id+'" data-field="notes"></textarea>'
        +'</div>'
      +'</div>';
    });
    html += '<button class="submit-btn" id="submit-btn" type="button">Submit actuals for '+TASKS.length+' task'+(TASKS.length!==1?"s":"")+'</button>'
           +'<p class="notice">This link is single-use. Once submitted you cannot revise — contact your PM for corrections.</p>';
    document.getElementById("form-area").innerHTML = html;

    // Wire up events
    document.getElementById("form-area").addEventListener("input", function(e){
      var el = e.target;
      var id = el.getAttribute("data-id");
      var field = el.getAttribute("data-field");
      if(!id||!field) return;
      var val = el.value;
      if(field==="hoursWorked"||field==="percentComplete") val = parseFloat(val)||0;
      else if(field==="etcHours") val = val===""?null:(parseFloat(val)||0);
      submissions[id][field] = val;
      if(field==="percentComplete"){
        var bar = document.getElementById("bar-"+id);
        if(bar) bar.style.width = Math.min(100, parseFloat(val)||0)+"%";
      }
    });

    document.getElementById("submit-btn").addEventListener("click", function(){
      var btn = document.getElementById("submit-btn");
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Submitting…';
      var payload = Object.values(submissions);
      fetch(API_URL, {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({submissions: payload})
      })
      .then(function(r){ return r.json().then(function(d){ return {ok:r.ok, data:d}; }); })
      .then(function(r){
        if(r.ok){
          document.getElementById("form-area").style.display="none";
          document.getElementById("success-area").style.display="block";
        } else {
          alert(r.data.error||"Submission failed. Please try again.");
          btn.disabled=false;
          btn.innerHTML="Submit actuals for ${tasks.length} task${tasks.length !== 1 ? 's' : ''}";
        }
      })
      .catch(function(){
        alert("Network error. Please try again.");
        btn.disabled=false;
        btn.innerHTML="Submit actuals for ${tasks.length} task${tasks.length !== 1 ? 's' : ''}";
      });
    });
  }

  renderForm();
})();
</script>
</body>
</html>`;

  return htmlResponse(html);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function htmlResponse(html: string) {
  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function escHtml(str: string | null | undefined): string {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function errorPage(title: string, message: string): string {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escHtml(title)} – PM Agent</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f1f5f9;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px}.card{background:#fff;border-radius:14px;padding:40px 28px;text-align:center;border:1px solid #e2e8f0;max-width:400px;width:100%}.icon{width:48px;height:48px;background:#fee2e2;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 16px}h2{font-size:17px;font-weight:700;color:#0f172a;margin-bottom:8px}p{font-size:13px;color:#64748b;line-height:1.6}</style>
</head><body>
<div class="card">
  <div class="icon"><svg width="22" height="22" fill="none" stroke="#ef4444" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path stroke-linecap="round" d="M12 8v4m0 4h.01"/></svg></div>
  <h2>${escHtml(title)}</h2>
  <p>${escHtml(message)}</p>
</div>
</body></html>`;
}
