import Anthropic from "@anthropic-ai/sdk";
import { GUARDRAIL_SYSTEM_ADDENDUM } from "@/lib/guardrails";
import { resolveModel } from "@/lib/model-router";
import { callLLM, streamLLM } from "@/lib/providers";
import { formatEvidenceForPrompt, type EvidenceContext } from "@/lib/evidence-assembler";

// Re-exported for routes that call Anthropic APIs directly (streaming, tool use, etc.)
// These are not routed through the provider abstraction.
export const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ---------------------------------------------------------------------------
// Domain Intelligence — Phase 1: Static playbook
// ---------------------------------------------------------------------------

const DOMAIN_PLAYBOOK: Record<string, string> = {
  "healthcare": `
DOMAIN: Healthcare / Life Sciences
Regulatory & standards: HIPAA, HL7/FHIR, DCB0129/DCB0160 clinical safety (UK NHS),
  FDA 21 CFR Part 11 (electronic records), NHS DSPT, ISO 13485 (medical devices if applicable).
WBS mandatory workstreams: Clinical Engagement, Information Governance,
  Clinical Safety Case, Validation (IQ/OQ/PQ), Change Management & Training,
  Go-live Hypercare (minimum 4 weeks post-launch).
Resource roles to include: Clinical Informatics Lead, Information Governance Lead,
  Clinical Safety Officer, UAT Coordinator (Clinical), NHS Change Lead,
  Integration Specialist (HL7/FHIR).
Risk patterns: clinical workflow disruption, data quality during EPR migration,
  HL7/FHIR integration failures, staff adoption in high-pressure clinical settings,
  patient safety incidents during cutover, vendor lock-in on clinical systems.
Scheduling constraints: avoid go-live during winter pressure periods (Dec–Feb NHS),
  plan for clinical downtime windows (typically early morning Sunday).
Milestones: Clinical Safety Case sign-off, IG/DSPT sign-off, Clinical Pilot,
  Full Rollout, Post-Implementation Clinical Review.`,

  "retail": `
DOMAIN: Retail / E-commerce
WBS mandatory workstreams: Omnichannel Integration, POS Rollout,
  Inventory & Warehouse Cut-over, Loyalty Programme Migration, Store Operations Training.
Resource roles to include: Retail Process Analyst, Merchandise Systems Lead,
  Store Operations Lead, POS Integration Specialist, Loyalty Programme Manager.
Risk patterns: stockcount accuracy during cutover, POS downtime impact on trading,
  loyalty point migration errors, ERP/WMS integration failures,
  staff training completion before peak, supplier data quality.
Scheduling constraints: HARD BLACKOUT Nov 1 – Jan 15 (peak trading season —
  no go-live, major deployments, or cutover activity). Secondary blackout:
  Easter trading week, Bank Holiday weekends.
Milestones: UAT sign-off (trading simulation), Pilot Store go-live, Full Chain Rollout,
  Peak Readiness Review.`,

  "financial services": `
DOMAIN: Financial Services / Banking / Insurance
Regulatory & standards: SOX compliance, FCA/PRA regulations (UK), GDPR,
  PCI-DSS (payment processing), Basel III (banking capital), IFRS 17 (insurance).
WBS mandatory workstreams: Regulatory Compliance & Audit, Data Governance,
  Model Risk Sign-off, Security & Penetration Testing, Business Continuity Planning,
  Parallel Run (dual running of old and new systems before cutover).
Resource roles to include: Data Governance Lead, Model Risk Analyst,
  Compliance Lead, Business Continuity Lead, Security Analyst, Quantitative Analyst.
Risk patterns: regulatory non-compliance, data sovereignty issues, model validation failure,
  fraud vector introduction via new system, audit trail gaps, vendor concentration risk.
Scheduling constraints: avoid quarter-end and year-end regulatory reporting periods.
  Parallel run period mandatory (typically 4–8 weeks) before full cutover.
Milestones: Regulatory Sign-off, Model Validation, Security Accreditation,
  Parallel Run Start, Cutover Approval, Audit Review.`,

  "telecom": `
DOMAIN: Telecommunications
WBS mandatory workstreams: Network Infrastructure, OSS/BSS Integration,
  Roaming & Interconnect, Network Operations Centre (NOC) Integration, Field Engineer Rollout.
Resource roles to include: Network Architect, OSS/BSS Integration Specialist,
  RF Engineer, NOC Integration Lead, Field Deployment Manager.
Risk patterns: network performance degradation during migration, OSS/BSS integration
  complexity, spectrum licensing delays, field engineer availability, roaming agreement gaps,
  SLA breach during cutover window.
Scheduling constraints: network changes require maintenance windows (typically 2–4am).
  Avoid sporting events and major broadcast dates where network load spikes.
Milestones: Lab Proof of Concept, Field Trial, Network Acceptance Testing,
  Soft Launch (limited geography), Full Coverage Launch.`,

  "manufacturing": `
DOMAIN: Manufacturing / Industrial
WBS mandatory workstreams: OT/IT Integration, MES/ERP Rollout,
  Quality Management System, Maintenance & Reliability, Health & Safety Compliance.
Resource roles to include: Manufacturing Systems Lead, OT Security Specialist,
  Quality Assurance Lead, LEAN/Six Sigma Analyst, Plant Operations Lead.
Risk patterns: production downtime during system cutover, OT network security vulnerabilities,
  MES/ERP data mapping errors, supplier integration failures, safety incident during changeover.
Scheduling constraints: align to planned maintenance shutdowns. Avoid peak production
  periods. Any OT system changes require signed plant safety approval.
Milestones: Factory Acceptance Test, Site Acceptance Test, Parallel Production Run,
  Full Production Go-live, 30-Day Stabilisation Review.`,

  "life sciences": `
DOMAIN: Life Sciences
Regulatory & standards: GxP (GMP, GCP, GLP), FDA 21 CFR Part 11 (electronic records),
  EU Annex 11, ICH Q10 (pharmaceutical quality system), ISO 13485 (medical devices),
  EMA guidelines, GAMP 5 (computerised system validation).
WBS mandatory workstreams: Computerised System Validation (CSV), Computer Qualification &
  Verification (CQV), Regulatory Affairs, Quality Assurance, Data Integrity,
  Change Control, Post-Market Surveillance (if applicable).
Resource roles to include: Validation Lead, Quality Assurance Manager, Regulatory Affairs
  Specialist, Data Integrity Officer, CSV/CQV Engineer, QA Auditor.
Risk patterns: regulatory inspection findings, data integrity breaches, CSV deviations,
  audit trail gaps, software change control failures, cold chain/storage compliance.
Scheduling constraints: avoid regulatory submission windows and scheduled inspections.
  Validation activities require formal approval before system go-live.
Milestones: URS Approval, Design Qualification (DQ), Installation Qualification (IQ),
  Operational Qualification (OQ), Performance Qualification (PQ), Regulatory Submission.`,

  "pharma": `
DOMAIN: Pharmaceutical
Regulatory & standards: GMP (Good Manufacturing Practice), GCP (Good Clinical Practice),
  FDA 21 CFR Parts 210/211, EU GMP Annex 11, EMA guidelines, ICH Q8/Q9/Q10,
  WHO guidelines, DEA regulations (controlled substances if applicable).
WBS mandatory workstreams: GMP Compliance, Clinical Trial Readiness, Regulatory Submission,
  Batch Record Management, Quality Control, Pharmacovigilance, Supply Chain Validation.
Resource roles to include: Qualified Person (QP), Regulatory Affairs Director,
  Clinical Trial Manager, GMP Compliance Lead, Pharmacovigilance Officer,
  Biostatistician, Medical Monitor.
Risk patterns: GMP non-compliance leading to batch rejection, clinical trial protocol
  deviations, regulatory submission delays, supply chain disruption for APIs,
  adverse event reporting failures, import/export licence delays.
Scheduling constraints: avoid scheduled FDA/EMA inspection periods. Clinical trial
  milestones must align with regulatory review windows. Batch release requires QP sign-off.
Milestones: IND/CTA Submission, Phase I/II/III Trial Milestones, NDA/MAA Submission,
  Regulatory Approval, Commercial Launch, Post-Marketing Commitment.`,

  "ecommerce": `
DOMAIN: E-commerce / Digital Commerce
Regulatory & standards: PCI-DSS (payment card industry), GDPR, consumer protection
  regulations, accessibility (WCAG 2.1 AA), distance selling regulations.
WBS mandatory workstreams: Checkout & Payment Integration, Fulfilment & Logistics
  Pipeline, Product Catalogue Migration, Customer Data Migration, Search & Merchandising,
  Performance & Load Testing, Customer Service Integration.
Resource roles to include: E-commerce Platform Architect, Payment Integration Specialist,
  UX/CX Lead, SEO Specialist, Logistics Integration Lead, Data Migration Engineer,
  Performance Test Engineer.
Risk patterns: payment gateway failures during peak traffic, cart abandonment from
  performance degradation, product data quality issues post-migration, SEO ranking
  drops during replatforming, fulfilment integration failures, GDPR compliance gaps.
Scheduling constraints: HARD BLACKOUT Nov 1 – Jan 15 (peak trading / holiday season —
  no major releases, platform migrations, or cutover activity). Secondary blackout:
  Bank Holiday weekends, major sale events (Black Friday, Cyber Monday, Prime Day).
Milestones: Platform Proof of Concept, Payment Integration Sign-off, UAT (end-to-end
  purchase flow), Performance Test Sign-off, Soft Launch, Full Launch, Post-Launch Review.`,
};

