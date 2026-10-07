var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};

// ../../../../../../Desktop/Test/App/src/ai.js
var askJSON, aiAvailable, aiErrorMessage;
var init_ai = __esm({
  "../../../../../../Desktop/Test/App/src/ai.js"() {
    askJSON = async () => {
      throw new Error("Generation must be supplied by the host");
    };
    aiAvailable = () => false;
    aiErrorMessage = (e) => e?.message;
  }
});

// ../../../../../../Desktop/Test/App/src/source-priority.js
var SOURCE_PRIORITY = [
  { rank: 1, label: "Professor slides", short: "Professor PPT", weight: 1.6 },
  { rank: 2, label: "Objectives", short: "Course objectives", weight: 1.4 },
  { rank: 3, label: "Handout or in-class activity", short: "Professor handouts", weight: 1.3 },
  { rank: 4, label: "Assigned resource (Lecturio, Nova)", short: "Assigned readings", weight: 1.1 },
  { rank: 5, label: "Syllabus", short: "Syllabus", weight: 0.9 },
  { rank: 6, label: "Textbook or outside source", short: "Textbook / outside", weight: 0.8 }
];
var priorityOf = (rank) => SOURCE_PRIORITY.find((p) => p.rank === Number(rank)) || SOURCE_PRIORITY[0];
var priorityWeight = (rank) => priorityOf(rank).weight;
var AUTHORITY_NAMES = { 1: "Professor slides/PowerPoints", 2: "Lecture/session objectives", 3: "Professor handouts and in-class activities", 4: "Lecturio, Nova, and other assigned resources", 5: "Syllabus", 6: "Textbooks and other outside sources" };
var AUTHORITY_TEXT = `Source authority (when sources disagree, follow the higher one and flag the conflict; never correct the professor with outside knowledge):
${SOURCE_PRIORITY.map((p, i) => `${i + 1}. ${AUTHORITY_NAMES[p.rank]}`).join("\n")}`;

// ../../../../../../Desktop/Test/App/src/retrieve.js
var STOP = new Set("the and for with that this from which what when where into over under than then them they their there these those have has had are was were been being will would could should most more less very also such each other only both either neither about after before between during while because however following best likely patient year old presents shows following statement correct incorrect true false none all above below answer choice option question slide page".split(" "));
function terms(text) {
  const out = [];
  for (const w of String(text || "").toLowerCase().match(/[a-z][a-z0-9-]{2,}/g) || []) if (!STOP.has(w)) out.push(w);
  return out;
}
var MaterialIndex = class {
  constructor(sources, texts, chunkSize = 5e3) {
    this.chunks = [];
    const df = /* @__PURE__ */ new Map();
    for (const s of sources) {
      if (s.kind !== "material") continue;
      const t = texts.get(s.id) || "";
      for (let start = 0; start < t.length; start += chunkSize) {
        let end = Math.min(t.length, start + chunkSize);
        if (end < t.length) {
          const brk = t.lastIndexOf("\n\n", end);
          if (brk > start + chunkSize * 0.5) end = brk;
        }
        const text = t.slice(start, end);
        const tf = /* @__PURE__ */ new Map();
        for (const w of terms(text)) tf.set(w, (tf.get(w) || 0) + 1);
        for (const w of tf.keys()) df.set(w, (df.get(w) || 0) + 1);
        this.chunks.push({ sid: s.id, name: s.name, rank: s.rank || 1, lecture: s.lecture || "", start, text, tf });
        start = end - chunkSize;
      }
    }
    this.df = df;
    this.n = this.chunks.length;
  }
  // Returns [{name, rank, lecture, text}] grouped per file, within a character budget.
  search(query, budget = 3e4, { preferSids = [], onlySids = null } = {}) {
    if (!this.n) return [];
    const only = onlySids ? new Set(onlySids) : null;
    const q = [...new Set(terms(query))];
    const prefer = new Set(preferSids);
    const scored = this.chunks.map((c, i) => {
      if (only && !only.has(c.sid)) return { i, s: 0 };
      let s = 0;
      for (const w of q) {
        const f = c.tf.get(w);
        if (f) s += Math.log(1 + f) * Math.log(1 + this.n / (this.df.get(w) || 1));
      }
      if (prefer.has(c.sid)) s *= 1.3;
      s *= priorityWeight(c.rank);
      return { i, s };
    }).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
    const picked = [];
    let used = 0;
    for (const { i } of scored) {
      const c = this.chunks[i];
      if (used + c.text.length > budget) continue;
      picked.push(i);
      used += c.text.length;
      if (used > budget * 0.95) break;
    }
    picked.sort((a, b) => a - b);
    const groups = [];
    for (const i of picked) {
      const c = this.chunks[i];
      const g = groups[groups.length - 1];
      if (g && g.sid === c.sid) {
        g.text += "\n[...]\n" + c.text;
        g.ranges.push([c.start, c.start + c.text.length]);
      } else groups.push({ sid: c.sid, name: c.name, rank: c.rank, lecture: c.lecture, text: c.text, ranges: [[c.start, c.start + c.text.length]] });
    }
    return groups;
  }
};

// ../../../../../../Desktop/Test/App/src/exam-coverage.js
var UNTAGGED_OBJECTIVE = "__untagged__";
function matchesExamCoverage(m, q, selections) {
  if (selections == null) return true;
  const objective = q.objectiveId && m.objective(q.objectiveId) ? q.objectiveId : UNTAGGED_OBJECTIVE;
  return selections.some((group) => group.sourceIds.includes(q.sourceId) && (group.objectiveIds == null || group.objectiveIds.includes(objective)));
}

