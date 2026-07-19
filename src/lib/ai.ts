import Anthropic from "@anthropic-ai/sdk";
import { GUARDRAIL_SYSTEM_ADDENDUM } from "@/lib/guardrails";

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

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

// Guards every JSON-producing AI call against silent truncation: if the model
// hit its token ceiling the JSON is incomplete, so fail loudly instead of
// persisting a half-parsed document.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseAIJson(message: any, label: string): Record<string, unknown> {
  const content = message.content[0];
  if (!content || content.type !== "text") throw new Error("Unexpected AI response type");
  if (message.stop_reason === "max_tokens") {
    throw new Error(`AI response for "${label}" was truncated (hit token limit). Try a smaller input.`);
  }
  return extractJson(content.text);
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
  traceability_matrix:   "requirements (array of {id, description, source, wbsRef, milestone, deliverable, acceptanceCriteria, validationMethod, owner, status})",
};

export async function generateArtifact(
  artifactType: string,
  projectContext: Record<string, unknown>,
  requirements?: string
): Promise<Record<string, unknown>> {
  const prompt = buildArtifactPrompt(artifactType, projectContext, requirements);

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 16000,
    system: PMI_SYSTEM_PROMPT,
    messages: [{ role: "user", content: prompt }],
  });

  return parseAIJson(message, `artifact:${artifactType}`);
}

export async function generateProjectFromNL(description: string): Promise<Record<string, unknown>> {
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8000,
    system: `You are a senior PMO AI. Extract structured project fields from a natural language description or requirements document.
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
- clarifyingQuestions (array of strings): questions if critical info is missing`,
    messages: [
      {
        role: "user",
        content: `Extract project fields from this description:\n\n${description}\n\nReturn JSON only.`,
      },
    ],
  });

  return parseAIJson(message, "project-from-document");
}

export interface StatusQuestion {
  id: number;
  category: string;
  question: string;
  type: "chips" | "multi-chips" | "number" | "select";
  suggestedAnswers: string[];   // 3–6 pre-populated, context-aware options
  allowCustom: boolean;         // whether PM can type a custom answer
  required: boolean;
  placeholder?: string;
  unit?: string;                // for number type, e.g. "%", "days"
}

export async function generateStatusQuestions(
  projectContext: Record<string, unknown>
): Promise<StatusQuestion[]> {
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 6000,
    system: `You are a senior PMO AI conducting a weekly project health check for a Project Manager.
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
- Return JSON: { "questions": [ { "id": 1, "category": "...", "question": "...", "type": "chips|multi-chips|select|number", "suggestedAnswers": ["...", "..."], "allowCustom": true|false, "required": true, "placeholder": "..." } ] }`,
    messages: [
      {
        role: "user",
        content: `Generate 10 weekly status questions for this project:\n\n${JSON.stringify(projectContext, null, 2)}\n\nReturn JSON only.`,
      },
    ],
  });

  const result = parseAIJson(message, "status-questions") as any;
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

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 6000,
    system: `You are a PMO AI. Generate a structured Weekly Status Report from the PM's Q&A responses.
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
- spi (number | null): use the live SPI value if provided, else derive from PM answers, else null`,
    messages: [
      {
        role: "user",
        content: `Project context:\n${JSON.stringify(projectContext, null, 2)}${evmSection}\n\nPM Q&A responses:\n${JSON.stringify(rawInput, null, 2)}\n\nGenerate the Weekly Status Report. Return JSON only.`,
      },
    ],
  });

  return parseAIJson(message, "status-summary") as unknown as { summary: string; ragStatus: string; healthScore: number; recommendations: string[]; accomplishments: string[]; nextWeekPlan: string[]; metricsNarrative: string; cpi: number | null; spi: number | null };
}

export async function generateScheduleRecovery(
  projectContext: Record<string, unknown>,
  evm: { pv: number; ev: number; sv: number; spi: number; overdueTasks: number; overdueTaskNames: string[] },
  tasks: { name: string; phase: string; percentComplete: number; baselineDays: number; status: string }[]
): Promise<{ headline: string; steps: { title: string; action: string; effort: string; impact: string }[]; estimatedRecovery: string }> {
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4000,
    system: `You are a PMO recovery specialist. A project is behind schedule (SPI < 0.8) and the PM needs a concrete recovery plan.
Apply PMBOK schedule compression techniques: fast-tracking, crashing, scope reduction, resource reallocation.
Return JSON with:
- headline (string): 1-sentence diagnosis of the delay root cause based on the data
- steps (array of 4–6 objects): each has title (short action name), action (specific what-to-do in 2 sentences), effort ("Low"|"Medium"|"High"), impact ("Low"|"Medium"|"High")
- estimatedRecovery (string): realistic estimate of how many days/weeks recovery will take if steps are followed`,
    messages: [
      {
        role: "user",
        content: `Project: ${JSON.stringify(projectContext)}\n\nEVM metrics: SPI=${evm.spi}, SV=${evm.sv} task-days, PV=${evm.pv}, EV=${evm.ev}, Overdue tasks: ${evm.overdueTasks} (${evm.overdueTaskNames.join(", ")})\n\nTask breakdown (top 10): ${JSON.stringify(tasks.slice(0, 10))}\n\nGenerate recovery plan JSON only.`,
      },
    ],
  });

  return parseAIJson(message, "schedule-recovery") as unknown as { headline: string; steps: { title: string; action: string; effort: string; impact: string }[]; estimatedRecovery: string };
}