function getDomainPlaybook(industry: string | null | undefined): string {
  if (!industry) return "";
  const key = industry.toLowerCase().trim();
  const match = Object.keys(DOMAIN_PLAYBOOK).find(k => key.includes(k) || k.includes(key));
  return match ? DOMAIN_PLAYBOOK[match] : "";
}

// ---------------------------------------------------------------------------

function extractJson(text: string): Record<string, unknown> {
  const fenced = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (fenced) return JSON.parse(fenced[1]);
  let depth = 0, start = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "{") { if (depth++ === 0) start = i; }
    else if (text[i] === "}") { if (--depth === 0 && start !== -1) return JSON.parse(text.slice(start, i + 1)); }
  }
  throw new Error("AI did not return valid JSON");
}

// Guards every JSON-producing AI call against silent truncation.
function parseAIJson(text: string, stopReason: string, label: string): Record<string, unknown> {
  if (stopReason === "max_tokens") {
    throw new Error(`AI response for "${label}" was truncated (hit token limit). Try a smaller input.`);
  }
  return extractJson(text);
}

const PMI_SYSTEM_PROMPT = `You are a senior PMO AI assistant with deep expertise in:
- PMBOK® Guide 6th Edition (process groups, knowledge areas, ITTOs)
- PMBOK® Guide 7th Edition (12 principles, 8 performance domains)
- PMI best practices across Initiating, Planning, Executing, Monitoring & Controlling, and Closing
- EVM (Earned Value Management): PV, EV, AC, CPI, SPI, EAC, VAC, TCPI
- Risk management: cause→event→effect statements, P×I matrix, RBS categories, threat/opportunity strategies
- Scope management: WBS 100% rule, deliverable-oriented decomposition, scope baseline
- Stakeholder management: power/interest grid, engagement levels (Unaware→Resistant→Neutral→Supportive→Leading)
- RACI accountability: exactly one Accountable per activity, clear R/A/C/I distinctions
- Change control: integrated change control, CCB governance, baseline protection
- Benefits realization and project closure per PMBOK 6th Ed 4.7

Generate concise, PMBOK-aligned project management artifacts.
Return ONLY valid JSON — no prose, no markdown outside the JSON block.
Arrays should have 3–8 items unless the schema requires more.
Base all figures and content strictly on the provided project context — do not fabricate numbers.
${GUARDRAIL_SYSTEM_ADDENDUM}`;

/**
 * Canonical top-level JSON keys for each artifact type.
 * Used by the upload route to tell the AI what structure to produce
 * when there is no existing artifact to infer the schema from.
 */
export const ARTIFACT_SCHEMA_HINTS: Record<string, string> = {
  project_charter:       "projectTitle, projectCode, version, projectDescription, businessCase, objectives, successCriteria, scope {inScope, outOfScope}, deliverables, milestones, budget, stakeholders, risks, assumptions, constraints, approvalSignatures",
  business_case:         "title, executiveSummary, problemStatement, proposedSolution, objectives, benefits, costs, risks, alternatives, recommendation, roi",
  stakeholder_register:  "stakeholders (array of {id, name, role, organization, email, power, interest, currentEngagement, desiredEngagement, communicationNeeds, notes})",
  assumption_log:        "assumptions (array of {id, description, category, impact, owner, dateLogged, status})",
  benefits_register:     "benefits (array of {id, description, type, owner, targetDate, measure, baselineValue, targetValue, status, notes})",
  scope_statement:       "projectScope, inScope (array), outOfScope (array), deliverables (array), acceptanceCriteria (array), constraints (array), assumptions (array)",
  wbs:                   "projectName, wbsCode, structuringApproach, phases (array of {id, name, componentType (Discrete|LoE), 100percentCheck, deliverables (array of {id, name, componentType, 100percentCheck, owner, workPackages (array of {id, name, componentType: 'Discrete', isWorkPackage: true, description, estimatedDays, owner, acceptanceCriteria, outOfScope, dependencies})})}), scopeBaselineSummary {totalComponents, totalWorkPackages, totalEstimatedDays, maxDepth, controlAccounts, structuringApproach}, qualityAudit (array of {check, description, result, evidence})",
  milestone_plan:        "milestones (array of {id, name, plannedDate, forecastDate, status, owner, deliverables, description})",
  resource_plan:         "teamDirectory (array of {id, name, role, department, skills, allocationPercent, startDate, endDate, dailyRate, currency, notes}), resourceCalendar, skillsMatrix, resourceConstraints, trainingNeeds",
  cost_plan:             "currency, estimatingMethod, laborEstimates (array of {role, resource, phase, estimatedDays, dailyRate, totalCost}), nonLaborCosts, totalBudget, contingencyReserve, managementReserve, bac, fundingRequirements",
  raid_register:         "risks (array of {id, description, probability, impact, status, owner, mitigation}), assumptions (array), issues (array of {id, description, severity, status, owner, resolution, dueDate}), dependencies (array)",
  risk_register:         "risks (array of {id, statement, category, probability, impact, riskScore, owner, responseActions, status})",
  communication_plan:    "stakeholderComms (array of {stakeholder, information, format, frequency, owner, channel})",
  raci_matrix:           "activities (array of {id, activity, phase, assignments (object keyed by role: R|A|C|I)}), roles (array of strings)",
  quality_plan:          "qualityObjectives, qualityStandards (array), qualityActivities (array of {activity, phase, owner, tool, acceptance}), metrics (array)",
  action_log:            "actions (array of {id, description, owner, dueDate, priority, status, notes})",
  issue_register:        "issues (array of {id, description, severity, status, owner, resolutionPlan, dateRaised, dueDate})",
  decision_log:          "decisions (array of {id, description, decisionMade, rationale, owner, date, impact, alternatives})",
  weekly_status:         "reportDate, reportingPeriod, overallStatus, scheduleStatus, costStatus, scopeStatus, qualityStatus, accomplishments, plannedNextPeriod, risks, issues, decisions, metrics",
  monthly_status:        "reportDate, reportingPeriod, overallStatus, executiveSummary, milestoneStatus (array), budgetSummary, schedulePerformance, keyRisks, keyIssues, decisionsRequired",
  change_log:            "changes (array of {id, title, description, requestedBy, dateSubmitted, impact, status, approvedBy, implementationDate})",
  lessons_learned:       "lessons (array of {id, phase, category, description, impact, recommendation, owner, status})",
  closure_report:        "projectName, closureDate, sponsor, pm, objectivesAchievement (array), deliverablesStatus (array), budgetSummary, scheduleSummary, lessonsLearned (array), openItems (array), approvalSignatures (array)",
  traceability_matrix:       "requirements (array of {id, description, source, wbsRef, milestone, deliverable, acceptanceCriteria, validationMethod, owner, status})",
  dependencies_register:     "dependencies (array of {id, description, type (internal|external|technical|commercial), dependentOn, owner, expectedDate, status (open|resolved|at-risk), impact, mitigationAction})",
  quarterly_business_review: "quarter, projectName, executiveSummary, ragStatus, milestoneReview (array of {milestone, planned, forecast, status}), budgetSummary {budget, actualToDate, forecastAtCompletion, variance}, schedulePerformance {spi, spiTrend}, costPerformance {cpi, cpiTrend}, keyRisks (array), keyIssues (array), decisions (array), nextQuarterPlan (array), clientActions (array)",
};

const ARTIFACT_MAX_TOKENS = 32000;

export interface ArtifactTemplateOverride {
  systemAddendum?: string | null;
  userAddendum?: string | null;
  templateId?: string | null;
}

const DOMAIN_SENSITIVE_ARTIFACTS = ["wbs", "resource_plan", "risk_register", "project_schedule"];