// ../../../../../../Desktop/Test/App/src/util.js
var DAY = 864e5;
var now = () => Date.now();
var LETTERS = "ABCDEFGHIJKL";
function rid(prefix = "") {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
var Emitter = class {
  constructor() {
    this._l = /* @__PURE__ */ new Set();
  }
  on(fn) {
    this._l.add(fn);
    return () => this._l.delete(fn);
  }
  emit() {
    for (const fn of [...this._l]) {
      try {
        fn();
      } catch (e) {
        console.error(e);
      }
    }
  }
};
var normKey = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
function conceptId(name) {
  const slug = normKey(name).replace(/ /g, "-").slice(0, 80);
  return "c-" + (slug || "untitled");
}
function shuffleArray(a) {
  const arr = a.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function lsGet(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : JSON.parse(v);
  } catch (e) {
    return fallback;
  }
}

// ../../../../../../Desktop/Test/App/src/store.js
var saveDoc = () => Promise.resolve();
var removeDoc = saveDoc;
var listDocs = async () => [];
var subPath = (id, s) => id + "/" + s;
var docPath = (id, s, q) => id + "/" + s + "/" + q;

// ../../../../../../Desktop/Test/App/src/srs.js
var RETAINED_DAYS = 21;
function newConcept(name, summary, extra = {}) {
  return {
    name,
    summary: summary || "",
    status: "new",
    interval: 0,
    ease: 2.6,
    due: 0,
    reps: 0,
    lapses: 0,
    attempts: 0,
    correct: 0,
    lastSeen: 0,
    createdAt: now(),
    sourceIds: [],
    prereqOf: [],
    ...extra
  };
}
function bucket(c) {
  if (!c || (c.attempts || 0) === 0) return "new";
  if (c.status === "learning") return "learning";
  if ((c.interval || 0) >= RETAINED_DAYS) return "retained";
  return "reviewing";
}
function isDue(c, at = now()) {
  if (!c || (c.attempts || 0) === 0) return false;
  if (c.status === "learning") return true;
  return c.status === "review" && (c.due || 0) <= at;
}
function applyWrong(c, at = now()) {
  c.attempts = (c.attempts || 0) + 1;
  c.lastSeen = at;
  c.lastWrongAt = at;
  if (c.status !== "learning") c.lapses = (c.lapses || 0) + (c.status === "review" ? 1 : 0);
  c.status = "learning";
  c.ease = Math.max(1.3, (c.ease || 2.6) - 0.2);
  c.interval = 0;
  c.due = at;
  c.retainedAt = null;
  return c;
}
function applyCorrect(c, at = now()) {
  c.attempts = (c.attempts || 0) + 1;
  c.correct = (c.correct || 0) + 1;
  c.lastSeen = at;
  if (c.status === "learning") {
    c.status = "review";
    c.interval = 1;
  } else if (c.status !== "review") {
    c.status = "review";
    c.interval = 3;
  } else if (at >= (c.due || 0) - DAY / 2) {
    const next = Math.round((c.interval || 1) * (c.ease || 2.6));
    c.interval = Math.max((c.interval || 1) + 1, next);
    c.ease = Math.min(3, (c.ease || 2.6) + 0.05);
    c.reps = (c.reps || 0) + 1;
  }
  c.due = at + c.interval * DAY;
  if (c.interval >= RETAINED_DAYS && !c.retainedAt) c.retainedAt = at;
  return c;
}
function summarize(concepts) {
  const counts = { new: 0, learning: 0, reviewing: 0, retained: 0 };
  const dueTimes = [];
  for (const c of concepts) {
    counts[bucket(c)]++;
    if (c.status === "review" && (c.attempts || 0) > 0) dueTimes.push(c.due || 0);
  }
  dueTimes.sort((a, b) => a - b);
  return { counts, dueTimes: dueTimes.slice(0, 2e3) };
}

// ../../../../../../Desktop/Test/App/server/study-skills/shared-grounding.mjs
var GROUNDING_VERSION = "1.0.0";
var AUTHORITY = SOURCE_PRIORITY.map((p, i) => ({ order: i + 1, rank: p.rank, label: p.label }));
var NON_TESTABLE = ["for your information only", "not tested", "optional", "no need to prepare for the exam"];
var NOT_IN_MATERIALS = "The provided materials do not explicitly state this.";
function groundingRules({ sourcesOnly = true } = {}) {
  return [
    sourcesOnly ? "Use only the course files provided. Do not add facts, terms, or answers from outside knowledge." : 'Prefer the course files. Outside knowledge is allowed only where the files are silent, and every such statement must be labelled "(outside the course files)".',
    "The professor writes the exams, so the professor's version of the material is what matters.",
    AUTHORITY_TEXT.replace(/\n/g, "\n  "),
    `Skip material the slides mark as non-testable (${NON_TESTABLE.map((s) => `"${s}"`).join(", ")}).`,
    `When the files do not support a point, say "${NOT_IN_MATERIALS}" instead of filling the gap.`,
    "Study signals (highlights, annotations, missed questions) change emphasis only. They never make a claim true and never outrank the authority order."
  ];
}
var rulesText = (rules, heading = "Source rules") => `${heading}:
${rules.map((r) => `- ${r}`).join("\n")}`;

// ../../../../../../Desktop/Test/App/server/study-skills/question-generation.mjs
var QUESTION_SKILL = { id: "question-generation", version: "1.0.0" };
var QUESTION_CORE_RULES = {
  scope: [
    "Objectives define scope; the professor's slides show emphasis. Slide topics outside the objective list still count. With no objectives, identify the testable course concepts."
  ],
  modes: [
    "Gap-fill mode when questions already exist: a concept counts as covered only if a question makes the student use its key learning point (a related word in a stem is not coverage). Rate Strong, Partial, Weak or Missing.",
    "From-scratch mode otherwise: blueprint across objectives weighted by testable content and professor emphasis; every objective gets at least one question; cover each concept once well before adding a second.",
    "A requested number is a maximum, not a quota. Stop early when coverage is reached; if more are needed, write the maximum on the highest-priority gaps and estimate how many more.",
    "Gap priority: no coverage, then partial, then objective-tied, professor-emphasized, mechanisms and sequences, comparisons, graph or data interpretation, clinical or experimental application.",
    "Never reword existing questions or add to strongly covered areas."
  ],
  style: [
    "Medical-school exam style with a mix of direct concept, application, mechanism, comparison, correct/incorrect statement, short experimental scenarios and graph or parameter interpretation.",
    "One clearly best answer (select-all only where the professor uses it).",
    "Distractors are plausible and drawn from the course material.",
    "Choices are similar in length and style with no grammatical clues; correct answers are spread across the letters and the correct choice is never noticeably the longest.",
    "Use no terms or facts that are not in the materials, and confirm each keyed answer against the source before finalizing.",
    "Match the professor's practice-question style first; with none, write board-style vignettes with five options.",
    "Test recall, understanding, application and relationships. Avoid trivial clones of an existing question."
  ],
  explanation: [
    "Every option gets a one-line note saying why it is right or wrong.",
    "Cite sources as [exact file name, slide N].",
    "When the materials do not support a point, name the gap instead of adding outside facts."
  ],
  transcription: [
    "Copy professor questions verbatim including typos (flag them); strip export artifacts; keep NOT/EXCEPT/select-all wording; write [Image not available] when an image is missing; count questions so none are dropped.",
    'Key from the course materials by the authority order; flag conflicts as "Conflict:"; when unsupported, leave the question unkeyed as "Not in course materials". Never guess.'
  ],
  final: [
    "Re-audit against every objective and the slides. Claim full coverage only when every testable concept is actually tested; otherwise recommend about how many more."
  ]
};

// ../../../../../../Desktop/Test/App/src/prompts.js
var rankLabel = (r) => priorityOf(r).label;
var SOURCE_RULES = rulesText(groundingRules(), "Source rules");
var WRITE_STYLE_RULES = [2, 3, 4, 6].map((i) => `- ${QUESTION_CORE_RULES.style[i]}`).join("\n");
var SKILL_VERSIONS = { question: QUESTION_SKILL.version, grounding: GROUNDING_VERSION };
var QUESTION_FIELDS = `"term": "2-5 word name of the concept tested (not 'Question 1', not the stem)", "stem": "...", "options": ["choice text without its letter label", ...], "multi": false, "answer": [<0-based index of the correct choice>], "definition": "<letter>. <correct answer text>. <one short clause on why, with the source as [exact file name, slide N], e.g. [Lecture 3 - Brachial Plexus.pptx, slide 17]>", "optionNotes": ["one short line per choice saying why it is right or wrong, citing [file name, slide N] when useful"], "conceptSummary": "one sentence stating the key fact"`;
function objectivesBlock(objectives, what = "question") {
  if (!objectives) return "";
  return `
Course objectives (id: text). Tag each ${what} with the id of the one objective it most directly tests, or "" if none fits:
${objectives}
`;
}
function formatMaterials(parts) {
  return parts.map((p) => `<file name="${esc(p.name)}" type="${rankLabel(p.rank)}"${p.lecture ? ` lecture="${esc(p.lecture)}"` : ""}>
${p.text}
</file>`).join("\n\n");
}
function esc(s) {
  return String(s || "").replace(/"/g, "'");
}
var fnorm = (x) => String(x || "").trim().toLowerCase();
function formatQuestion(q, { withAnswer = true, chosen = null } = {}) {
  const t = q.type || "mcq";
  const where = q.figure ? `${q.figure.file}, ${q.figure.unit || "page"} ${q.figure.page}` : "";
  if (t === "label") {
    const lines2 = [`Diagram labeling question on ${where || "a course figure"}: ${q.stem}`];
    (q.targets || []).forEach((x, i) => {
      const placed = chosen ? chosen[x.id] : null;
      lines2.push(`Box ${i + 1}: ${withAnswer ? x.answer : "?"}${chosen ? ` (student placed: ${placed || "nothing"}${placed && fnorm(placed) !== fnorm(x.answer) ? ", wrong" : ""})` : ""}`);
    });
    if (q.bank) lines2.push(`Label bank: ${q.bank.join("; ")}`);
    return lines2.join("\n");
  }
  if (t === "order") {
    const lines2 = [`Ordering question: ${q.stem}`];
    if (withAnswer) lines2.push(`Correct order: ${q.items.map((x, i) => `${i + 1}. ${x}`).join("; ")}`);
    else lines2.push(`Items: ${q.items.slice().sort().join("; ")}`);
    if (chosen) lines2.push(`Student's order: ${chosen.map((x, i) => `${i + 1}. ${x}`).join("; ")}`);
    return lines2.join("\n");
  }
  if (t === "match") {
    const lines2 = [`Matching question: ${q.stem}`];
    q.pairs.forEach((p, i) => lines2.push(`${p.left} -> ${withAnswer ? p.right : "?"}${chosen ? ` (student matched: ${chosen[i] || "nothing"})` : ""}`));
    if (q.extras && q.extras.length) lines2.push(`Extra choices that match nothing: ${q.extras.join("; ")}`);
    return lines2.join("\n");
  }
  const lines = [q.stem, ...q.options.map((o, i) => `${LETTERS[i]}. ${o}`)];
  if (q.figure) lines.unshift(`(The question shows the image from ${where}.)`);
  if (withAnswer) lines.push(`Correct: ${(q.answer || []).map((i) => `${LETTERS[i]}. ${q.options[i]}`).join("; ")}`);
  if (chosen && Array.isArray(chosen)) lines.push(`Student chose: ${chosen.map((i) => `${LETTERS[i]}. ${q.options[i]}`).join("; ")}`);
  return lines.join("\n");
}
function chainText(entries) {
  return entries.map((e) => `Level ${e.depth}${e.correct ? " (answered correctly)" : " (missed)"} - concept: ${e.term}
${formatQuestion(e.q, { withAnswer: true, chosen: e.correct ? null : e.chosen })}`).join("\n\n");
}
function followupPrompt({ course, entries, materials, depth, conceptNames, optionCount, objectives }) {
  const fmt = depth <= 1 ? `Match the style of the level 0 question (vignette or direct), with ${optionCount} answer choices.` : `A direct, focused question about one fact or relationship (no long vignette), with ${optionCount} answer choices.`;
  return `You are an adaptive tutor for a medical student. They just missed the last question in this chain. Find the most likely gap in their understanding and write ONE follow-up question on a MORE FOUNDATIONAL concept that the missed question depends on.

"More foundational" means one step back toward first principles: from a clinical application to the mechanism behind it, from a mechanism to the normal structure or function it rests on, from a named structure to its relationships, components, or definition.

Course: ${course}

Chain so far (level 0 is where the student started):
${chainText(entries)}

<course_materials>
${materials || "(No course materials are available.)"}
</course_materials>

Rules:
- Use only the course materials above. The tested fact and every answer choice must come from them. The professor's version wins over outside knowledge.
- If the foundation the student needs is not covered in the materials, do not write a question. Return {"outOfScope": true, "gap": "..."} instead.
- Use the student's wrong choice as evidence of the specific misconception.
- Do not re-test a concept that is already in the chain.
- This is level ${depth}. ${fmt}
${conceptNames.length ? `- If the concept you test matches one of these existing concept names, use that exact name as "term": ${conceptNames.slice(0, 120).join("; ")}` : ""}
${objectivesBlock(objectives)}
Return ONLY one JSON object:
{"gap": "one sentence, addressed to the student, naming what they likely misunderstand", ${QUESTION_FIELDS}, "objective": "<objective id or empty>"}`;
}
function variantPrompt({ course, q, term, summary, materials, reason, childTerm, daysAgo }) {
  const why = reason === "climb" ? `They just answered a follow-up on the foundation "${childTerm}" correctly. The new question should require applying that foundation.` : reason === "retry" ? "They missed this question and have seen its explanation. Test the same point from a different angle." : `This is a spaced review. They last saw this concept ${daysAgo} day${daysAgo === 1 ? "" : "s"} ago.`;
  return `Write ONE new practice question that tests the same concept as the reference question, to check whether a medical student now understands it. ${why}

Course: ${course}
Concept: ${term}${summary ? ` - ${summary}` : ""}

Reference question:
${formatQuestion(q, { withAnswer: true })}

<course_materials>
${materials || "(No course materials are available; stay within what the reference question and its explanation establish.)"}
</course_materials>

Rules:
- New scenario and new wording. Do not reuse the reference stem or simply reorder its choices. The correct answer may differ from the reference's.
- Same format and difficulty: ${q.options.length} answer choices and the same style (vignette or direct) as the reference.${q.multi ? " Keep it select-all-that-apply." : ""}
- Use only the course materials; every answer choice must come from them.
- Use exactly this term: "${term}".

Return ONLY one JSON object:
{${QUESTION_FIELDS.replace('"multi": false', `"multi": ${q.multi ? "true" : "false"}`)}}`;
}

// ../../../../../../Desktop/Test/App/src/grade.js
var norm = (s) => String(s || "").trim().toLowerCase();
function sameSet(a, b) {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  return b.every((x) => s.has(x));
}
function gradeAnswer(q, chosen) {
  const t = q.type || "mcq";
  if (t === "label") return (q.targets || []).every((x) => chosen && norm(chosen[x.id]) === norm(x.answer));
  if (t === "order") return Array.isArray(chosen) && chosen.length === q.items.length && q.items.every((x, i) => norm(chosen[i]) === norm(x));
  if (t === "match") return (q.pairs || []).every((p, i) => chosen && norm(chosen[i]) === norm(p.right));
  return Array.isArray(chosen) && sameSet(chosen, q.answer || []);
}
var isInteractive = (q) => !!q && ["label", "order", "match"].includes(q.type);

// ../../../../../../Desktop/Test/App/src/model.js
var CHUNK = 6e4;
var LETTER_RE = /^\s*\(?([A-L](?:\s*(?:,|and|&)\s*[A-L])*)\s*[.):]\s*/;
function toIndex(v, n) {
  if (typeof v === "string" && /^[A-La-l]$/.test(v.trim())) return LETTERS.indexOf(v.trim().toUpperCase());
  const i = Number(v);
  return Number.isInteger(i) && i >= 0 && i < n ? i : -1;
}
var ROOT_ORIGINS = ["practice", "generated", "own"];
var isRootQuestion = (q) => ROOT_ORIGINS.includes(q.origin);
function cleanQuestion(raw, { stripLabels = true } = {}) {
  if (!raw || typeof raw !== "object") return null;
  const stem = String(raw.stem || "").trim();
  let options = Array.isArray(raw.options) ? raw.options.map((o) => String(o ?? "").trim()) : [];
  if (stripLabels) options = options.map((o) => o.replace(/^\(?[A-La-l][).:]\s+/, "").trim());
  if (!stem || options.length < 2 || options.length > 12 || options.some((o) => !o)) return null;
  let answer = Array.isArray(raw.answer) ? raw.answer : raw.answer != null ? [raw.answer] : [];
  answer = [...new Set(answer.map((v) => toIndex(v, options.length)).filter((i) => i >= 0))].sort((a, b) => a - b);
  const keyed = raw.keyed === false ? false : answer.length > 0;
  if (!keyed) answer = [];
  const multi = !!raw.multi || answer.length > 1;
  let optionNotes = Array.isArray(raw.optionNotes) ? raw.optionNotes.map((s) => String(s ?? "").trim()) : [];
  optionNotes = options.map((_, i) => optionNotes[i] || "");
  const flags = Array.isArray(raw.flags) ? raw.flags.map(String).filter((f) => f && !/:\s*(none|n\/a)\.?$/i.test(f.trim())) : [];
  let definition = String(raw.definition || "").trim();
  const m = definition.match(LETTER_RE);
  if (keyed && !multi && m) {
    const li = LETTERS.indexOf(m[1].trim()[0].toUpperCase());
    if (li >= 0 && li < options.length && li !== answer[0]) {
      const body = normKey(definition.slice(m[0].length));
      const hit = (i) => {
        const o = normKey(options[i]);
        return !!o && body.startsWith(o.slice(0, Math.min(o.length, 40)));
      };
      if (hit(li) && !hit(answer[0])) answer = [li];
    }
  }
  const term = String(raw.term || raw.concept || "").trim() || stem.slice(0, 48);
  return {
    term,
    stem,
    options,
    answer,
    multi,
    keyed,
    definition,
    optionNotes,
    flags,
    conceptSummary: String(raw.conceptSummary || "").trim(),
    topic: raw.topic ? String(raw.topic) : ""
  };
}
function definitionBody(def) {
  const m = def.match(LETTER_RE);
  return m ? def.slice(m[0].length) : def;
}
function withDefinitionLetters(q) {
  if (!q.keyed || !q.answer.length) return q.definition;
  const body = definitionBody(q.definition || "") || q.answer.map((i) => q.options[i]).join("; ");
  return `${q.answer.map((i) => LETTERS[i]).join(", ")}. ${body}`;
}
var ORDERED_OPTION = /(all of the above|none of the above|both|neither|^[a-e] and [a-e]|choices? [a-e])/i;
function shuffleable(q) {
  if (q.options.some((o) => ORDERED_OPTION.test(o))) return false;
  if (q.options.every((o) => /^[\d.<>≤≥~-]/.test(o))) return false;
  return true;
}
function shuffleQuestion(q) {
  const order = shuffleArray(q.options.map((_, i) => i));
  const pos = new Map(order.map((oldI, newI) => [oldI, newI]));
  q.options = order.map((i) => q.options[i]);
  q.optionNotes = order.map((i) => q.optionNotes[i]);
  q.answer = q.answer.map((i) => pos.get(i)).sort((a, b) => a - b);
  q.definition = withDefinitionLetters(q);
  return q;
}
var CourseModel = class extends Emitter {
  constructor(lib, id) {
    super();
    this.lib = lib;
    this.id = id;
    this.sources = /* @__PURE__ */ new Map();
    this.texts = /* @__PURE__ */ new Map();
    this.questions = /* @__PURE__ */ new Map();
    this.concepts = /* @__PURE__ */ new Map();
    this.builds = /* @__PURE__ */ new Map();
    this.session = null;
    this.objectives = [];
    this.figs = /* @__PURE__ */ new Map();
    this.coverage = {};
    this.artifacts = /* @__PURE__ */ new Map();
    this._markers = /* @__PURE__ */ new Map();
    this.loaded = false;
    this.loading = null;
    this.error = null;
    this._index = null;
    this._sumTimer = null;
  }
  get meta() {
    return this.lib.get(this.id) || { name: "Course" };
  }
  get name() {
    return this.meta.name;
  }
  load() {
    this.loading = (async () => {
      try {
        const [sources, texts, questions, concepts, builds, state, figs, artifacts] = await Promise.all([
          listDocs(subPath(this.id, "sources")),
          listDocs(subPath(this.id, "texts")),
          listDocs(subPath(this.id, "questions")),
          listDocs(subPath(this.id, "concepts")),
          listDocs(subPath(this.id, "builds")),
          listDocs(subPath(this.id, "state")),
          listDocs(subPath(this.id, "figs")),
          listDocs(subPath(this.id, "artifacts"))
        ]);
        this.artifacts = new Map(artifacts.map((a) => [a.id, a]));
        this.figs = new Map(figs.map((f) => [f.id, f]));
        this.sources = new Map(sources.map((s) => [s.id, s]));
        const parts = /* @__PURE__ */ new Map();
        for (const t of texts) {
          if (!parts.has(t.sid)) parts.set(t.sid, []);
          parts.get(t.sid).push(t);
        }
        this.texts = /* @__PURE__ */ new Map();
        for (const [sid, arr] of parts) this.texts.set(sid, arr.sort((a, b) => a.i - b.i).map((x) => x.text).join(""));
        this.questions = new Map(questions.map((q) => [q.id, q]));
        this.concepts = new Map(concepts.map((c) => [c.id, c]));
        this.builds = new Map(builds.map((b) => [b.id, b]));
        const sess = state.find((s) => s.id === "session");
        this.session = sess && sess.phase ? sess : null;
        const obj = state.find((s) => s.id === "objectives");
        this.objectives = obj && Array.isArray(obj.items) ? obj.items : [];
        this.coverage = state.find((s) => s.id === "coverage")?.items || {};
        this._markers = /* @__PURE__ */ new Map();
        this.error = null;
        this.loaded = true;
        this._index = null;
        this.scheduleSummary(true);
      } catch (e) {
        this.error = e;
      }
      this.loading = null;
      this.emit();
    })();
    return this.loading;
  }
  async destroy() {
    if (!this.loaded) await this.load();
    for (const sub of ["sources", "questions", "concepts", "builds", "artifacts"]) for (const id of this[sub].keys()) removeDoc(docPath(this.id, sub, id));
    for (const [sid, text] of this.texts) for (let i = 0; i * CHUNK < Math.max(1, text.length); i++) removeDoc(docPath(this.id, "texts", `${sid}_${i}`));
    removeDoc(docPath(this.id, "state", "session"));
    removeDoc(docPath(this.id, "state", "objectives"));
    removeDoc(docPath(this.id, "state", "coverage"));
    for (const id of this.figs.keys()) removeDoc(docPath(this.id, "figs", id));
  }
  // ---------- Figures with label positions ----------
  saveFigs(sid, list) {
    for (const [id, f] of [...this.figs]) if (f.sid === sid) {
      this.figs.delete(id);
      removeDoc(docPath(this.id, "figs", id));
    }
    const t = now();
    for (const f of list) {
      const k = f.k || 0;
      const id = `${sid}_${f.unit === "figure" ? "f" : ""}${f.page}${k ? `_${k}` : ""}`;
      const doc = { id, sid, page: f.page, k, unit: f.unit || null, fig: f.fig || null, box: f.box || null, assetIds: f.assetIds, labels: f.labels || [], createdAt: t + f.page * 10 + k };
      this.figs.set(id, doc);
      saveDoc(docPath(this.id, "figs", id), doc);
    }
    this.emit();
  }
  // Every stored image id that a question or explanation in this course points at.
  referencedAssets() {
    const ids = /* @__PURE__ */ new Set();
    for (const s of this.sources.values()) {
      if (s.originalAssetId) ids.add(s.originalAssetId);
      if (s.pdfExportAssetId) ids.add(s.pdfExportAssetId);
      if (s.editedAssetId) ids.add(s.editedAssetId);
      if (s.originalTextAssetId) ids.add(s.originalTextAssetId);
      for (const id of Object.values(s.slideImages || {})) ids.add(id);
    }
    for (const q of this.questions.values()) {
      if (q.figure && q.figure.assetId) ids.add(q.figure.assetId);
      for (const f of q.explanation && q.explanation.figures || []) for (const id of f.assetIds || []) ids.add(id);
    }
    for (const a of this.artifacts.values()) if (a.type === "flashcards") for (const c of a.cards || []) {
      if (c.termImage) ids.add(c.termImage);
      if (c.definitionImage) ids.add(c.definitionImage);
    }
    return ids;
  }
  // Text around "[Figure n]" in a Word file without page breaks.
  figureText(sid, n) {
    const t = this.texts.get(sid) || "";
    const i = t.indexOf(`[Figure ${n}]`);
    if (i < 0) return "";
    return t.slice(Math.max(0, i - 300), i + 300).trim();
  }
  figureUnit(f) {
    if (f.unit) return f.unit;
    const src = this.sources.get(f.sid);
    return src && src.fileType === "pptx" ? "slide" : "page";
  }
  figureContext(f) {
    return f.unit === "figure" ? this.figureText(f.sid, f.page) : this.pageText(f.sid, f.page);
  }
  fig(sid, page) {
    return this.figs.get(`${sid}_${page}`) || null;
  }
  figsFor(sid) {
    return [...this.figs.values()].filter((f) => f.sid === sid);
  }
  // ---------- Objectives ----------
  saveCoverage(items) {
    this.coverage = items;
    saveDoc(docPath(this.id, "state", "coverage"), { items, updatedAt: now() });
    this.emit();
  }
  saveObjectives(items) {
    this.objectives = items;
    saveDoc(docPath(this.id, "state", "objectives"), { items, createdAt: now(), updatedAt: now() });
    this.emit();
  }
  objective(id) {
    return id ? this.objectives.find((o) => o.id === id) || null : null;
  }
  objectivesForPrompt() {
    return this.objectives.map((o) => `${o.id}: ${o.lecture ? `[${o.lecture}] ` : ""}${o.num ? `${o.num}. ` : ""}${o.text}`).join("\n");
  }
  // ---------- Sources ----------
  materialSources() {
    return [...this.sources.values()].filter((s) => s.kind === "material").sort((a, b) => a.createdAt - b.createdAt);
  }
  practiceSources() {
    return [...this.sources.values()].filter((s) => s.kind === "practice").sort((a, b) => a.createdAt - b.createdAt);
  }
  hasMaterial() {
    return this.materialSources().some((s) => (this.texts.get(s.id) || "").length > 0);
  }
  addSource({ name, kind, rank, lecture, fileType, text, pages, weekId = null, origin = "upload" }) {
    const id = rid("s");
    const t = now();
    const chunks = Math.max(1, Math.ceil(text.length / CHUNK));
    const s = { id, name, kind, rank: rank || 1, lecture: lecture || "", fileType: fileType || "text", chars: text.length, pages: pages || null, chunks, weekId: weekId === "unassigned" ? null : weekId, origin, createdAt: t };
    this.sources.set(id, s);
    this.texts.set(id, text);
    saveDoc(docPath(this.id, "sources", id), s);
    for (let i = 0; i < chunks; i++) saveDoc(docPath(this.id, "texts", `${id}_${i}`), { sid: id, i, text: text.slice(i * CHUNK, (i + 1) * CHUNK), createdAt: t + i });
    this._index = null;
    this.touch();
    this.emit();
    return id;
  }
  // Re-reading a file that's already in the course: same source id, so questions and progress stay linked.
  replaceSourceText(sid, { text, pages, fileType }) {
    const s = this.sources.get(sid);
    if (!s || !text) return;
    const old = s.chunks || 1;
    const t = now();
    const chunks = Math.max(1, Math.ceil(text.length / CHUNK));
    for (let i = 0; i < chunks; i++) saveDoc(docPath(this.id, "texts", `${sid}_${i}`), { sid, i, text: text.slice(i * CHUNK, (i + 1) * CHUNK), createdAt: t + i });
    for (let i = chunks; i < old; i++) removeDoc(docPath(this.id, "texts", `${sid}_${i}`));
    this.texts.set(sid, text);
    this._markers.delete(sid);
    Object.assign(s, { chars: text.length, pages: pages || null, chunks, fileType: fileType || s.fileType, updatedAt: t });
    saveDoc(docPath(this.id, "sources", sid), s);
    this._index = null;
    this.touch();
    this.emit();
  }
  sourceByName(name) {
    const k = normKey(name);
    return [...this.sources.values()].filter((s) => normKey(s.name) === k).sort((a, b) => b.createdAt - a.createdAt)[0] || null;
  }
  updateSource(sid, patch) {
    const s = this.sources.get(sid);
    if (!s) return;
    Object.assign(s, patch);
    saveDoc(docPath(this.id, "sources", sid), s);
    this._index = null;
    this.emit();
  }
  deleteSource(sid) {
    const s = this.sources.get(sid);
    if (!s) return;
    const chunks = s.chunks || Math.max(1, Math.ceil((this.texts.get(sid) || "").length / CHUNK));
    for (let i = 0; i < chunks; i++) removeDoc(docPath(this.id, "texts", `${sid}_${i}`));
    removeDoc(docPath(this.id, "sources", sid));
    for (const [id, f] of [...this.figs]) if (f.sid === sid) {
      this.figs.delete(id);
      removeDoc(docPath(this.id, "figs", id));
    }
    this.sources.delete(sid);
    this.texts.delete(sid);
    for (const q of [...this.questions.values()]) if (q.sourceId === sid && !(q.attempts > 0)) this.deleteQuestion(q.id, true);
    this._index = null;
    this.scheduleSummary();
    this.emit();
  }
  index() {
    if (!this._index) this._index = new MaterialIndex([...this.sources.values()], this.texts);
    return this._index;
  }
  materialFor(query, budget = 3e4, opts = {}) {
    const groups = this.index().search(query, budget, opts);
    return groups.length ? formatMaterials(groups) : "";
  }
  markers(sid) {
    if (!this._markers.has(sid)) {
      const t = this.texts.get(sid) || "";
      const out = [];
      const re = /--- (?:Page|Slide) (\d+) ---/g;
      let mm;
      while (mm = re.exec(t)) out.push({ pos: mm.index, num: Number(mm[1]) });
      this._markers.set(sid, out);
    }
    return this._markers.get(sid);
  }
  pagesInRange(sid, start, end) {
    const ms = this.markers(sid);
    const pages = /* @__PURE__ */ new Set();
    let before = null;
    for (const mk of ms) {
      if (mk.pos <= start) before = mk.num;
      else if (mk.pos < end) pages.add(mk.num);
    }
    if (before != null) pages.add(before);
    return [...pages];
  }
  pageText(sid, num) {
    const t = this.texts.get(sid) || "";
    const ms = this.markers(sid);
    const i = ms.findIndex((mk) => mk.num === num);
    if (i < 0) return "";
    return t.slice(ms[i].pos, i + 1 < ms.length ? ms[i + 1].pos : void 0).replace(/--- (?:Page|Slide) \d+ ---/, "").trim();
  }
  // Course text for a prompt plus the figures (slide/page images) that sit in that text.
  materialWithFigures(query, budget = 3e4, opts = {}) {
    const groups = this.index().search(query, budget, opts);
    const candidates = [];
    for (const g of groups) {
      const src = this.sources.get(g.sid);
      if (!src) continue;
      const pages = /* @__PURE__ */ new Set();
      for (const [a, b] of g.ranges || []) for (const p of this.pagesInRange(g.sid, a, b)) pages.add(p);
      const figs = this.figsFor(g.sid).sort((x, y) => x.page - y.page || (x.k || 0) - (y.k || 0));
      if (figs.length) {
        const text = this.texts.get(g.sid) || "";
        for (const f of figs) {
          let hit;
          if (f.unit === "figure") {
            const at = text.indexOf(`[Figure ${f.page}]`);
            hit = at >= 0 && (g.ranges || []).some(([a, b]) => at >= a - 400 && at <= b + 400);
          } else hit = pages.has(f.page);
          if (hit) candidates.push({ sid: g.sid, file: src.name, page: f.page, unit: this.figureUnit(f), assetIds: f.assetIds, labels: (f.labels || []).map((l) => l.t).slice(0, 12), text: this.figureContext(f).slice(0, 220) });
        }
      } else if (src.figures) {
        for (const p of [...pages].sort((x, y) => x - y)) {
          const ids = src.figures[p];
          if (ids && ids.length) candidates.push({ sid: g.sid, file: src.name, page: p, unit: src.fileType === "pptx" ? "slide" : "page", assetIds: ids, labels: [], text: this.pageText(g.sid, p).slice(0, 220) });
        }
      }
    }
    return { materials: groups.length ? formatMaterials(groups) : "", candidates: candidates.slice(0, 16) };
  }
  // ---------- Questions & concepts ----------
  conceptNames() {
    return [...this.concepts.values()].sort((a, b) => (b.lastSeen || b.createdAt || 0) - (a.lastSeen || a.createdAt || 0)).map((c) => c.name);
  }
  ensureConcept(term, summary, { sourceId, lecture, forceId } = {}) {
    const id = forceId || conceptId(term);
    let c = this.concepts.get(id);
    if (!c) {
      c = { id, ...newConcept(term, summary, { lecture: lecture || "" }) };
      this.concepts.set(id, c);
    } else if (!c.summary && summary) c.summary = summary;
    if (sourceId && !(c.sourceIds || []).includes(sourceId)) c.sourceIds = [...c.sourceIds || [], sourceId];
    this.saveConcept(c);
    return c;
  }
  saveConcept(c) {
    saveDoc(docPath(this.id, "concepts", c.id), c);
  }
  // Validates a question from ChatGPT and stores it with its concept.
  ingestQuestion(raw, { origin, sourceId = null, lecture = "", depth = 0, parentId = null, gap = "", forceConceptId = null, order = null, buildId = null, verbatim = false, objectiveId = null, figure = null } = {}) {
    const cq = cleanQuestion(raw);
    void verbatim;
    if (!cq) return null;
    let q = { ...cq };
    if (origin !== "practice" && q.keyed && !q.multi && shuffleable(q)) shuffleQuestion(q);
    else if (q.keyed) q.definition = withDefinitionLetters(q);
    const src = sourceId ? this.sources.get(sourceId) : null;
    const c = forceConceptId && this.concepts.get(forceConceptId) ? this.concepts.get(forceConceptId) : this.ensureConcept(q.term, q.conceptSummary, { sourceId, lecture: lecture || src && src.lecture || "" });
    if (forceConceptId && c.id === forceConceptId) q.term = c.name;
    const id = rid("q");
    const doc = {
      id,
      term: q.term,
      stem: q.stem,
      options: q.options,
      answer: q.answer,
      multi: q.multi,
      keyed: q.keyed,
      definition: q.definition,
      optionNotes: q.optionNotes,
      flags: q.flags,
      topic: q.topic || "",
      origin,
      sourceId,
      lecture: lecture || src && src.lecture || "",
      conceptId: c.id,
      depth,
      parentId,
      gap: gap || "",
      objectiveId: this.objective(objectiveId) && objectiveId || this.objective(raw.objective) && raw.objective || null,
      page: origin === "practice" && Number.isInteger(Number(raw.page)) && Number(raw.page) > 0 ? Number(raw.page) : null,
      figure: figure || null,
      order,
      buildId,
      createdAt: now(),
      attempts: 0,
      correctCount: 0,
      lastSeen: 0,
      lastResult: null,
      flagged: false
    };
    this.questions.set(id, doc);
    saveDoc(docPath(this.id, "questions", id), doc);
    this.scheduleSummary();
    this.emit();
    return doc;
  }
  // Labeling, ordering, matching, and image questions.
  ingestInteractive(raw, { sourceId = null, lecture = "", buildId = null, objectiveId = null, origin = "generated" } = {}) {
    const type = raw.type;
    const term = String(raw.term || "").trim();
    if (!term || !["label", "order", "match"].includes(type)) return null;
    const base = { type, term, stem: String(raw.stem || "").trim(), options: [], answer: [], multi: false, keyed: true, optionNotes: [], flags: [], topic: "" };
    if (type === "label") {
      const targets = (raw.targets || []).filter((t) => t && t.answer && [t.x, t.y, t.w, t.h].every((v) => Number.isFinite(v)));
      if (targets.length < 2 || !raw.figure) return null;
      const answers = targets.map((t) => t.answer);
      const bank = [.../* @__PURE__ */ new Set([...answers, ...(raw.distractors || []).map(String).filter((d) => d && !answers.includes(d))])];
      Object.assign(base, { figure: raw.figure, targets: targets.map((t, i) => ({ id: `t${i + 1}`, x: t.x, y: t.y, w: t.w, h: t.h, answer: t.answer })), bank, stem: base.stem || "Drag each label onto its place on the diagram." });
      base.definition = `Labels: ${base.targets.map((t, i) => `${i + 1}. ${t.answer}`).join("; ")}. [${raw.figure.file}, ${raw.figure.unit} ${raw.figure.page}]`;
    } else if (type === "order") {
      const items = (raw.items || []).map((x) => String(x || "").trim()).filter(Boolean);
      if (items.length < 3 || new Set(items).size !== items.length) return null;
      Object.assign(base, { items, stem: base.stem || "Put these in the correct order." });
      base.definition = String(raw.definition || "").trim() || `Correct order: ${items.join(" \u2192 ")}`;
    } else if (type === "match") {
      const pairs = (raw.pairs || []).map((p) => ({ left: String(p && p.left || "").trim(), right: String(p && p.right || "").trim() })).filter((p) => p.left && p.right);
      if (pairs.length < 3 || new Set(pairs.map((p) => p.left)).size !== pairs.length) return null;
      const extras = (raw.extras || []).map(String).filter((x) => x && !pairs.some((p) => p.right === x)).slice(0, 3);
      Object.assign(base, { pairs, extras, stem: base.stem || "Match each item on the left with its partner." });
      base.definition = String(raw.definition || "").trim() || pairs.map((p) => `${p.left} \u2192 ${p.right}`).join("; ");
    }
    const src = sourceId ? this.sources.get(sourceId) : null;
    const c = this.ensureConcept(term, String(raw.conceptSummary || ""), { sourceId, lecture: lecture || src && src.lecture || "" });
    const id = rid("q");
    const doc = {
      id,
      ...base,
      origin,
      sourceId,
      lecture: lecture || src && src.lecture || "",
      conceptId: c.id,
      depth: 0,
      parentId: null,
      gap: "",
      objectiveId: this.objective(objectiveId) && objectiveId || this.objective(raw.objective) && raw.objective || null,
      order: null,
      buildId,
      createdAt: now(),
      attempts: 0,
      correctCount: 0,
      lastSeen: 0,
      lastResult: null,
      flagged: false
    };
    this.questions.set(id, doc);
    saveDoc(docPath(this.id, "questions", id), doc);
    this.scheduleSummary();
    this.emit();
    return doc;
  }
  updateQuestion(q) {
    this.questions.set(q.id, q);
    saveDoc(docPath(this.id, "questions", q.id), q);
    this.scheduleSummary();
    this.emit();
  }
  deleteQuestion(qid, quiet = false) {
    this.questions.delete(qid);
    removeDoc(docPath(this.id, "questions", qid));
    if (!quiet) {
      this.scheduleSummary();
      this.emit();
    }
  }
  keyQuestion(qid, answer) {
    const q = this.questions.get(qid);
    if (!q) return;
    q.answer = [...answer].sort((a, b) => a - b);
    q.keyed = q.answer.length > 0;
    q.multi = q.multi || q.answer.length > 1;
    q.keyedBy = "you";
    q.definition = withDefinitionLetters({ ...q, definition: q.definition || q.answer.map((i) => q.options[i]).join("; ") });
    this.updateQuestion(q);
  }
  recordAnswer(q, chosen, correct) {
    const t = now();
    q.attempts = (q.attempts || 0) + 1;
    if (correct) q.correctCount = (q.correctCount || 0) + 1;
    q.lastSeen = t;
    q.lastResult = correct ? "correct" : "wrong";
    q.lastChosen = chosen;
    saveDoc(docPath(this.id, "questions", q.id), q);
    const c = this.concepts.get(q.conceptId);
    if (c) {
      correct ? applyCorrect(c, t) : applyWrong(c, t);
      this.saveConcept(c);
    }
    this.scheduleSummary();
    this.emit();
  }
  linkPrereq(childConceptId, parentConceptId) {
    const c = this.concepts.get(childConceptId);
    if (!c || childConceptId === parentConceptId) return;
    if (!(c.prereqOf || []).includes(parentConceptId)) {
      c.prereqOf = [...c.prereqOf || [], parentConceptId];
      this.saveConcept(c);
    }
  }
  rootQuestions() {
    return [...this.questions.values()].filter(isRootQuestion);
  }
  // A practice exam set's questions in the bank, as the student wrote them: ids stay stable so
  // answers and progress survive edits, nothing is shuffled, and questions removed from the set
  // leave the bank. `list` items: { id, stem, options, answer, multi, explanation, image, term }.
  syncOwnQuestions(setId, weekId, list) {
    const keep = /* @__PURE__ */ new Set();
    for (const raw of list) {
      const cq = cleanQuestion({ ...raw, definition: "" }, { stripLabels: false });
      if (!cq || !cq.keyed) continue;
      const prev = this.questions.get(raw.id);
      const term = String(raw.term || "").trim() || cq.stem.replace(/\s+/g, " ").slice(0, 60);
      const c = prev?.conceptId && this.concepts.get(prev.conceptId) ? this.concepts.get(prev.conceptId) : this.ensureConcept(term, "", {});
      const explanation = String(raw.explanation || "").trim();
      const doc = {
        attempts: 0,
        correctCount: 0,
        lastSeen: 0,
        lastResult: null,
        flagged: false,
        createdAt: now(),
        objectiveId: null,
        ...prev || {},
        id: raw.id,
        term,
        stem: cq.stem,
        options: cq.options,
        answer: cq.answer,
        multi: cq.multi,
        keyed: true,
        optionNotes: cq.options.map((_, i) => String(raw.optionNotes?.[i] || "").trim()),
        flags: [],
        topic: "",
        definition: withDefinitionLetters({ ...cq, definition: explanation || cq.answer.map((i) => cq.options[i]).join("; ") }),
        explanation: prev?.explanation && prev.stem === cq.stem && String(prev.options) === String(cq.options) ? prev.explanation : null,
        origin: "own",
        setId,
        weekId: weekId && weekId !== "all" ? weekId : null,
        sourceId: null,
        lecture: "",
        conceptId: c.id,
        depth: 0,
        parentId: null,
        gap: "",
        image: raw.image || null,
        order: keep.size,
        keyedBy: "you"
      };
      keep.add(doc.id);
      this.questions.set(doc.id, doc);
      saveDoc(docPath(this.id, "questions", doc.id), doc);
    }
    for (const q of [...this.questions.values()]) if (q.setId === setId && q.origin === "own" && !keep.has(q.id)) this.deleteQuestion(q.id, true);
    this.scheduleSummary();
    this.emit();
    return [...keep];
  }
  // ---------- Saved study artifacts (chat conversations, flashcard sets) ----------
  saveArtifact(a) {
    const doc = { ...a, id: a.id || rid("a"), createdAt: a.createdAt || now(), updatedAt: now() };
    this.artifacts.set(doc.id, doc);
    saveDoc(docPath(this.id, "artifacts", doc.id), doc);
    this.emit();
    return doc;
  }
  deleteArtifact(id) {
    this.artifacts.delete(id);
    removeDoc(docPath(this.id, "artifacts", id));
    this.emit();
  }
  // ---------- Builds & session ----------
  saveBuild(b) {
    this.builds.set(b.id, b);
    saveDoc(docPath(this.id, "builds", b.id), b);
    this.emit();
  }
  saveSession() {
    if (!this.session) return;
    this.session.updatedAt = now();
    saveDoc(docPath(this.id, "state", "session"), this.session);
  }
  clearSession() {
    this.session = null;
    removeDoc(docPath(this.id, "state", "session"));
    this.emit();
  }
  touch() {
    this.lib.update(this.id, {});
  }
  stats() {
    const qs = [...this.questions.values()];
    const roots = qs.filter(isRootQuestion);
    return {
      practice: roots.filter((q) => q.origin === "practice").length,
      generated: roots.filter((q) => q.origin === "generated").length,
      own: roots.filter((q) => q.origin === "own").length,
      unkeyed: roots.filter((q) => !q.keyed).length,
      flagged: qs.filter((q) => q.flagged).length,
      followups: qs.filter((q) => q.origin === "followup").length,
      sources: this.sources.size
    };
  }
  scheduleSummary(immediate = false) {
    clearTimeout(this._sumTimer);
    const run = () => {
      const s = summarize([...this.concepts.values()]);
      const st = this.stats();
      const summary = { ...s, practice: st.practice, generated: st.generated, unkeyed: st.unkeyed, sources: st.sources, concepts: this.concepts.size };
      const prev = this.meta.summary;
      if (JSON.stringify(prev) !== JSON.stringify(summary)) this.lib.update(this.id, { summary });
    };
    if (immediate) run();
    else this._sumTimer = setTimeout(run, 1200);
  }
};

// ../../../../../../Desktop/Test/App/src/question-types.js
var QUESTION_TYPES = [
  { id: "mcq", label: "Single choice" },
  { id: "multi", label: "Select all that apply" },
  { id: "image", label: "Image / identify a structure" },
  { id: "label", label: "Diagram labeling" },
  { id: "order", label: "Ordering" },
  { id: "match", label: "Matching" }
];
function questionType(q) {
  if (["label", "order", "match"].includes(q.type)) return q.type;
  if (q.figure) return "image";
  return q.multi || q.answer?.length > 1 ? "multi" : "mcq";
}
var matchesTypes = (q, types) => types == null || types.includes(questionType(q));

// ../../../../../../Desktop/Test/App/src/coverage.js
var hash = (text) => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16);
};
var bankQuestion = (q) => q.keyed !== false && ["practice", "generated", "own"].includes(q.origin);
var questionContent = (q) => JSON.stringify([q.type, q.term, q.stem, q.options, q.answer, q.definition, q.items, q.pairs, q.labels, q.objectiveId]);
var questionStamp = (q) => hash(questionContent(q));
function materialStamp(m, objective) {
  return hash(JSON.stringify([objective.text, objective.lecture, ...m.materialSources().map((s) => [s.id, s.name, s.rank, m.texts.get(s.id) || ""]).sort((a, b) => a[0].localeCompare(b[0]))]));
}
function objectiveCoverage(m, objective) {
  const audit = m.coverage?.[objective.id];
  const questions = [...m.questions.values()].filter(bankQuestion);
  if (!audit || audit.materialStamp !== materialStamp(m, objective)) return { percent: null, topics: [], covered: 0, stale: !!audit, conceptIds: /* @__PURE__ */ new Set() };
  const valid = new Map(questions.filter((q) => audit.questionStamps[q.id] === questionStamp(q)).map((q) => [q.id, q]));
  const topics = audit.topics.map((t) => ({ ...t, questionIds: t.questionIds.filter((id) => valid.has(id)) }));
  const covered = topics.filter((t) => t.questionIds.length).length;
  const conceptIds = new Set(topics.flatMap((t) => t.questionIds.map((id) => valid.get(id).conceptId)));
  const stale = questions.length !== Object.keys(audit.questionStamps).length || questions.some((q) => audit.questionStamps[q.id] !== questionStamp(q));
  return { percent: topics.length ? Math.round(covered / topics.length * 100) : null, topics, covered, stale, conceptIds, assessedAt: audit.assessedAt };
}
function objectiveConcepts(m, id) {
  if (id === "all") return [...m.concepts.values()];
  const ids = /* @__PURE__ */ new Set();
  for (const q of m.questions.values()) if (q.objectiveId === id) ids.add(q.conceptId);
  const objective = m.objectives.find((o) => o.id === id);
  if (objective) for (const cid of objectiveCoverage(m, objective).conceptIds) ids.add(cid);
  let grew = true;
  while (grew) {
    grew = false;
    for (const c of m.concepts.values()) if (!ids.has(c.id) && c.prereqOf?.some((p) => ids.has(p))) {
      ids.add(c.id);
      grew = true;
    }
  }
  return [...m.concepts.values()].filter((c) => ids.has(c.id));
}

