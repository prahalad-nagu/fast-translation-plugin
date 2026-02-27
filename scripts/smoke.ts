import { createTranslator } from "../src/index.ts";

const apiKey = process.env.OPENAI_API_KEY?.trim();
if (!apiKey) {
  throw new Error("OPENAI_API_KEY is required to run smoke test");
}

const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
const targetLang = process.argv[2] ?? "es";
const cliTexts = process.argv.slice(3);
const texts =
  cliTexts.length > 0
    ? cliTexts
    : ["Login", "SignUp", "Please change the password", "Waiting for approval"];
const inputPricePer1M = Number(process.env.OPENAI_PRICE_INPUT_PER_1M ?? "0.15");
const outputPricePer1M = Number(process.env.OPENAI_PRICE_OUTPUT_PER_1M ?? "0.60");
const budgetUsd = process.env.OPENAI_CREDIT_BUDGET_USD
  ? Number(process.env.OPENAI_CREDIT_BUDGET_USD)
  : undefined;

const failures: Array<{ text: string; targetLang: string; error: string }> = [];
let promptTokensUsed = 0;
let completionTokensUsed = 0;
let totalTokensUsed = 0;

console.info(`Starting translation for ${texts.length} text(s) to '${targetLang}' using model '${model}'.`);
console.info(
  "Pending token count is not exposed before completion; actual token usage is logged after each response.",
);

const translator = createTranslator({
  apiKey,
  model,
  onError: (err, meta) => {
    const errorMessage = err.message || String(err);
    failures.push({ ...meta, error: errorMessage });
    console.error(
      `[translation-error] target=${meta.targetLang} text="${meta.text}" reason="${errorMessage}"`,
    );
  },
  onUsage: (usage) => {
    promptTokensUsed += usage.promptTokens;
    completionTokensUsed += usage.completionTokens;
    totalTokensUsed += usage.totalTokens;

    const requestCost =
      (usage.promptTokens / 1_000_000) * inputPricePer1M +
      (usage.completionTokens / 1_000_000) * outputPricePer1M;

    console.info(
      `[translation-usage] model=${usage.model} ${usage.sourceLang}->${usage.targetLang}` +
        ` prompt=${usage.promptTokens} completion=${usage.completionTokens}` +
        ` total=${usage.totalTokens} est_cost_usd=${requestCost.toFixed(6)}`,
    );
  },
});

const translated = await translator.translateBatch(texts, targetLang);

console.table(
  texts.map((source, index) => ({
    source,
    translated: translated[index],
  })),
);

if (failures.length > 0) {
  console.warn(`\n${failures.length} translation(s) failed and fell back to source text.`);
}

const estimatedRunCostUsd =
  (promptTokensUsed / 1_000_000) * inputPricePer1M +
  (completionTokensUsed / 1_000_000) * outputPricePer1M;

console.info("\nUsage Summary");
console.info(`- Prompt tokens used: ${promptTokensUsed}`);
console.info(`- Completion tokens used: ${completionTokensUsed}`);
console.info(`- Total tokens used: ${totalTokensUsed}`);
console.info(`- Estimated run cost (USD): ${estimatedRunCostUsd.toFixed(6)}`);

if (budgetUsd !== undefined && Number.isFinite(budgetUsd)) {
  const remaining = budgetUsd - estimatedRunCostUsd;
  console.info(`- Estimated remaining budget after this run (USD): ${Math.max(remaining, 0).toFixed(6)}`);
}

console.info(
  "- Remaining account credits are not exposed directly by this API key. " +
    "Use OpenAI Billing dashboard for exact remaining balance.",
);