export async function generateArtifact(
  artifactType: string,
  projectContext: Record<string, unknown>,
  requirements?: string,
  evidenceContext?: EvidenceContext,
  domainContext?: string,
  templateOverride?: ArtifactTemplateOverride
): Promise<Record<string, unknown>> {
  const content = buildArtifactContent(artifactType, projectContext, requirements, evidenceContext, templateOverride);
  const config = await resolveModel("artifact");

  // Build system prompt: base → domain playbook → dynamic domain context → client addendum
  const domainBlock = DOMAIN_SENSITIVE_ARTIFACTS.includes(artifactType)
    ? getDomainPlaybook(projectContext.industry as string)
    : "";
  const parts = [PMI_SYSTEM_PROMPT];
  if (domainBlock) parts.push(`---\n${domainBlock}`);
  if (domainContext) parts.push(`---\n${domainContext}`);
  if (templateOverride?.systemAddendum) parts.push(`MANDATORY CLIENT-SPECIFIC INSTRUCTIONS — these override your defaults:\n${templateOverride.systemAddendum}`);
  const systemText = parts.join("\n\n");

  const userContent = content.map((b) => b.text).join("\n\n");

  const response = await streamLLM(
    { model: config.model, maxTokens: ARTIFACT_MAX_TOKENS, system: systemText, messages: [{ role: "user", content: userContent }] },
    config
  );

  return parseAIJson(response.text, response.stopReason, `artifact:${artifactType}`);
}

export async function generateProjectFromNL(description: string): Promise<Record<string, unknown>> {
  const config = await resolveModel("nl_project");
  const system = `You are a senior PMO AI. Extract structured project fields from a natural language description or requirements document.
Return JSON with these fields (infer from context; leave null if not found):
- name (string): project name
- customer (string): client or customer organization
- projectType (string): e.g. "Implementation", "Migration", "Transformation", "Development", "Consulting"
- methodology (string): waterfall | agile | kanban | safe | hybrid
- industry (string): e.g. "Financial Services", "Healthcare", "Retail", "Technology"
- projectSize (string): small | medium | large | enterprise
- budget (number): numeric budget value
- currency (string): USD | GBP | EUR etc.
- deliveryModel (string): fixed_price | time_and_material | managed_services | staff_aug
- teamSize (number): estimated team headcount
- startDate (string): ISO date
- endDate (string): ISO date
- description (string): concise project description
- objectives (array of strings): 3–5 SMART objectives
- scopeIncludes (array of strings): key in-scope deliverables
- scopeExcludes (array of strings): explicit exclusions
- constraints (array of strings): budget/schedule/regulatory constraints
- assumptions (array of strings): key assumptions
- sponsor (string): executive sponsor name/role if mentioned
- clarifyingQuestions (array of strings): questions if critical info is missing`;

  const response = await callLLM(
    {
      model: config.model,
      maxTokens: config.maxTokens,
      system,
      messages: [{ role: "user", content: `Extract project fields from this description:\n\n${description}\n\nReturn JSON only.` }],
    },
    config
  );

  return parseAIJson(response.text, response.stopReason, "project-from-document");
}

export interface StatusQuestion {
  id: number;
  category: string;
  question: string;
  type: "chips" | "multi-chips" | "number" | "select";
  suggestedAnswers: string[];
  allowCustom: boolean;
  required: boolean;
  placeholder?: string;
  unit?: string;
}

export async function generateStatusQuestions(
  projectContext: Record<string, unknown>
): Promise<StatusQuestion[]> {
  const config = await resolveModel("status_questions");
  const system = `You are a senior PMO AI conducting a weekly project health check for a Project Manager.
Generate exactly 10 targeted questions based on the project's current context.

Rules:
- Cover the most relevant categories from: Schedule, Budget, Scope, Quality, Risks, Issues, Team/Resources, Stakeholder Sentiment, Accomplishments, Next Week Plan, Change Requests
- Make questions SPECIFIC to the project data — if SPI < 1, probe the delay; if risks are open, ask about mitigation; if near deadline, ask about closure readiness
- Always include one Accomplishments question and one Next Week Plan question
- For EVERY question, generate 4–6 suggested answers that are SPECIFIC to this project's context, phase, industry, and current health. These should be realistic options a PM for this project would actually choose.
- Types:
  - "chips": PM picks ONE of the suggested answers (single-select chips). Use for status/assessment questions.
  - "multi-chips": PM picks ONE OR MORE suggested answers. Use for accomplishments, risks, plans, issues.
  - "select": dropdown for simple categorical choices (RAG, yes/no, methodology-specific)
  - "number": numeric input for percentages, counts, days
- Set allowCustom: true when the PM might have an answer not in the list (narrative, unique situations)
- Return JSON: { "questions": [ { "id": 1, "category": "...", "question": "...", "type": "chips|multi-chips|select|number", "suggestedAnswers": ["...", "..."], "allowCustom": true|false, "required": true, "placeholder": "..." } ] }`;

  const response = await callLLM(
    {
      model: config.model,
      maxTokens: config.maxTokens,
      system,
      messages: [{ role: "user", content: `Generate 10 weekly status questions for this project:\n\n${JSON.stringify(projectContext, null, 2)}\n\nReturn JSON only.` }],
    },
    config
  );

  const result = parseAIJson(response.text, response.stopReason, "status-questions") as any;
  return result.questions as StatusQuestion[];
}

export async function generateStatusSummary(
  rawInput: Record<string, unknown>,
  projectContext: Record<string, unknown>,
  liveEVM?: { pv: number; ev: number; sv: number; spi: number | null; overdueTasks: number }
): Promise<{ summary: string; ragStatus: string; healthScore: number; recommendations: string[]; accomplishments: string[]; nextWeekPlan: string[]; metricsNarrative: string; cpi: number | null; spi: number | null }> {
  const evmSection = liveEVM
    ? `\n\nLIVE SCHEDULE EVM (computed from actual task progress — use these numbers directly in your report, do not invent alternatives):
- Planned Value (PV): ${liveEVM.pv.toFixed(1)} task-days
- Earned Value (EV): ${liveEVM.ev.toFixed(1)} task-days
- Schedule Variance (SV): ${liveEVM.sv > 0 ? "+" : ""}${liveEVM.sv.toFixed(1)} task-days
- Schedule Performance Index (SPI): ${liveEVM.spi != null ? liveEVM.spi.toFixed(2) : "N/A"}${liveEVM.spi != null ? (liveEVM.spi >= 1 ? " (on/ahead of schedule)" : liveEVM.spi >= 0.85 ? " (slight delay)" : " (significantly behind schedule)") : ""}
- Overdue tasks: ${liveEVM.overdueTasks}`
    : "";

  const config = await resolveModel("status_summary");
  const system = `You are a PMO AI. Generate a structured Weekly Status Report from the PM's Q&A responses.
Apply PMBOK Monitoring & Controlling (4.5) principles. Do not introduce figures not in the inputs.
When live EVM data is provided, use those exact numbers in metricsNarrative and spi field — do not override them.

Return JSON with:
- summary (string): 2–3 sentence executive summary, stakeholder-ready
- ragStatus (string): "green" | "amber" | "red" with clear rationale from the answers
- healthScore (number 0–100): composite project health
- recommendations (array of strings): 2–4 specific, actionable recommendations for the PM
- accomplishments (array of strings): bulleted accomplishments extracted from answers
- nextWeekPlan (array of strings): bulleted plan for next week extracted from answers
- metricsNarrative (string): 1–2 sentences describing schedule, budget, and quality status; include SPI and SV if EVM data is provided
- cpi (number | null): cost performance index if derivable from answers, else null
- spi (number | null): use the live SPI value if provided, else derive from PM answers, else null`;

  const response = await callLLM(
    {
      model: config.model,
      maxTokens: config.maxTokens,
      system,
      messages: [{ role: "user", content: `Project context:\n${JSON.stringify(projectContext, null, 2)}${evmSection}\n\nPM Q&A responses:\n${JSON.stringify(rawInput, null, 2)}\n\nGenerate the Weekly Status Report. Return JSON only.` }],
    },
    config
  );

  return parseAIJson(response.text, response.stopReason, "status-summary") as unknown as { summary: string; ragStatus: string; healthScore: number; recommendations: string[]; accomplishments: string[]; nextWeekPlan: string[]; metricsNarrative: string; cpi: number | null; spi: number | null };
}

export async function generateScheduleRecovery(
  projectContext: Record<string, unknown>,
  evm: { pv: number; ev: number; sv: number; spi: number; overdueTasks: number; overdueTaskNames: string[] },
  tasks: { name: string; phase: string; percentComplete: number; baselineDays: number; status: string }[]
): Promise<{ headline: string; steps: { title: string; action: string; effort: string; impact: string }[]; estimatedRecovery: string }> {
  const config = await resolveModel("schedule_recovery");
  const system = `You are a PMO recovery specialist. A project is behind schedule (SPI < 0.8) and the PM needs a concrete recovery plan.
Apply PMBOK schedule compression techniques: fast-tracking, crashing, scope reduction, resource reallocation.
Return JSON with:
- headline (string): 1-sentence diagnosis of the delay root cause based on the data
- steps (array of 4–6 objects): each has title (short action name), action (specific what-to-do in 2 sentences), effort ("Low"|"Medium"|"High"), impact ("Low"|"Medium"|"High")
- estimatedRecovery (string): realistic estimate of how many days/weeks recovery will take if steps are followed`;

  const response = await callLLM(
    {
      model: config.model,
      maxTokens: config.maxTokens,
      system,
      messages: [{ role: "user", content: `Project: ${JSON.stringify(projectContext)}\n\nEVM metrics: SPI=${evm.spi}, SV=${evm.sv} task-days, PV=${evm.pv}, EV=${evm.ev}, Overdue tasks: ${evm.overdueTasks} (${evm.overdueTaskNames.join(", ")})\n\nTask breakdown (top 10): ${JSON.stringify(tasks.slice(0, 10))}\n\nGenerate recovery plan JSON only.` }],
    },
    config
  );

  return parseAIJson(response.text, response.stopReason, "schedule-recovery") as unknown as { headline: string; steps: { title: string; action: string; effort: string; impact: string }[]; estimatedRecovery: string };
}