export async function extractRequirements(text: string): Promise<Record<string, unknown>> {
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8000,
    system: `You are a PMO AI. Extract structured project requirements from documents per PMBOK 5.2 (Collect Requirements).
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
- confidence (number 0-1): confidence in extraction quality`,
    messages: [
      {
        role: "user",
        content: `Extract requirements from this document:\n\n${text.slice(0, 12000)}\n\nReturn JSON only.`,
      },
    ],
  });

  return parseAIJson(message, "requirements-extraction");
}

export async function chatCommand(
  command: string,
  context: Record<string, unknown>
): Promise<string> {
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: `You are a senior PMO AI copilot with PMBOK 6th/7th edition expertise.
Help the user with project management tasks, artifact generation, and PMI best practices.
You have access to the current project context. Respond concisely and helpfully.
Reference PMBOK processes, knowledge areas, and principles where relevant.`,
    messages: [
      {
        role: "user",
        content: `Context: ${JSON.stringify(context, null, 2)}\n\nUser command: ${command}`,
      },
    ],
  });

  const content = message.content[0];
  if (content.type !== "text") throw new Error("Unexpected response");
  return content.text;
}

export async function askPortfolio(
  question: string,
  context: Record<string, unknown>,
  role: string
): Promise<string> {
  const roleGuidance: Record<string, string> = {
    pm: "The user is a Project Manager. Focus answers on their own projects: schedule/budget risk, next actions, drafting artifacts or stakeholder communications on their behalf.",
    delivery_manager: "The user is a Delivery Manager overseeing a portfolio. Focus on cross-project patterns, resource allocation and utilization, at-risk projects needing intervention, and portfolio-level recommendations.",
    delivery_head: "The user is a Delivery/Practice Head (executive). Be concise and numbers-first. Lead with the bottom line (cost, risk, delivery health), flag anything needing executive decision, and quantify impact in dollars where possible.",
    admin: "The user is an org administrator with full visibility. Answer with portfolio-wide context, calling out governance or process gaps where relevant.",
  };

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1200,
    system: `You are the PM Agent portfolio copilot — a senior PMO AI with PMBOK 6th/7th edition expertise, embedded across a portfolio delivery platform.
${roleGuidance[role] ?? roleGuidance.pm}
You have access to live portfolio data (projects, health, budget, risks, issues, milestones) provided as context below.
Answer directly and concisely using only the data provided — never fabricate figures, names, or dates not present in context.
If asked to draft something (an email, a message, a summary), produce it ready to send/use.
If the answer requires data not present in context, say what's missing rather than guessing.
Use markdown formatting (bold, bullet lists) sparingly for readability in a chat UI.`,
    messages: [
      {
        role: "user",
        content: `Portfolio context:\n${JSON.stringify(context, null, 2)}\n\nQuestion: ${question}`,
      },
    ],
  });

  const content = message.content[0];
  if (content.type !== "text") throw new Error("Unexpected response");
  return content.text;
}

