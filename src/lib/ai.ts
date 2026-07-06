import Anthropic from "@anthropic-ai/sdk";

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

function extractJson(text: string): Record<string, unknown> {
  // Try ```json ... ``` block first
  const fenced = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (fenced) return JSON.parse(fenced[1]);

  // Find the outermost { ... } by tracking brace depth
  let depth = 0, start = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "{") { if (depth++ === 0) start = i; }
    else if (text[i] === "}") { if (--depth === 0 && start !== -1) return JSON.parse(text.slice(start, i + 1)); }
  }
  throw new Error("AI did not return valid JSON");
}

export async function generateArtifact(
  artifactType: string,
  projectContext: Record<string, unknown>,
  requirements?: string
): Promise<Record<string, unknown>> {
  const systemPrompt = `You are a PMO AI assistant. Generate concise, PMBOK-aligned project management artifacts.
Return ONLY valid JSON — no prose, no markdown outside the JSON block.
Be concise: arrays should have 3-5 items max unless the schema requires more.
Base output strictly on the provided project context — do not fabricate figures.`;

  const prompt = buildArtifactPrompt(artifactType, projectContext, requirements);

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: "user", content: prompt }],
  });

  const content = message.content[0];
  if (content.type !== "text") throw new Error("Unexpected AI response type");

  return extractJson(content.text);
}

export async function generateProjectFromNL(description: string): Promise<Record<string, unknown>> {
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    system: `You are a PMO AI. Extract structured project fields from a natural language description.
Return JSON with: name, customer, projectType, methodology, industry, projectSize, budget, currency,
deliveryModel, teamSize, startDate (ISO), endDate (ISO), description, clarifyingQuestions (array of strings if needed).`,
    messages: [
      {
        role: "user",
        content: `Extract project fields from this description:\n\n${description}\n\nReturn JSON only.`,
      },
    ],
  });

  const content = message.content[0];
  if (content.type !== "text") throw new Error("Unexpected response");

  return extractJson(content.text);
}

export async function generateStatusSummary(
  rawInput: Record<string, unknown>,
  projectContext: Record<string, unknown>
): Promise<{ summary: string; ragStatus: string; healthScore: number; recommendations: string[] }> {
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: `You are a PMO AI. Generate an executive status summary from the PM's raw status inputs.
Do not introduce figures not present in the inputs.
Return JSON with: summary (string), ragStatus (green/amber/red), healthScore (0-100), recommendations (array of strings).`,
    messages: [
      {
        role: "user",
        content: `Project: ${JSON.stringify(projectContext, null, 2)}\n\nStatus inputs: ${JSON.stringify(rawInput, null, 2)}\n\nGenerate executive summary. Return JSON only.`,
      },
    ],
  });

  const content = message.content[0];
  if (content.type !== "text") throw new Error("Unexpected response");

  return extractJson(content.text) as unknown as { summary: string; ragStatus: string; healthScore: number; recommendations: string[] };
}

export async function extractRequirements(text: string): Promise<Record<string, unknown>> {
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    system: `You are a PMO AI. Extract structured project requirements from documents.
Return JSON with: goals (array), scopeItems (array), stakeholders (array of {name, role}),
constraints (array), assumptions (array), timeline (string), budgetSignals (string), confidence (0-1).`,
    messages: [
      {
        role: "user",
        content: `Extract requirements from this document:\n\n${text.slice(0, 8000)}\n\nReturn JSON only.`,
      },
    ],
  });

  const content = message.content[0];
  if (content.type !== "text") throw new Error("Unexpected response");

  return extractJson(content.text);
}

export async function chatCommand(
  command: string,
  context: Record<string, unknown>
): Promise<string> {
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: `You are a PMO AI copilot. Help the user with project management tasks.
You have access to the current project context. Respond concisely and helpfully.
For document generation requests, say you'll generate it and provide a brief preview.`,
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

function buildArtifactPrompt(
  artifactType: string,
  projectContext: Record<string, unknown>,
  requirements?: string
): string {
  const templates: Record<string, string> = {
    project_charter: `Generate a Project Charter with: projectTitle, projectCode, projectDescription,
objectives (array), scope (inScope array, outOfScope array), deliverables (array),
stakeholders (array of {name, role, interest}), budget, timeline, risks (array),
assumptions (array), constraints (array), approvalSignatures (array of {role}).`,

    risk_register: `Generate a Risk Register with: risks (array of {id, description, category,
probability, impact, riskScore, mitigation, owner, status, dueDate}).`,

    raid_register: `Generate a RAID Register with: risks (array), assumptions (array of {id, description, owner, status}),
issues (array of {id, description, severity, owner, resolution, status}),
dependencies (array of {id, description, dependsOn, owner, status}).`,

    wbs: `Generate a Work Breakdown Structure with: projectName, phases (array of {name, deliverables
(array of {id, name, workPackages (array of {id, name, estimatedDays, owner})})}).`,

    stakeholder_register: `Generate a Stakeholder Register with: stakeholders (array of {id, name,
organization, role, interest, influence, engagementLevel, communicationPlan, notes}).`,

    communication_plan: `Generate a Communication Plan with: communicationItems (array of {type,
audience, frequency, channel, owner, format, notes}).`,

    milestone_plan: `Generate a Milestone Plan with: milestones (array of {id, name, description,
dueDate, deliverables (array), owner, status, dependencies (array)}).`,

    raci_matrix: `Generate a RACI Matrix with: activities (array of {activity, roles (object where
keys are role names and values are R/A/C/I/-)}).`,

    weekly_status: `Generate a Weekly Status Report template with: reportingPeriod, overallStatus (RAG),
executiveSummary, accomplishments (array), plannedActivities (array), risks (array of {description, status}),
issues (array of {description, status}), milestoneStatus (array), financialStatus, resourceStatus, decisions (array).`,
  };

  const schema = templates[artifactType] || `Generate a ${artifactType.replace(/_/g, " ")} artifact in structured JSON format.`;

  return `Project Context:
${JSON.stringify(projectContext, null, 2)}

${requirements ? `Requirements:\n${requirements}\n\n` : ""}

${schema}

Return the artifact as valid JSON wrapped in \`\`\`json ... \`\`\` code blocks.`;
}