// ../../../../../../Desktop/Test/App/src/engine.js
init_ai();

// ../../../../../../Desktop/Test/App/src/settings.js
var DEFAULTS = { buildTier: "complex", effort: "medium", examTier: "default", buildReasoning: "auto", examReasoning: "auto", explanationTier: "match", explanationEffort: "auto" };
function getGen() {
  return { ...DEFAULTS, ...lsGet("wk-gen", {}) };
}

// ../../../../../../Desktop/Test/App/src/explain.js
var explainQuestion = async () => null;

// ../../../../../../Desktop/Test/App/server/study-skills/study-signals.mjs
var SIGNAL_MEANINGS = {
  important: { label: "Important", weight: 1 },
  review: { label: "Need to review", weight: 1.2 },
  confusing: { label: "Confusing", weight: 1.4 },
  "exam-worthy": { label: "Exam-worthy", weight: 1.5 },
  definition: { label: "Definition", weight: 0.8 },
  relationship: { label: "Relationship", weight: 1 }
};
var BASE = { highlight: 0.6, highlighter: 0.6, question: 0.6, pen: 0.4, arrow: 0.5, rect: 0.5, ellipse: 0.5, text: 0.7, pin: 0.8 };
function slideSignals(annotations = []) {
  const by = /* @__PURE__ */ new Map();
  for (const a of annotations) {
    if (!a || a.sourceId == null || a.slide == null) continue;
    const key = `${a.sourceId}:${a.slide}`;
    const cur = by.get(key) || { sourceId: a.sourceId, slide: a.slide, raw: 0, meanings: /* @__PURE__ */ new Set(), notes: [] };
    cur.raw += (BASE[a.type] ?? 0.4) * (SIGNAL_MEANINGS[a.meaning]?.weight ?? 1);
    if (a.meaning && SIGNAL_MEANINGS[a.meaning]) cur.meanings.add(a.meaning);
    if (a.type === "text" && a.data?.text) cur.notes.push(String(a.data.text).slice(0, 200));
    by.set(key, cur);
  }
  return [...by.values()].map((s) => ({ ...s, score: Math.round((1 - Math.exp(-s.raw)) * 100) / 100, meanings: [...s.meanings] })).sort((a, b) => b.score - a.score);
}
function sessionMarks(sessions = []) {
  return sessions.flatMap((s) => [...s.annotations || [], ...(s.questions || []).filter((q) => q.type === "ask" && q.slide != null).map((q) => ({ sourceId: s.sourceId, slide: q.slide, type: "question" }))]);
}
function examWeight({ objective = 0, emphasis = 0, signal = 0, miss = 0 } = {}) {
  const w = 1 + objective * 0.6 + emphasis * 0.5 + signal * 0.8 + miss * 1;
  return Math.min(3, Math.round(w * 100) / 100);
}