export async function extractRequirements(text: string): Promise<Record<string, unknown>> {
  const config = await resolveModel("requirements");
  const system = `You are a PMO AI. Extract structured project requirements from documents per PMBOK 5.2 (Collect Requirements).
Return JSON with:
- goals (array of strings): business/project goals
- scopeItems (array of strings): in-scope deliverables
- outOfScope (array of strings): explicit exclusions if mentioned
- stakeholders (array of {name, role, interest}): key stakeholders
- constraints (array of strings): budget, schedule, regulatory, technical constraints
- assumptions (array of strings): stated or implied assumptions
- timeline (string): timeline description
- budgetSignals (string): any budget figures or signals
- methodology (string): delivery approach if mentioned
- risks (array of strings): any risks or concerns mentioned
- confidence (number 0-1): confidence in extraction quality`;

  const response = await callLLM(
    {
      model: config.model,
      maxTokens: config.maxTokens,
      system,
      messages: [{ role: "user", content: `Extract requirements from this document:\n\n${text.slice(0, 12000)}\n\nReturn JSON only.` }],
    },
    config
  );

  return parseAIJson(response.text, response.stopReason, "requirements-extraction");
}

export async function chatCommand(
  command: string,
  context: Record<string, unknown>
): Promise<string> {
  const config = await resolveModel("chat");
  const system = `You are a senior PMO AI copilot with PMBOK 6th/7th edition expertise.
Help the user with project management tasks, artifact generation, and PMI best practices.
You have access to the current project context. Respond concisely and helpfully.
Reference PMBOK processes, knowledge areas, and principles where relevant.`;

  const response = await callLLM(
    {
      model: config.model,
      maxTokens: config.maxTokens,
      system,
      messages: [{ role: "user", content: `Context: ${JSON.stringify(context, null, 2)}\n\nUser command: ${command}` }],
    },
    config
  );

  return response.text;
}

export async function askPortfolio(
  question: string,
  context: Record<string, unknown>,
  role: string
): Promise<string> {
  const roleGuidance: Record<string, string> = {
    pm: "The user is a Project Manager. Focus answers on their own projects: schedule/budget risk, next actions, drafting artifacts or stakeholder communications on their behalf.",
    pgm: "The user is a Program Manager overseeing a set of programs and their projects. Focus on cross-project patterns within their programs, at-risk projects needing intervention, escalations, and PM performance across the portfolio.",
    delivery_head: "The user is a Delivery/Practice Head (executive). Be concise and numbers-first. Lead with the bottom line (cost, risk, delivery health), flag anything needing executive decision, and quantify impact in dollars where possible.",
    admin: "The user is an org administrator with full visibility. Answer with portfolio-wide context, calling out governance or process gaps where relevant.",
  };

  const config = await resolveModel("portfolio_chat");
  const system = `You are the PM Agent portfolio copilot — a senior PMO AI with PMBOK 6th/7th edition expertise, embedded across a portfolio delivery platform.
${roleGuidance[role] ?? roleGuidance.pm}
You have access to live portfolio data (projects, health, budget, risks, issues, milestones) provided as context below.
Answer directly and concisely using only the data provided — never fabricate figures, names, or dates not present in context.
If asked to draft something (an email, a message, a summary), produce it ready to send/use.
If the answer requires data not present in context, say what's missing rather than guessing.
Use markdown formatting (bold, bullet lists) sparingly for readability in a chat UI.`;

  const response = await callLLM(
    {
      model: config.model,
      maxTokens: config.maxTokens,
      system,
      messages: [{ role: "user", content: `Portfolio context:\n${JSON.stringify(context, null, 2)}\n\nQuestion: ${question}` }],
    },
    config
  );

  return response.text;
}