function buildArtifactPrompt(
  artifactType: string,
  projectContext: Record<string, unknown>,
  requirements?: string
): string {
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

    initiation_deck: `Generate a Project Initiation Deck for CXO stakeholder presentation per PMBOK 6th Ed 4.1 and pmi-charter best practices.
Return JSON with:
- projectTitle (string)
- projectDescription (string)
- date (string)
- sponsor (string)
- objectives (array of strings): 3–5 SMART objectives
- scope (object): {inScope (array of strings), outOfScope (array of strings)}
- deliverables (array of strings)
- milestones (array of {name, targetDate}): key milestones
- stakeholders (array of {name, role, interest})
- budget (string): order-of-magnitude budget with currency
- timeline (string): start to end date range
- risks (array of strings): top 5 risks only
- assumptions (array of strings)
- constraints (array of strings)
- governance (object): {sponsor (string), pm (string), steeringCommittee (string), reportingCadence (string)}
- approvalSignatures (array of {role})
- nextSteps (array of strings): immediate actions post-approval`,

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

    wbs: `Generate a Work Breakdown Structure following *Secrets to Mastering the WBS* (Buchtik, PMI) and PMBOK 6th Ed Process 5.4.

## NON-NEGOTIABLE RULES
1. DELIVERABLE-ORIENTED ONLY. Every component must be a noun/noun-phrase outcome (e.g. "Requirements Document", "Test Report", "Trained Users"). NEVER use verbs or activities ("Write requirements", "Design UI"). If a verb creeps in, convert it to the deliverable it produces.
2. 100% RULE AT EVERY LEVEL. Each parent = exactly the sum of its children — no missing work, no overlap. Verify and record the check at every parent level.
3. MANDATORY PROJECT MANAGEMENT BRANCH. Include "Project Management" as a Level-2 LoE component. Decompose it into at least: Project Charter, Project Management Plan, Project Schedule, Risk Register, Status Reports, Lessons Learned — scaled to project size.
4. COMPONENT TYPING. Mark every component "Discrete" (tangible, measurable deliverable) or "LoE" (Level of Effort — support work without a definitive end product). Project Management is LoE; its decomposed artifacts (charter, plan, register) become Discrete.
5. STOP DECOMPOSING when a component can be: assigned to one owner, estimated for cost and duration, has activities/milestones derivable from it, and can be monitored and controlled.
6. NO SCHEDULE CONTENT. No dependencies between phases, no dates, no sequencing logic. The WBS defines SCOPE only.
7. NOUN-BASED NAMING. No verbs, no gerunds. Consistent convention throughout.
8. STRUCTURING APPROACH. Choose: By Major Deliverables (default), By Project Phases, By Subprojects, By Geography, By Department, or Hybrid. State your choice and why.

## QUALITY AUDIT (16 CHECKS — score each Pass or Fail with evidence)
Score every check and include results in the qualityAudit array:
1. Deliverable oriented — components are nouns/adjectives, not tasks
2. Defines project scope — WBS + dictionary answers concrete scope questions
3. Clarifies and communicates the work — understandable to stakeholders
4. Contains 100% of the work — nothing in scope is missing
5. Captures ALL deliverables incl. project management — PM branch exists
6. 100% rule at every level — parent = exactly sum of children; no overlap
7. Work packages support task identification — concrete enough to derive activities
8. Graphical/textual/tabular breakdown provided — at least one clear representation
9. Noun-based naming — nouns and adjectives, consistent convention
10. Hierarchical structure — clear parent-child; each element has exactly one parent
11. Coding scheme on every component — unique WBS ID per component
12. At least two levels of decomposition — ≥3 for meaningful projects
13. Created by those performing the work — owners involved (flag if not)
14. Built with stakeholder and expert input — review planned or done
15. Evolves with progressive elaboration — rolling-wave placeholders for unknown work
16. Updated via change control after baseline — post-approval changes flagged

Return JSON with:
- projectName (string)
- wbsCode (string): "1"
- structuringApproach (string): chosen approach name
- approachRationale (string): one sentence why
- phases (array of Level-2 components, including the mandatory "Project Management" LoE branch):
  {
    id (string): "1.1", "1.2" …
    name (string): NOUN-BASED deliverable-oriented name
    componentType (string): "Discrete" | "LoE"
    100percentCheck (string): "1.x = [child names joined by +] ✓" — verify parent equals sum of children
    owner (string): team or role accountable
    deliverables (array of Level-3 components):
      {
        id (string): "1.1.1" …
        name (string): NOUN-BASED name
        componentType (string): "Discrete" | "LoE"
        100percentCheck (string): verification that this parent = sum of its work packages
        owner (string)
        workPackages (array of Level-4 work packages — the lowest manageable level):
          {
            id (string): "1.1.1.1" …
            name (string): NOUN-BASED specific deliverable name
            componentType (string): "Discrete"
            isWorkPackage (boolean): true
            description (string): what work is done / what this deliverable contains
            estimatedDays (number): realistic effort estimate
            owner (string): single responsible team/person
            acceptanceCriteria (string): measurable, testable criterion — how PM/customer verifies completion
            outOfScope (string): what this work package explicitly does NOT include
            dependencies (array of strings): IDs of predecessor work packages
          }
      }
  }
- scopeBaselineSummary (object):
  {
    totalComponents (number): total WBS elements including all levels
    totalWorkPackages (number)
    totalEstimatedDays (number)
    maxDepth (number): deepest level reached
    controlAccounts (array of strings): Level-2 branches that function as cost accounts
    structuringApproach (string)
    note (string): "Scope baseline = Scope Statement + WBS + WBS Dictionary. Changes after approval require formal change control."
  }
- qualityAudit (array of 16 objects):
  {
    check (number): 1–16
    description (string): check description
    result (string): "Pass" | "Fail" | "Partial"
    evidence (string): specific evidence from this WBS that supports the result
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

  return `Project Context:
${JSON.stringify(projectContext, null, 2)}

${requirements ? `Requirements / Source Document Content:\n${requirements}\n\n` : ""}

Task: ${schema}

Return the artifact as valid JSON wrapped in \`\`\`json ... \`\`\` code blocks.`;
}