// ../../../../../../Desktop/Test/App/src/engine.js
var MAX_DEPTH = 4;
var MAX_TRIES = 3;
function usable(q) {
  return q && q.keyed && (isInteractive(q) || q.answer && q.answer.length);
}
function examPool(m, { sourceIds = null, types = null, coverageSelections = null, questionIds = null } = {}) {
  const inSrc = (q) => !sourceIds || sourceIds.includes(q.sourceId);
  const inSet = (q) => !questionIds || questionIds.includes(q.id);
  const roots = m.rootQuestions().filter((q) => usable(q) && inSrc(q) && inSet(q) && matchesTypes(q, types) && matchesExamCoverage(m, q, coverageSelections));
  const practice = roots.filter((q) => q.origin === "practice" && q.lastResult !== "correct" || q.flagged).sort((a, b) => Number(b.flagged) - Number(a.flagged) || a.createdAt - b.createdAt || (a.order || 0) - (b.order || 0));
  const t = now();
  const conceptOk = (c) => !sourceIds || (c.sourceIds || []).some((s) => sourceIds.includes(s));
  const reviews = [...m.concepts.values()].filter((c) => isDue(c, t) && conceptOk(c) && roots.some((q) => q.conceptId === c.id)).sort((a, b) => (a.status === "learning" ? 0 : 1) - (b.status === "learning" ? 0 : 1) || (a.due || 0) - (b.due || 0));
  const unseen = signalOrder(m, roots.filter((q) => q.origin !== "practice" && !(q.attempts > 0)).sort((a, b) => a.createdAt - b.createdAt));
  const seen = roots.filter((q) => q.attempts > 0 && !(q.origin === "practice" && q.lastResult !== "correct")).sort((a, b) => (a.lastResult === "wrong" ? 0 : 1) - (b.lastResult === "wrong" ? 0 : 1) || (a.lastSeen || 0) - (b.lastSeen || 0));
  return { practice, reviews, unseen, seen };
}
function signalOrder(m, questions) {
  const root = m.allCourse || m;
  const sig = slideSignals(sessionMarks([...root.artifacts?.values() || []].filter((a) => a.type === "study-session")));
  if (!sig.length) return questions;
  const score = new Map(sig.map((s) => [`${s.sourceId}:${s.slide}`, s.score]));
  const bySource = /* @__PURE__ */ new Map();
  for (const s of sig) bySource.set(s.sourceId, Math.max(bySource.get(s.sourceId) || 0, s.score * 0.5));
  const weight = (q) => Math.round(examWeight({ signal: score.get(`${q.sourceId}:${q.page}`) ?? bySource.get(q.sourceId) ?? 0, objective: q.objectiveId ? 1 : 0 }) * 2) / 2;
  return questions.map((q, i) => ({ q, i, w: weight(q) })).sort((a, b) => b.w - a.w || a.i - b.i).map((x) => x.q);
}
function createSession(m, { size = 20, sourceIds = null, practiceFirst = true, includeReviews = true, weekId = m.weekId || "all", types = null, adaptive = true, coverageSelections = null, questionIds = null, setId = null }) {
  const pool = examPool(m, { sourceIds, types, coverageSelections, questionIds });
  const items = [];
  const used = /* @__PURE__ */ new Set();
  const ids = /* @__PURE__ */ new Set();
  const add = (item, cid) => {
    if (items.length >= size || ids.has(item.k + item.id)) return;
    items.push(item);
    ids.add(item.k + item.id);
    if (cid) used.add(cid);
  };
  const addQ = (q) => add({ k: "q", id: q.id }, q.conceptId);
  if (practiceFirst) pool.practice.forEach(addQ);
  if (includeReviews) {
    for (const c of pool.reviews) if (!used.has(c.id)) add({ k: "c", id: c.id }, c.id);
  }
  const rest = practiceFirst ? pool.unseen : [...pool.practice, ...pool.unseen].sort(() => Math.random() - 0.5);
  for (const q of rest) if (!used.has(q.conceptId)) addQ(q);
  for (const q of rest) addQ(q);
  for (const q of pool.seen) if (!used.has(q.conceptId)) addQ(q);
  const t = now();
  m.session = {
    id: rid("x"),
    createdAt: t,
    startedAt: t,
    opts: { size, sourceIds, practiceFirst, includeReviews, weekId, types, adaptive, coverageSelections, questionIds, setId },
    queue: items,
    total: items.length,
    done: 0,
    firstTry: 0,
    resolved: 0,
    unresolved: 0,
    streak: 0,
    deferred: [],
    checkpointDue: false,
    retrying: false,
    rootQid: null,
    stack: [],
    log: [],
    rootMissed: false,
    phase: items.length ? "loading" : "done",
    last: null,
    next: null,
    results: []
  };
  m.saveSession();
  return m.session;
}
function masteredObjectives(m) {
  return m.objectives.filter((o) => {
    const concepts = objectiveConcepts(m, o.id);
    return concepts.length > 0 && concepts.every((c) => bucket(c) === "retained");
  });
}
var Exam = class extends Emitter {
  constructor(m, services = {}) {
    super();
    this.m = m;
    this.services = { askJSON, aiAvailable, getGen, explainQuestion, autoExplain: false, ...services };
    this.pending = null;
    this.pendingError = null;
    this.loading = null;
    this.ctl = null;
    this.prefetch = null;
  }
  get s() {
    return this.m.session;
  }
  current() {
    const s = this.s;
    if (!s || !s.stack.length) return null;
    const top = s.stack[s.stack.length - 1];
    return { entry: top, q: this.m.questions.get(top.qid) };
  }
  save() {
    this.m.saveSession();
    this.emit();
  }
  async begin() {
    const s = this.s;
    if (!s) return;
    if (s.phase === "done") return this.emit();
    if (s.stack.length && this.current() && this.current().q) {
      if (s.opts?.adaptive === false && s.next?.nonAdaptive) s.next = { type: "defer", qid: this.current().q.id };
      if (s.phase === "feedback" && s.next && needsGen(s.next.type) && !s.next.qid) this.prepareNext();
      return this.emit();
    }
    s.stack = [];
    return this.advanceRoot();
  }
  pickForConcept(cid) {
    const t = now();
    const qs = [...this.m.questions.values()].filter((q) => usable(q) && q.conceptId === cid && (!this.s.opts?.sourceIds || this.s.opts.sourceIds.includes(q.sourceId)) && matchesTypes(q, this.s.opts?.types) && matchesExamCoverage(this.m, q, this.s.opts?.coverageSelections));
    const unseen = qs.filter((q) => !(q.attempts > 0));
    if (unseen.length) return unseen.sort((a, b) => a.depth - b.depth || a.createdAt - b.createdAt)[0].id;
    const old = qs.filter((q) => t - (q.lastSeen || 0) > 7 * DAY).sort((a, b) => (a.lastSeen || 0) - (b.lastSeen || 0));
    return old.length ? old[0].id : null;
  }
  async genReview(cid, signal) {
    const c = this.m.concepts.get(cid);
    const ref = [...this.m.questions.values()].filter((q2) => q2.conceptId === cid && usable(q2) && (!this.s.opts?.sourceIds || this.s.opts.sourceIds.includes(q2.sourceId)) && matchesTypes(q2, this.s.opts?.types) && matchesExamCoverage(this.m, q2, this.s.opts?.coverageSelections)).sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0))[0];
    if (!c || !ref) return null;
    if (this.s.opts?.adaptive === false || isInteractive(ref) || this.s.opts?.types != null && questionType(ref) === "image") return ref.id;
    const daysAgo = Math.max(1, Math.round((now() - (c.lastSeen || now())) / DAY));
    const res = await this.services.askJSON(variantPrompt({
      course: this.m.name,
      q: ref,
      term: c.name,
      summary: c.summary,
      reason: "review",
      daysAgo,
      materials: this.m.materialFor(`${c.name} ${c.summary} ${formatQuestion(ref)}`, 24e3, { preferSids: c.sourceIds || [] })
    }), { signal, tier: this.services.getGen().examTier, reasoningEffort: this.services.getGen().examReasoning, kind: "followup" });
    if (this.s.opts?.types != null) {
      const candidate = cleanQuestion(res);
      if (!candidate || !matchesTypes(candidate, this.s.opts.types)) return ref.id;
    }
    const q = this.m.ingestQuestion(res, { origin: "variant", depth: ref.depth || 0, parentId: ref.id, sourceId: ref.sourceId, lecture: ref.lecture, forceConceptId: cid, objectiveId: ref.objectiveId || null });
    if (!q) throw { code: "invalid_json" };
    return q.id;
  }
  async resolveItem(item, signal) {
    if (item.k === "q") return usable(this.m.questions.get(item.id)) ? item.id : null;
    const picked = this.pickForConcept(item.id);
    if (picked) return picked;
    if (!this.services.aiAvailable() || this.s.opts?.adaptive === false) {
      const any = [...this.m.questions.values()].filter((q) => usable(q) && q.conceptId === item.id && (!this.s.opts?.sourceIds || this.s.opts.sourceIds.includes(q.sourceId)) && matchesTypes(q, this.s.opts?.types) && matchesExamCoverage(this.m, q, this.s.opts?.coverageSelections)).sort((a, b) => (a.lastSeen || 0) - (b.lastSeen || 0))[0];
      return any ? any.id : null;
    }
    return this.genReview(item.id, signal);
  }
  async advanceRoot() {
    const s = this.s;
    if (s.deferred?.length && (s.done % 10 === 0 || !s.queue.length)) {
      this.startRoot(s.deferred.shift(), true);
      return;
    }
    if (s.checkpointDue && s.queue.length) {
      s.phase = "checkpoint";
      this.save();
      return;
    }
    while (s.queue.length) {
      const item = s.queue[0];
      let qid = null;
      if (this.prefetch && this.prefetch.item === item) {
        this.loading = { text: "Writing a review question\u2026" };
        this.emit();
        try {
          qid = await this.prefetch.promise;
        } catch (e) {
          qid = void 0;
        }
        this.prefetch = null;
      }
      if (qid === null || qid === void 0) {
        const needsWriting = this.s.opts?.adaptive !== false && item.k === "c" && !this.pickForConcept(item.id);
        if (needsWriting) {
          const c = this.m.concepts.get(item.id);
          this.loading = { text: `Writing a review question on ${c ? c.name : "a due concept"}\u2026` };
          s.phase = "loading";
          this.emit();
        }
        this.ctl = new AbortController();
        try {
          qid = await this.resolveItem(item, this.ctl.signal);
        } catch (e) {
          if (e && e.code === "cancelled") return;
          this.loading = { error: aiErrorMessage(e) || "Could not write the review question." };
          this.emit();
          return;
        }
      }
      s.queue.shift();
      this.loading = null;
      if (!qid) {
        s.total = Math.max(s.done, s.total - 1);
        continue;
      }
      this.startRoot(qid);
      return;
    }
    this.finish();
  }
  skipLoadingItem() {
    const s = this.s;
    if (s.queue.length) s.queue.shift();
    s.total = Math.max(s.done, s.total - 1);
    this.loading = null;
    this.advanceRoot();
  }
  retryLoading() {
    this.loading = null;
    this.advanceRoot();
  }
  prefetchNext() {
    const s = this.s;
    const item = s.queue[0];
    if (!item || item.k !== "c" || this.prefetch || !this.services.aiAvailable() || s.opts?.adaptive === false) return;
    if (this.pickForConcept(item.id)) return;
    const ctl = new AbortController();
    this.prefetch = { item, ctl, promise: this.genReview(item.id, ctl.signal) };
    this.prefetch.promise.catch(() => {
    });
  }
  startRoot(qid, retrying = false) {
    const s = this.s;
    s.retrying = retrying;
    s.rootQid = qid;
    s.stack = [{ qid, depth: 0, tries: 0 }];
    s.log = [];
    s.rootMissed = false;
    s.maxDepth = 0;
    s.phase = "question";
    s.last = null;
    s.next = null;
    this.pending = null;
    this.pendingError = null;
    this.save();
    this.prefetchNext();
  }
  submit(chosen) {
    const s = this.s;
    const cur = this.current();
    if (!cur || s.phase !== "question") return;
    const { entry, q } = cur;
    const correct = gradeAnswer(q, chosen);
    const previouslyMastered = new Set(masteredObjectives(this.m).map((o) => o.id));
    this.m.recordAnswer(q, chosen, correct);
    if (correct) {
      const earned = masteredObjectives(this.m).filter((o) => !previouslyMastered.has(o.id) && !s.celebratedObjectives?.includes(o.id));
      s.celebratedObjectives = [...s.celebratedObjectives || [], ...earned.map((o) => o.id)];
      s.masteryNotices = [...s.masteryNotices || [], ...earned.map((o) => ({ id: o.id, text: o.text, num: o.num, lecture: o.lecture }))];
    }
    s.log.push({ qid: q.id, depth: entry.depth, chosen, correct });
    s.last = { qid: q.id, chosen, correct };
    s.streak = correct && entry.depth === 0 && !s.rootMissed && !s.retrying ? (s.streak || 0) + 1 : correct ? s.streak || 0 : 0;
    if (correct) s.next = { type: entry.depth === 0 ? "root" : "climb" };
    else {
      s.rootMissed = true;
      entry.tries = (entry.tries || 0) + 1;
      if (s.opts?.adaptive === false) s.next = { type: s.retrying ? "repeat" : "defer", qid: s.rootQid };
      else if (entry.tries >= MAX_TRIES) s.next = { type: "giveup" };
      else if (!this.services.aiAvailable()) s.next = { type: "giveup", noAI: true };
      else if (entry.depth < MAX_DEPTH) s.next = { type: "deeper" };
      else s.next = { type: "retry" };
    }
    if (correct && entry.depth > 0) {
      const parent = s.stack[s.stack.length - 2];
      const pq = parent && this.m.questions.get(parent.qid);
      if (pq) this.m.linkPrereq(q.conceptId, pq.conceptId);
    }
    s.phase = "feedback";
    this.save();
    this.prepareNext();
  }
  prepareNext() {
    const s = this.s;
    const n = s.next;
    if (!n || !needsGen(n.type) || n.qid) return;
    this.pendingError = null;
    this.ctl = new AbortController();
    const signal = this.ctl.signal;
    this.pending = this.generate(n, signal).then((qid) => {
      const nq = qid && this.m.questions.get(qid);
      if (nq && this.services.autoExplain) this.services.explainQuestion(this.m, nq, null).catch(() => {
      });
      if (this.s !== s || s.next !== n) return qid;
      n.qid = qid;
      this.save();
      return qid;
    }, (e) => {
      if (e && e.code === "cancelled") return null;
      if (this.s === s && s.next === n) {
        this.pendingError = e;
        this.emit();
      }
      return null;
    });
    this.emit();
  }
  chainEntries() {
    const s = this.s;
    return s.log.map((l) => {
      const q = this.m.questions.get(l.qid);
      if (!q) return null;
      const c = this.m.concepts.get(q.conceptId);
      return { depth: l.depth, term: c ? c.name : q.term, q, chosen: l.chosen, correct: l.correct };
    }).filter(Boolean);
  }
  async generate(n, signal) {
    const s = this.s;
    const top = s.stack[s.stack.length - 1];
    const tq = this.m.questions.get(top.qid);
    const root = this.m.questions.get(s.rootQid) || tq;
    const types = s.opts?.types;
    if (n.type === "deeper" && types != null && !types.some((t) => t === "mcq" || t === "multi")) {
      n.type = "retry";
      return tq.id;
    }
    if (n.type === "deeper") {
      const entries = this.chainEntries();
      const query = entries.map((e) => `${e.term} ${e.q.stem} ${e.q.options.join(" ")} ${e.q.definition || ""}`).join("\n");
      const res = await this.services.askJSON(followupPrompt({
        course: this.m.name,
        entries,
        depth: top.depth + 1,
        optionCount: root.options && root.options.length >= 2 ? root.options.length : 5,
        conceptNames: this.m.conceptNames(),
        objectives: this.m.objectivesForPrompt(),
        materials: this.m.materialFor(query, 28e3, { preferSids: [root.sourceId, tq.sourceId].filter(Boolean) })
      }) + (types == null ? "" : types.includes("mcq") ? "\nUse single-choice format only: multi:false and exactly one correct answer." : "\nUse select-all-that-apply format only: multi:true and at least two correct answers. Explicitly instruct the student to select all that apply."), { signal, tier: this.services.getGen().examTier, reasoningEffort: this.services.getGen().examReasoning, kind: "followup" });
      if (res && res.outOfScope) {
        n.outOfScope = true;
        n.gap = String(res.gap || "");
        n.type = "retry";
        return this.generateVariant(tq, "retry", null, signal);
      }
      if (types != null) {
        const candidate = cleanQuestion(res);
        if (!candidate || !matchesTypes(candidate, types)) {
          n.type = "retry";
          return tq.id;
        }
      }
      const q = this.m.ingestQuestion(res, { origin: "followup", depth: top.depth + 1, parentId: tq.id, gap: res && res.gap, sourceId: root.sourceId, lecture: root.lecture, objectiveId: res && this.m.objective(res.objective) ? res.objective : null });
      if (!q) throw { code: "invalid_json" };
      n.gap = q.gap;
      return q.id;
    }
    if (n.type === "climb") {
      const parent = s.stack[s.stack.length - 2];
      const pq = this.m.questions.get(parent.qid);
      const childC = this.m.concepts.get(tq.conceptId);
      return this.generateVariant(pq, "climb", childC ? childC.name : tq.term, signal);
    }
    if (n.type === "retry") return this.generateVariant(tq, "retry", null, signal);
    return null;
  }
  async generateVariant(ref, reason, childTerm, signal) {
    if (this.s.opts?.adaptive === false || isInteractive(ref) || this.s.opts?.types != null && questionType(ref) === "image") return ref.id;
    const c = this.m.concepts.get(ref.conceptId);
    const res = await this.services.askJSON(variantPrompt({
      course: this.m.name,
      q: ref,
      term: c ? c.name : ref.term,
      summary: c ? c.summary : "",
      reason,
      childTerm,
      materials: this.m.materialFor(`${ref.term} ${formatQuestion(ref)} ${ref.definition || ""}`, 24e3, { preferSids: [ref.sourceId].filter(Boolean) })
    }), { signal, tier: this.services.getGen().examTier, reasoningEffort: this.services.getGen().examReasoning, kind: "followup" });
    if (this.s.opts?.types != null) {
      const candidate = cleanQuestion(res);
      if (!candidate || !matchesTypes(candidate, this.s.opts.types)) return ref.id;
    }
    const q = this.m.ingestQuestion(res, { origin: "variant", depth: ref.depth || 0, parentId: ref.id, sourceId: ref.sourceId, lecture: ref.lecture, forceConceptId: ref.conceptId, objectiveId: ref.objectiveId || null });
    if (!q) throw { code: "invalid_json" };
    return q.id;
  }
  retryGeneration() {
    if (this.s && this.s.next) {
      this.s.next.qid = null;
      this.prepareNext();
    }
  }
  async proceed() {
    const s = this.s;
    const n = s.next;
    if (!n) return;
    if (n.type === "repeat" && !usable(this.m.questions.get(n.qid))) {
      this.finalizeRoot(false);
      return this.advanceRoot();
    }
    if (n.type === "defer") {
      s.deferred = [...s.deferred || [], s.rootQid];
      this.finalizeRoot(false);
      return this.advanceRoot();
    }
    if (s.retrying && n.type === "root") {
      const result = s.results.find((r) => r.qid === s.rootQid && !r.resolved);
      if (result) {
        result.resolved = true;
        s.unresolved = Math.max(0, s.unresolved - 1);
        s.resolved++;
      }
      s.retrying = false;
      s.stack = [];
      s.log = [];
      s.next = null;
      s.last = null;
      return this.advanceRoot();
    }
    if (n.type === "root" || n.type === "giveup") {
      this.finalizeRoot(n.type === "root");
      return this.advanceRoot();
    }
    if (!n.qid) {
      if (!this.pending) this.prepareNext();
      const qid = await this.pending;
      if (!qid || this.s !== s || s.next !== n) return;
    }
    const top = s.stack[s.stack.length - 1];
    if (n.type === "deeper") {
      s.stack.push({ qid: n.qid, depth: top.depth + 1, tries: 0 });
      s.maxDepth = Math.max(s.maxDepth || 0, top.depth + 1);
    } else if (n.type === "climb") {
      s.stack.pop();
      s.stack[s.stack.length - 1].qid = n.qid;
    } else if (n.type === "retry" || n.type === "repeat") top.qid = n.qid;
    s.phase = "question";
    s.last = null;
    s.next = null;
    this.pending = null;
    this.pendingError = null;
    this.save();
  }
  dismissMastery() {
    this.s.masteryNotices = (this.s.masteryNotices || []).slice(1);
    this.save();
  }
  giveUpChain() {
    const s = this.s;
    if (this.ctl) this.ctl.abort();
    s.next = { type: "giveup" };
    this.pending = null;
    this.pendingError = null;
    this.finalizeRoot(false);
    this.advanceRoot();
  }
  finalizeRoot(resolved) {
    const s = this.s;
    const rq = this.m.questions.get(s.rootQid);
    const c = rq && this.m.concepts.get(rq.conceptId);
    s.results.push({ qid: s.rootQid, term: c ? c.name : rq ? rq.term : "", firstTry: !s.rootMissed, resolved: !s.rootMissed || resolved, depth: s.maxDepth || 0 });
    s.done++;
    if (s.done % 10 === 0 && s.done < s.total && (s.streak || 0) < 10) s.checkpointDue = true;
    if (!s.rootMissed) s.firstTry++;
    else if (resolved) s.resolved++;
    else s.unresolved++;
    s.stack = [];
    s.log = [];
    s.next = null;
    s.last = null;
  }
  finish() {
    const s = this.s;
    s.phase = "done";
    s.finishedAt = now();
    this.loading = null;
    this.save();
  }
  continueCheckpoint() {
    if (this.s?.phase !== "checkpoint") return;
    this.s.checkpointDue = false;
    return this.advanceRoot();
  }
  flag(qid, reason = "", flagged = true) {
    const q = this.m.questions.get(qid);
    if (!q) return;
    q.flagged = flagged;
    q.flagReason = flagged ? reason : "";
    this.m.updateQuestion(q);
    this.emit();
  }
  end() {
    if (this.ctl) this.ctl.abort();
    if (this.prefetch) this.prefetch.ctl.abort();
    this.m.clearSession();
  }
};
function needsGen(type) {
  return type === "deeper" || type === "climb" || type === "retry";
}
export {
  CourseModel,
  Exam,
  MAX_DEPTH,
  QUESTION_TYPES,
  bucket,
  cleanQuestion,
  conceptId,
  createSession,
  gradeAnswer,
  isDue,
  isInteractive,
  objectiveConcepts,
  questionType,
  summarize
};