function buildArtifactContent(
  artifactType: string,
  projectContext: Record<string, unknown>,
  requirements?: string,
  evidenceContext?: EvidenceContext,
  templateOverride?: ArtifactTemplateOverride
): { text: string }[] {
  const templates: Record<string, string> = {

    // ── INITIATING ────────────────────────────────────────────────────────────

    project_charter: `Generate a Project Charter per PMBOK 6th Ed Process 4.1 (Develop Project Charter) and 13.1 (Identify Stakeholders).
Return JSON with:
- projectTitle (string)
- projectCode (string): short alphanumeric code
- version (string): "1.0"
- preparedBy (string): PM name
- approvedBy (string): sponsor name
- date (string): ISO date
- projectDescription (string): clear, concise purpose statement
- businessCase (string): strategic problem or opportunity this project addresses
- objectives (array of strings): 3–5 SMART objectives — specific, measurable, achievable, relevant, time-bound
- successCriteria (array of {criterion, measure, target}): how success will be measured
- scope (object):
    inScope (array of strings): key deliverables explicitly included
    outOfScope (array of strings): explicit exclusions to prevent scope creep
- deliverables (array of strings): major project deliverables
- milestones (array of {name, targetDate, description})
- budget (object): {total (string), currency (string), fundingSource (string), contingencyReserve (string)}
- stakeholders (array of {name, role, organization, power (High/Medium/Low), interest (High/Medium/Low), engagementLevel (Unaware/Resistant/Neutral/Supportive/Leading), notes})
- risks (array of strings): top 3–5 high-level risks at initiation
- assumptions (array of strings)
- constraints (array of strings): budget, schedule, regulatory, resource
- pmAuthority (string): PM's authority level and decision-making scope
- approvalRequirements (string): what constitutes project approval
- approvalSignatures (array of {role, name})`,

    business_case: `Generate a Business Case per PMBOK 6th Ed initiating inputs (Business Documents).
Return JSON with:
- title (string)
- preparedBy (string)
- date (string)
- executiveSummary (string)
- problemStatement (string): the business problem or opportunity
- strategicAlignment (array of strings): how this aligns to organizational strategy
- options (array of {option, description, pros (array), cons (array), estimatedCost, estimatedBenefit, roi})
- recommendedOption (string): which option is recommended and why
- financialAnalysis (object): {npv (string), roi (string), paybackPeriod (string), totalCost (string), totalBenefit (string), currency (string)}
- nonFinancialBenefits (array of strings)
- risks (array of {description, probability (High/Medium/Low), impact (High/Medium/Low), mitigation})
- assumptions (array of strings)
- constraints (array of strings)
- recommendation (string): clear recommendation for approval`,

    stakeholder_register: `Generate a Stakeholder Register per PMBOK 6th Ed Process 13.1 (Identify Stakeholders) and 9.1 (Plan Resource Management).
Return JSON with:
- stakeholders (array of {
    id (string): S001, S002…
    name (string)
    title (string)
    organization (string)
    category (string): Internal | External | Sponsor | Regulator | Vendor | Customer
    power (string): High | Medium | Low
    interest (string): High | Medium | Low
    quadrant (string): Manage Closely | Keep Satisfied | Keep Informed | Monitor
    currentEngagement (string): Unaware | Resistant | Neutral | Supportive | Leading
    desiredEngagement (string): Unaware | Resistant | Neutral | Supportive | Leading
    influenceStrategy (string): how to move them to desired engagement
    communicationNeeds (string): what information, how often, which channel
    notes (string)
  })
- powerInterestSummary (string): overall stakeholder landscape narrative`,

    initiation_deck: `Generate a Project Initiation Deck for CXO stakeholder presentation per PMBOK 6th Ed 4.1 and PMI charter best practices.
Structure the output as individual slides so each section maps directly to a PowerPoint slide.
Return JSON with:
- projectTitle (string)
- projectCode (string)
- date (string): ISO date
- preparedBy (string): PM name
- version (string): "1.0"
- slides (array of slide objects — one object per slide, in presentation order):
    SLIDE 1 — Cover
    { slideNumber: 1, title: "Cover", layout: "cover",
      projectTitle (string), tagline (string): one-sentence value proposition,
      sponsor (string), pm (string), date (string), confidentiality (string): e.g. "Confidential — For Steering Committee" }

    SLIDE 2 — Agenda
    { slideNumber: 2, title: "Agenda", layout: "agenda",
      items (array of strings): slide titles in order }

    SLIDE 3 — Executive Summary
    { slideNumber: 3, title: "Executive Summary", layout: "summary",
      headline (string): one punchy sentence,
      problemStatement (string): the business problem or opportunity,
      proposedSolution (string): what this project will deliver,
      strategicAlignment (array of strings): how it aligns to org strategy,
      expectedOutcome (string): what success looks like }

    SLIDE 4 — Business Case & Objectives
    { slideNumber: 4, title: "Business Case & Objectives", layout: "objectives",
      businessCase (string): why now, why this investment,
      objectives (array of {objective (string), measure (string), target (string)}): 3–5 SMART objectives,
      successCriteria (array of strings) }

    SLIDE 5 — Project Scope
    { slideNumber: 5, title: "Project Scope", layout: "scope",
      inScope (array of strings): key deliverables explicitly included,
      outOfScope (array of strings): explicit exclusions,
      assumptions (array of strings),
      constraints (array of strings) }

    SLIDE 6 — Key Deliverables
    { slideNumber: 6, title: "Key Deliverables", layout: "deliverables",
      deliverables (array of {name (string), description (string), phase (string), owner (string)}) }

    SLIDE 7 — Timeline & Milestones
    { slideNumber: 7, title: "Timeline & Milestones", layout: "timeline",
      startDate (string), endDate (string), duration (string): e.g. "9 months",
      phases (array of {name (string), startDate (string), endDate (string)}),
      milestones (array of {id (string): M1…, name (string), targetDate (string), description (string), isCritical (boolean)}) }

    SLIDE 8 — Budget & Resources
    { slideNumber: 8, title: "Budget & Resources", layout: "budget",
      totalBudget (string): with currency,
      budgetBreakdown (array of {category (string), amount (string), percentage (string)}),
      teamSize (number),
      keyRoles (array of {role (string), count (number), notes (string)}),
      fundingSource (string),
      contingencyReserve (string) }

    SLIDE 9 — Stakeholders & Governance
    { slideNumber: 9, title: "Stakeholders & Governance", layout: "governance",
      stakeholders (array of {name (string), role (string), organization (string), power (string): High|Medium|Low, interest (string): High|Medium|Low, engagementLevel (string)}),
      governance (object): {sponsor (string), pm (string), steeringCommittee (string), escalationPath (string), reportingCadence (string), decisionAuthority (string)} }

    SLIDE 10 — Risks & Mitigation
    { slideNumber: 10, title: "Top Risks & Mitigation", layout: "risks",
      risks (array of {id (string): R1…, risk (string), probability (string): High|Medium|Low, impact (string): High|Medium|Low, mitigation (string), owner (string)}) — top 5 risks only }

    SLIDE 11 — Benefits & ROI
    { slideNumber: 11, title: "Expected Benefits & ROI", layout: "benefits",
      quantitativeBenefits (array of {benefit (string), value (string), timeframe (string)}),
      qualitativeBenefits (array of strings),
      roi (string): estimated ROI or payback period,
      kpis (array of {kpi (string), baseline (string), target (string), owner (string)}) }

    SLIDE 12 — Next Steps & Approvals
    { slideNumber: 12, title: "Next Steps & Approvals", layout: "approval",
      immediateActions (array of {action (string), owner (string), dueDate (string)}),
      decisionRequired (string): what the steering committee must decide today,
      approvalSignatures (array of {role (string), name (string)}) }`,

    assumption_log: `Generate an Assumption Log per PMBOK 6th Ed (Initiating — used across all process groups).
Return JSON with:
- assumptions (array of {
    id (string): A001, A002…
    description (string): clear assumption statement
    category (string): Technical | Business | Resource | External | Schedule | Cost
    owner (string)
    dateIdentified (string)
    validationMethod (string): how this will be confirmed
    validationDate (string): when it will be validated
    status (string): Open | Validated | Invalid | Deferred
    impactIfWrong (string): consequence if assumption proves false
    notes (string)
  })`,

    benefits_register: `Generate a Benefits Register per PMBOK 6th Ed 4.7 (Close Project) and Benefits Management Plan inputs.
Return JSON with:
- benefits (array of {
    id (string): B001, B002…
    name (string)
    description (string)
    type (string): Financial | Strategic | Operational | Customer | Compliance | Employee
    owner (string): who is accountable for realizing this benefit
    baseline (string): current state measurement
    target (string): expected post-project measurement
    unit (string): metric unit (%, $, score, count)
    targetDate (string): when benefit is expected to be realized
    trackingMethod (string): how it will be measured
    dependencies (string): what must be true to realize this benefit
    status (string): Planned | On Track | At Risk | Realized | Not Realized
    notes (string)
  })`,

    // ── PLANNING ─────────────────────────────────────────────────────────────

    scope_statement: `Generate a Scope Statement per PMBOK 6th Ed Processes 5.2 (Collect Requirements) and 5.3 (Define Scope).
Return JSON with:
- projectName (string)
- version (string)
- approvedBy (string)
- date (string)
- projectObjectives (array of strings): measurable objectives
- productScope (string): description of the product, service, or result
- projectScope (string): work that must be done to deliver it
- deliverables (array of {name, description, acceptanceCriteria})
- inScope (array of strings): explicitly included
- outOfScope (array of strings): explicitly excluded to prevent scope creep
- assumptions (array of strings)
- constraints (array of strings)
- dependencies (array of strings): external dependencies
- acceptanceCriteria (string): overall project acceptance criteria
- approvalRequirements (string)`,

    wbs: `Generate a Work Breakdown Structure per PMBOK 6th Ed Process 5.4 (Create WBS).
Use deliverable-oriented decomposition: every element is a noun/noun-phrase outcome, never a verb or activity.
Include a "Project Management" phase covering: Project Charter, Project Management Plan, Project Schedule, Risk Register, Status Reports, Lessons Learned.

Return JSON with:
- projectName (string)
- phases (array of phases):
  {
    id (string): "1.1", "1.2" …
    name (string): deliverable-oriented phase name
    owner (string): team or role
    deliverables (array):
      {
        id (string): "1.1.1" …
        name (string): deliverable name
        owner (string)
        workPackages (array):
          {
            id (string): "1.1.1.1" …
            name (string): work package name
            description (string): what this deliverable contains
            estimatedDays (number)
            owner (string)
            acceptanceCriteria (string)
          }
      }
  }
- scopeBaselineSummary (object):
  {
    totalWorkPackages (number)
    totalEstimatedDays (number)
    note (string)
  }`,

    milestone_plan: `Generate a Milestone Plan per PMBOK 6th Ed Processes 6.2 (Define Activities) and 6.5 (Develop Schedule).
Return JSON with:
- projectName (string)
- startDate (string)
- endDate (string)
- baselineDate (string): when baseline was set
- milestones (array of {
    id (string): M001, M002…
    name (string)
    description (string)
    phase (string)
    plannedDate (string): ISO date — baseline
    forecastDate (string): current forecast
    actualDate (string | null)
    status (string): Not Started | On Track | At Risk | Slipped | Complete
    isCritical (boolean): true if on critical path
    deliverables (array of strings): what is produced at this milestone
    owner (string)
    predecessors (array of strings): milestone IDs this depends on
    variance (string): e.g. "+3 days" or "On schedule"
    notes (string)
  })
- criticalPathSummary (string): description of the critical path
- schedulePerformanceIndex (string): SPI if data available, else "TBD"`,

    resource_plan: `Generate a Resource Management Plan per PMBOK 6th Ed Process 9.1 (Plan Resource Management) and 9.2 (Estimate Activity Resources).
Return JSON with:
- projectName (string)
- teamDirectory (array of {
    id (string): R001, R002…
    name (string)
    role (string)
    department (string)
    skills (array of strings)
    allocationPercent (number): 0-100
    startDate (string)
    endDate (string)
    location (string)
    dailyRate (number | null): optional
    currency (string)
    notes (string)
  })
- resourceCalendar (object): {workingDays (array of strings), holidays (array of strings), notes (string)}
- skillsMatrix (array of {skill, required (boolean), team members who have it (array of strings)})
- resourceConstraints (array of strings)
- trainingNeeds (array of {role, skill, trainingType, targetDate})`,

    cost_plan: `Generate a Cost Management Plan and Budget per PMBOK 6th Ed Processes 7.1 (Plan Cost Management), 7.2 (Estimate Costs), 7.3 (Determine Budget), and 7.4 (Control Costs — EVM setup).
Return JSON with:
- projectName (string)
- currency (string)
- estimatingMethod (string): Bottom-Up | Analogous | Parametric | Three-Point
- laborEstimates (array of {
    role (string)
    resource (string)
    phase (string)
    estimatedDays (number)
    dailyRate (number)
    totalCost (number)
    basisOfEstimate (string)
  })
- nonLaborCosts (array of {category (string), description (string), amount (number), phase (string)})
- costSummary (object): {
    totalLaborCost (number)
    totalNonLaborCost (number)
    subtotal (number)
    contingencyReserve (number): for known-unknown risks (typically 10-20%)
    costBaseline (number): subtotal + contingency reserve
    managementReserve (number): for unknown-unknown risks (typically 5-10%)
    totalBudget (number): BAC — Budget at Completion
  }
- phaseBreakdown (array of {phase, plannedValue (number), cumulativePV (number)})
- evmSetup (object): {
    bac (number): Budget at Completion
    plannedValueByPeriod (array of {period (string), pv (number), cumulativePV (number)})
    earningRule (string): e.g. "0/100 for work packages under 2 weeks"
    reportingCadence (string)
  }
- fundingRequirements (array of {period (string), amount (number), cumulativeAmount (number)})`,

    raid_register: `Generate a RAID Register per PMBOK 6th Ed Risk Management (11.1–11.7), covering Risks, Assumptions, Issues, and Dependencies.
Return JSON with:
- risks (array of {
    id (string): R001, R002…
    category (string): Technical | Schedule | Cost | Resource | External | Organizational | Quality
    statement (string): "If [cause], then [event], causing [effect]" — cause→event→effect format
    probability (string): Very Low | Low | Medium | High | Very High
    probabilityScore (number): 1-5
    impact (string): Very Low | Low | Medium | High | Very High
    impactScore (number): 1-5
    riskScore (number): probabilityScore × impactScore
    severity (string): Low (1-4) | Medium (5-9) | High (10-19) | Critical (20-25)
    type (string): Threat | Opportunity
    strategy (string): for Threat: Avoid/Transfer/Mitigate/Escalate/Accept; for Opportunity: Exploit/Share/Enhance/Escalate/Accept
    responseActions (array of strings)
    contingencyPlan (string)
    owner (string)
    trigger (string): condition that indicates risk is occurring
    status (string): Open | In Progress | Closed | Occurred | Accepted
    dueDate (string)
  })
- assumptions (array of {
    id (string): A001…
    description (string)
    category (string): Technical | Business | Resource | External
    owner (string)
    validationDate (string)
    status (string): Open | Validated | Invalid
    impactIfWrong (string)
  })
- issues (array of {
    id (string): I001…
    description (string)
    category (string): Scope | Schedule | Cost | Quality | Resource | Technical | Vendor
    severity (string): Critical | High | Medium | Low
    rootCause (string)
    owner (string)
    resolutionPlan (string)
    targetResolutionDate (string)
    status (string): Open | In Progress | Escalated | Resolved | Closed
  })
- dependencies (array of {
    id (string): D001…
    description (string)
    type (string): Internal | External | Technical | Organizational
    dependsOn (string): what this depends on
    owner (string)
    expectedDate (string)
    impactIfDelayed (string)
    status (string): On Track | At Risk | Delayed | Resolved
  })`,

    risk_register: `Generate a Risk Register per PMBOK 6th Ed Processes 11.1–11.7 (full risk management lifecycle).
Return JSON with:
- projectName (string)
- riskAppetite (string): Low | Medium | High
- escalationThreshold (string): what P×I score triggers escalation to sponsor
- risks (array of {
    id (string): R001, R002…
    category (string): Technical | Schedule | Cost | Resource | External | Organizational | Quality | Procurement
    statement (string): "If [cause], then [event], causing [effect]" — ALWAYS use cause→event→effect format
    type (string): Threat | Opportunity
    probability (string): Very Low | Low | Medium | High | Very High
    probabilityScore (number): 1-5
    impact (string): Very Low | Low | Medium | High | Very High
    impactScore (number): 1-5
    riskScore (number): probabilityScore × impactScore
    severity (string): Low (1-4) | Medium (5-9) | High (10-19) | Critical (20-25)
    velocity (string): Immediate | Short-term | Medium-term | Long-term
    strategy (string): Threats → Avoid/Transfer/Mitigate/Escalate/Accept; Opportunities → Exploit/Share/Enhance/Escalate/Accept
    responseActions (array of strings): specific, actionable steps
    contingencyPlan (string): if risk occurs
    contingencyReserve (string): budget reserve allocated
    owner (string): single named owner
    trigger (string): observable event that indicates risk is materializing
    residualRiskScore (number): P×I after response
    status (string): Open | In Progress | Closed | Occurred | Accepted
    dueDate (string)
  })
- riskExposureSummary (object): {totalRisks, criticalCount, highCount, mediumCount, lowCount, topRisk (string)}`,

    communication_plan: `Generate a Communications Management Plan per PMBOK 6th Ed Process 10.1 (Plan Communications Management).
Apply the communications channels formula: n(n−1)/2.
Return JSON with:
- projectName (string)
- stakeholderCount (number)
- communicationChannels (number): n(n-1)/2
- communicationItems (array of {
    id (string): C001…
    name (string): e.g. "Weekly Status Report", "Steering Committee Deck", "Risk Review"
    type (string): Status Report | Escalation | Meeting | Dashboard | Newsletter | Ad Hoc
    audience (string): who receives this
    purpose (string): why this communication exists
    frequency (string): Daily | Weekly | Bi-weekly | Monthly | Quarterly | As Needed | Milestone-triggered
    channel (string): Email | Teams/Slack | Meeting | SharePoint | Dashboard | Report
    format (string): PPTX | XLSX | Email | Verbal | Dashboard
    owner (string): who produces/sends it
    escalationPath (string): if this communication triggers an action
    notes (string)
  })
- meetingCadence (array of {meeting, attendees (array), frequency, duration, owner, agenda (array of strings)})`,

    raci_matrix: `Generate a RACI Matrix per PMBOK 6th Ed Process 9.1 (Plan Resource Management) — Responsibility Assignment Matrix.
CRITICAL RULES: (1) Exactly ONE Accountable (A) per activity — two A's means none. (2) At least one Responsible (R) per activity. (3) R/A/C/I only in role cells.
Return JSON with:
- projectName (string)
- roles (array of strings): all project roles e.g. ["Sponsor", "PM", "BA", "Tech Lead", "Developer", "QA Lead", "Change Manager", "Steering Committee"]
- activities (array of {
    id (string): T001…
    activity (string): deliverable or activity name
    phase (string)
    roles (object): keys = role names, values = "R" | "A" | "C" | "I" | "-"
    notes (string)
  })
- teamDirectory (array of {
    id (string)
    name (string)
    role (string)
    department (string)
    allocationPercent (number)
    location (string)
    contact (string)
  })
- raciSummary (object): {activitiesCount, rolesCount, accountabilityCheck (string): "Pass" if every activity has exactly one A}`,

    quality_plan: `Generate a Quality Management Plan per PMBOK 6th Ed Processes 8.1 (Plan Quality Management), 8.2 (Manage Quality), 8.3 (Control Quality).
Return JSON with:
- projectName (string)
- qualityPolicy (string): project quality policy statement
- qualityObjectives (array of strings)
- qualityStandards (array of {standard, applicableTo, reference})
- qualityMetrics (array of {
    metric (string)
    definition (string)
    unit (string)
    baseline (string)
    target (string)
    measurementMethod (string)
    frequency (string)
    owner (string)
  })
- qaActivities (array of {activity, purpose, frequency, owner, method})
- qcCheckpoints (array of {phase, checkpoint, criteria, method, owner, deliverable})
- defectManagement (object): {process (string), severity levels (array of {level, definition, responseTime}), tools (string)}
- continuousImprovement (string)`,

    // ── EXECUTION ─────────────────────────────────────────────────────────────

    evm_analysis: `Generate a full Earned Value Management (EVM) Analysis per PMI/PMBOK 7th Ed and the EVM Analysis skill formula set.

INPUTS available in project context:
- budget = BAC (Budget at Completion)
- startDate / endDate = planned duration
- costEntries = array of {date, amount, category} — these are the actual costs (AC) logged per date
- milestones = planned milestone dates for schedule context

COMPUTATION RULES (mandatory — follow exactly):
1. Group costEntries by calendar month to form per-period AC values.
2. PV per period = BAC × (elapsed months / total planned months). Use linear interpolation; note if plan appears non-linear.
3. EV per period = BAC × estimated % complete. Derive % complete from milestones achieved vs total, or from cost-to-date ratio relative to plan if no milestone data. State your derivation method.
4. For each period compute cumulative: PV, EV, AC, SV (EV-PV), CV (EV-AC), SPI (EV/PV), CPI (EV/AC), SV%, CV%.
5. Use CUMULATIVE CPI of the latest period for forecasts — never average period CPIs.
6. Forecasts (latest period): EAC = BAC/CPI, ETC = EAC-AC, SAC = planned_months/SPI, VAC_cost = BAC-EAC, VAC_schedule = planned_months-SAC, TCPI = (BAC-EV)/(BAC-AC).
7. RAG: Green = CPI≥0.95 AND SPI≥0.95; Amber = either index 0.85–0.95; Red = either index <0.85 OR TCPI>1.10.
8. Sanity-check: sign of SV must agree with SPI vs 1; sign of CV must agree with CPI vs 1; EAC>BAC iff CPI<1.

Return JSON:
- projectName (string)
- analysisDate (string): ISO date of analysis (today)
- bac (number): Budget at Completion
- plannedDurationMonths (number)
- currency (string)
- derivationMethod (string): explain how EV % complete was derived
- periods (array of {
    period (string): "YYYY-MM",
    periodLabel (string): "Month N — Mon YYYY",
    pv (number), ev (number), ac (number),
    sv (number), cv (number),
    spi (number), cpi (number),
    svPct (number), cvPct (number),
    cumPv (number), cumEv (number), cumAc (number),
    cumSv (number), cumCv (number),
    cumSpi (number), cumCpi (number)
  })
- forecast (object): {
    eac (number), etc (number), sac (number),
    vacCost (number), vacSchedule (number), tcpi (number),
    projectedEndDate (string): ISO date derived from SAC,
    ragStatus (string): "Green" | "Amber" | "Red"
  }
- verdict (object): {
    costHealth (string): plain-language cost status — over/on/under budget, % and absolute variance, projected overrun at completion,
    scheduleHealth (string): plain-language schedule status — behind/on/ahead, projected finish vs planned,
    recoveryOutlook (string): TCPI interpretation — is recovery realistic? If TCPI>1.10 say so explicitly,
    recommendedActions (array of string): 2-4 concrete PM actions
  }
- interpretationTable (array of {metric, formula, value, interpretation}): one row each for SV, CV, SPI, CPI, EAC, ETC, SAC, VAC cost, VAC schedule, TCPI`,

    traceability_matrix: `Generate a Requirements Traceability Matrix (RTM) per PMBOK 6th Ed Process 5.5 (Validate Scope) and IEEE 830.
CRITICAL: Every requirement MUST be sourced ONLY from the requirements document provided below. Do NOT invent requirements.
Map each requirement forward to: WBS/deliverable → schedule milestone → acceptance criteria → test/validation approach.

Return JSON with:
- projectName (string)
- documentVersion (string): "1.0"
- preparedDate (string): ISO date
- summary (object): {
    totalRequirements (number),
    functional (number),
    nonFunctional (number),
    businessRules (number),
    fullyTraced (number),
    partiallyTraced (number),
    notTraced (number)
  }
- requirements (array of {
    id (string): REQ-001, REQ-002… — sequential
    category (string): Functional | Non-Functional | Business Rule | Constraint | Interface | Security | Performance | Compliance
    source (string): exact section/page reference from the requirements document (e.g. "Section 3.2", "Page 5")
    requirementStatement (string): verbatim or faithfully paraphrased requirement from the source doc — NEVER fabricated
    priority (string): Must Have | Should Have | Could Have | Won't Have (MoSCoW)
    complexity (string): Low | Medium | High
    wbsRef (string): mapped WBS code or deliverable name from project context (e.g. "1.2.3 Authentication Module")
    milestone (string): linked milestone name from project context
    deliverable (string): specific deliverable this requirement maps to
    acceptanceCriteria (string): measurable, testable criterion — how the PM/customer will verify this is met
    validationMethod (string): Inspection | Testing | Demonstration | Analysis | Review
    owner (string): team or role responsible for implementing this requirement
    status (string): Not Started | In Progress | Implemented | Verified | Accepted
    traceabilityStatus (string): Fully Traced | Partially Traced | Not Traced
    notes (string): gaps, risks, or dependencies related to this requirement
  })
- traceabilityGaps (array of {
    gapId (string): GAP-001…
    description (string): what is missing or not covered
    impact (string): High | Medium | Low
    recommendation (string): what should be done to close the gap
  })
- changeHistory (array of {
    version (string),
    date (string),
    changedBy (string),
    description (string)
  })`,

    action_log: `Generate an Action Log for project execution tracking per PMBOK 6th Ed 4.3 (Direct and Manage Project Work).
Return JSON with:
- actions (array of {
    id (string): ACT001…
    description (string): clear action statement
    category (string): Decision | Risk | Issue | Dependency | Technical | Process | Stakeholder
    priority (string): Critical | High | Medium | Low
    owner (string): single named owner
    raisedBy (string)
    dateRaised (string)
    dueDate (string)
    completedDate (string | null)
    status (string): Open | In Progress | Blocked | Complete | Cancelled
    relatedArtifact (string): e.g. "Risk R003", "Issue I007"
    notes (string)
  })`,

    issue_register: `Generate an Issue Register per PMBOK 6th Ed 4.5 (Monitor and Control Project Work).
Return JSON with:
- issues (array of {
    id (string): ISS001…
    title (string)
    description (string)
    category (string): Scope | Schedule | Cost | Quality | Resource | Technical | Vendor | Stakeholder
    severity (string): Critical | High | Medium | Low
    impact (string): business impact if not resolved
    rootCause (string)
    raisedBy (string)
    dateRaised (string)
    owner (string): single named owner accountable for resolution
    resolutionPlan (string): specific steps to resolve
    targetResolutionDate (string)
    actualResolutionDate (string | null)
    escalationPath (string): who to escalate to if unresolved
    status (string): Open | In Progress | Escalated | Resolved | Closed
    resolution (string | null): how it was resolved
    lessonsLearned (string | null)
  })`,

    decision_log: `Generate a Decision Log per PMBOK 6th Ed 4.4 (Manage Project Knowledge) and 4.5 (Monitor and Control).
Return JSON with:
- decisions (array of {
    id (string): DEC001…
    title (string)
    description (string): what was decided
    category (string): Technical | Commercial | Resource | Scope | Risk | Process | Vendor
    context (string): what triggered this decision
    alternativesConsidered (array of {option, pros, cons})
    decisionMade (string): the chosen option
    rationale (string): why this option was chosen
    decidedBy (string): person or body that made the decision
    dateDecided (string)
    impactOnBaselines (object): {scope (string), schedule (string), cost (string), risk (string)}
    owner (string): responsible for implementing
    implementationDeadline (string)
    reviewDate (string | null)
    status (string): Pending | Approved | Implemented | Superseded
    notes (string)
  })`,

    // ── MONITORING & CONTROLLING ───────────────────────────────────────────────

    weekly_status: `Generate a Weekly Status Report per PMBOK 6th Ed Processes 4.5 (Monitor and Control Project Work) and 10.2 (Manage Communications).
Apply EVM principles where data is available.
Return JSON with:
- reportingPeriod (string): e.g. "Week of 07 Jul 2026"
- reportDate (string)
- preparedBy (string)
- overallStatus (string): green | amber | red
- ragScorecard (object): {
    schedule (object): {status (string): green|amber|red, reason (string)}
    cost (object): {status (string): green|amber|red, reason (string)}
    scope (object): {status (string): green|amber|red, reason (string)}
    quality (object): {status (string): green|amber|red, reason (string)}
    risk (object): {status (string): green|amber|red, reason (string)}
  }
- executiveSummary (string): 3–4 sentences, lead with overall health then the key signal
- accomplishments (array of strings): 3–5 completed items this period
- plannedActivities (array of strings): 3–5 planned for next period
- milestoneStatus (array of {name, plannedDate, forecastDate, status (On Track|At Risk|Slipped|Complete)})
- risks (array of {id, description, status, action}): top 3 active risks
- issues (array of {id, description, owner, targetDate, status})
- financialStatus (object): {budgetToDate (string), actualSpend (string), variance (string), cpi (string), spi (string), forecastAtCompletion (string)}
- resourceStatus (string): team availability and any resource constraints
- decisions (array of strings): decisions made or needed from leadership
- nextPeriodDependencies (array of strings): what is needed to proceed`,

    monthly_status: `Generate a Monthly Status Report per PMBOK 6th Ed 4.5 (Monitor and Control) and 10.2 (Manage Communications).
Include EVM metrics and benefits tracking.
Return JSON with:
- reportingPeriod (string): e.g. "July 2026"
- reportDate (string)
- preparedBy (string)
- overallStatus (string): green | amber | red
- ragScorecard (object): {
    schedule (object): {status, reason}
    cost (object): {status, reason}
    scope (object): {status, reason}
    quality (object): {status, reason}
    risk (object): {status, reason}
    benefits (object): {status, reason}
  }
- executiveSummary (string): concise executive narrative
- keyAchievements (array of strings): top 3–5 achievements this month
- kpis (object): {
    spi (string): Schedule Performance Index
    cpi (string): Cost Performance Index
    budgetSpent (string)
    budgetRemaining (string)
    forecastAtCompletion (string): EAC
    varianceAtCompletion (string): VAC
    percentComplete (string)
    teamUtilisation (string)
    openRisks (number)
    openIssues (number)
  }
- milestoneStatus (array of {name, plannedDate, forecastDate, status})
- risks (array of {id, description, impact, probability, strategy, status})
- issues (array of {id, description, severity, owner, targetDate, status})
- nextMonthPlan (array of strings): planned activities
- benefitsStatus (array of {benefit, target, currentStatus}): benefits realization tracking
- decisions (array of strings): decisions made this period
- escalations (array of strings): items requiring leadership intervention
- changeRequests (array of {id, description, status})`,

    change_log: `Generate a Change Control Register per PMBOK 6th Ed Process 4.6 (Perform Integrated Change Control).
A change must never touch a baseline without an approved CR.
Return JSON with:
- projectName (string)
- ccbMembers (array of {name, role, approvalThreshold (string)})
- approvalThresholds (object): {pmAuthority (string), sponsorAuthority (string), ccbAuthority (string)}
- changeRequests (array of {
    id (string): CR001…
    dateRaised (string)
    requestedBy (string)
    category (string): Scope | Schedule | Cost | Quality | Resource | Technical | Regulatory | Contract
    title (string)
    description (string)
    justification (string)
    impactAnalysis (object): {
      scopeDelta (string)
      scheduleDelta (string): e.g. "+5 days"
      costDelta (string): e.g. "+$15,000"
      qualityImpact (string)
      riskImpact (string)
      resourceImpact (string)
    }
    priority (string): Critical | High | Medium | Low
    ccbDecision (string): Approved | Rejected | Deferred | Under Review
    decisionDate (string)
    decisionRationale (string)
    owner (string)
    implementationDeadline (string)
    baselineUpdated (boolean)
    status (string): Submitted | Under Review | Approved | Rejected | Deferred | Implemented | Closed
    notes (string)
  })`,

    // ── CLOSING ───────────────────────────────────────────────────────────────

    lessons_learned: `Generate a Lessons Learned Register per PMBOK 6th Ed Process 4.7 (Close Project or Phase) and 4.4 (Manage Project Knowledge).
Return JSON with:
- projectName (string)
- facilitatedBy (string)
- date (string)
- lessons (array of {
    id (string): LL001…
    category (string): Scope | Schedule | Cost | Quality | Risk | Team | Process | Vendor | Stakeholder | Technology
    phase (string): which project phase this lesson applies to
    situation (string): what happened — factual context
    whatWorked (string | null): positive lesson
    whatToImprove (string | null): improvement lesson
    rootCause (string): why did this happen
    impact (string): effect on project objectives
    recommendation (string): specific, actionable recommendation — not vague "communicate better"
    reusableAsset (string): template, process, or checklist that should be created/updated
    adoptionOwner (string): who will implement the recommendation
    targetDate (string)
    applicableProjectTypes (array of strings)
  })
- overallSummary (object): {topSuccesses (array of strings), topImprovements (array of strings), processRecommendations (array of strings)}`,

    dependencies_register: `Generate a Dependencies Register per PMBOK 6th Ed best practices.
Track all project dependencies — internal deliverables, external third parties, technical integrations, and commercial obligations.
Return JSON with:
- dependencies (array of {
    id (string): e.g. DEP-001
    description (string): what this project depends on
    type (string): internal | external | technical | commercial
    dependentOn (string): name of team, system, or party
    owner (string): who manages this dependency
    expectedDate (string): YYYY-MM-DD or milestone name
    status (string): open | resolved | at-risk
    impact (string): what is blocked if this is not met
    mitigationAction (string): fallback or contingency
  })`,

    quarterly_business_review: `Generate a Quarterly Business Review (QBR) presentation per PMBOK and delivery governance best practices.
This is a structured executive review delivered to the client each quarter.
Return JSON with:
- quarter (string): e.g. Q3 2025
- projectName (string)
- executiveSummary (string): one-paragraph health narrative
- ragStatus (string): Green | Amber | Red
- milestoneReview (array of {milestone, planned (date), forecast (date), status (On Track|At Risk|Delayed|Complete)})
- budgetSummary (object): {budget, actualToDate, forecastAtCompletion, variance, variancePercent}
- schedulePerformance (object): {spi, cumulativeSpi, trend (Improving|Stable|Declining), commentary}
- costPerformance (object): {cpi, cumulativeCpi, trend, commentary}
- keyRisks (array of {id, description, severity, owner, mitigation})
- keyIssues (array of {id, description, severity, owner, resolutionPlan})
- decisions (array of {description, owner, dueDate})
- nextQuarterPlan (array of {milestone, targetDate, owner})
- clientActions (array of {action, owner, dueDate})
- closingNotes (string)`,

    closure_report: `Generate a Project Closure Report per PMBOK 6th Ed Process 4.7 (Close Project or Phase).
Confirm benefits against the business case, not just on-time/on-budget.
Return JSON with:
- projectName (string)
- projectCode (string)
- sponsor (string)
- pm (string)
- closureDate (string)
- executiveSummary (string): outcome vs. objectives in one paragraph
- objectivesScorecard (array of {
    objective (string)
    target (string)
    actual (string)
    verdict (string): Met | Partially Met | Not Met
    evidence (string)
  })
- budgetPerformance (object): {
    bac (string): Budget at Completion — original approved budget
    actualCost (string)
    variance (string)
    variancePercent (string)
    cpi (string)
    explanation (string)
  }
- schedulePerformance (object): {
    plannedEndDate (string)
    actualEndDate (string)
    variance (string)
    spi (string)
    explanation (string)
  }
- deliverables (array of {name, status (Delivered|Partial|Not Delivered), acceptedBy, acceptanceDate, notes})
- benefitsRealized (array of {benefit, target, actual, status (Realized|Partial|Not Realized), notes})
- openItems (array of {description, owner, targetDate, type (Risk|Action|Warranty|Transition)})
- teamRecognition (array of strings): acknowledgements
- transitionToOps (object): {handoverTo (string), handoverDate (string), supportPeriod (string), notes (string)}
- closureSignatures (array of {role, name, date})`,
  };

  const schema = templates[artifactType]
    ?? `Generate a ${artifactType.replace(/_/g, " ")} artifact aligned to PMBOK best practices. Return structured JSON.`;

  const evidenceBlock = evidenceContext?.hasEvidence
    ? formatEvidenceForPrompt(evidenceContext)
    : "";

  const dynamicContext = `Project Context:\n${JSON.stringify(projectContext, null, 2)}\n\n${evidenceBlock}${requirements && !evidenceContext?.hasEvidence ? `Requirements / Source Document Content:\n${requirements}\n\n` : ""}`;

  // When a client template is active, its instructions lead the prompt so Claude
  // applies them before locking in the schema's default field list.
  const taskBlock = templateOverride?.userAddendum
    ? `Task: Generate a ${artifactType.replace(/_/g, " ")} for this project.

MANDATORY CLIENT-SPECIFIC REQUIREMENTS (apply these first — they override defaults):
${templateOverride.userAddendum}

Output format — produce a JSON object conforming to this schema:
${schema}

Return the artifact as valid JSON wrapped in \`\`\`json ... \`\`\` code blocks.`
    : `Task: ${schema}\n\nReturn the artifact as valid JSON wrapped in \`\`\`json ... \`\`\` code blocks.`;

  return [
    { text: taskBlock },
    { text: dynamicContext },
  ];
}

