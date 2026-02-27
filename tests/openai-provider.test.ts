import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCreate, MockOpenAI } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  MockOpenAI: vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: mockCreate,
      },
    },
  })),
}));

vi.mock("openai", () => ({
  default: MockOpenAI,
}));

import { OpenAITranslationProvider } from "../src/providers/openai.js";

describe("OpenAITranslationProvider", () => {
  beforeEach(() => {
    mockCreate.mockReset();
    MockOpenAI.mockClear();
  });

  it("sends translation prompt and returns normalized text", async () => {
    const onUsage = vi.fn();
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: '"Iniciar sesión"' } }],
      usage: {
        prompt_tokens: 32,
        completion_tokens: 4,
        total_tokens: 36,
      },
    });

    const provider = new OpenAITranslationProvider({
      apiKey: "test-key",
      model: "gpt-4o-mini",
      onUsage,
    });

    const result = await provider.translate("Login", "en", "es", {
      timeoutMs: 2000,
      preserveFormatting: true,
      context: "Authentication button",
    });

    expect(result).toBe("Iniciar sesión");
    expect(mockCreate).toHaveBeenCalledTimes(1);

    const [body, requestOptions] = mockCreate.mock.calls[0];
    expect(body.model).toBe("gpt-4o-mini");
    expect(body.messages[0].content).toContain("translation engine");
    expect(body.messages[0].content).toContain("Preserve placeholders");
    expect(body.messages[1].content).toContain("Source language: en");
    expect(body.messages[1].content).toContain("Target language: es");
    expect(body.messages[1].content).toContain("Text: Login");
    expect(requestOptions.signal).toBeDefined();
    expect(onUsage).toHaveBeenCalledWith({
      model: "gpt-4o-mini",
      sourceLang: "en",
      targetLang: "es",
      promptTokens: 32,
      completionTokens: 4,
      totalTokens: 36,
    });
  });

  it("throws when provider returns empty content", async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: null } }],
    });

    const provider = new OpenAITranslationProvider({ apiKey: "test-key" });

    await expect(
      provider.translate("Login", "en", "es", {
        timeoutMs: 2000,
        preserveFormatting: false,
      }),
    ).rejects.toThrow("OpenAI returned an empty translation");
  });

  it("requires an apiKey", () => {
    expect(() => new OpenAITranslationProvider({ apiKey: "" })).toThrow(
      "OpenAI apiKey is required",
    );
  });

  it("forwards dangerouslyAllowBrowser option to OpenAI client", () => {
    new OpenAITranslationProvider({
      apiKey: "test-key",
      dangerouslyAllowBrowser: true,
    });

    expect(MockOpenAI).toHaveBeenCalledWith({
      apiKey: "test-key",
      dangerouslyAllowBrowser: true,
    });
  });
});