// ---------------------------------------------------------------------------
// Domain Intelligence — Phase 2: Dynamic domain agent (Haiku pre-flight)
// ---------------------------------------------------------------------------

const DOMAIN_AGENT_PROMPT = `You are a domain expert advisor for a project management AI system.
Given a project's industry, customer, and description, produce a concise
domain-context block (200–300 words) that the artifact-generating AI should know.
Cover:
1. Applicable regulatory frameworks and standards for this specific context
2. Mandatory workstreams or phases that PMBOK artifacts must include
3. Standard resource roles for this domain and customer type
4. Top 5 risk patterns commonly seen in this domain
5. Any scheduling constraints or blackout windows

Be specific to the customer type and project description — a private clinic
differs from an NHS Trust even in the same industry.
Return ONLY the domain context block. No preamble, no meta-commentary.`;

export async function generateDomainContext(
  industry: string,
  description: string,
  customer: string | null | undefined,
): Promise<string> {
  try {
    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      system: DOMAIN_AGENT_PROMPT,
      messages: [{
        role: "user",
        content: `Industry: ${industry}\nCustomer: ${customer ?? "not specified"}\nProject description: ${description?.slice(0, 800) ?? "not provided"}`,
      }],
    });
    const text = msg.content.find(b => b.type === "text");
    return (text as { type: "text"; text: string } | undefined)?.text ?? "";
  } catch (err) {
    console.warn("[domain-agent] context generation failed:", err);
    return "";
  }
}
