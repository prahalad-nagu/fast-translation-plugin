import { describe, expect, it, vi } from "vitest";

import type { TranslationProvider } from "../src/providers/base.js";
import { TranslatorService } from "../src/translator.js";

function createMockProvider(): { provider: TranslationProvider; translate: ReturnType<typeof vi.fn> } {
  const translate = vi.fn(async (text: string, _source: string, target: string) => `${text}-${target}`);
  return { provider: { translate }, translate };
}

describe("TranslatorService", () => {
  it("translates a simple string", async () => {
    const { provider, translate } = createMockProvider();
    translate.mockResolvedValueOnce("Iniciar sesión");

    const translator = new TranslatorService(provider);
    const result = await translator.translateText("Login", "es");

    expect(result).toBe("Iniciar sesión");
    expect(translate).toHaveBeenCalledTimes(1);
  });

  it("returns cached translation on repeated call", async () => {
    const { provider, translate } = createMockProvider();
    translate.mockResolvedValue("Iniciar sesión");

    const translator = new TranslatorService(provider);

    const first = await translator.translateText("Login", "es");
    const second = await translator.translateText("Login", "es");

    expect(first).toBe("Iniciar sesión");
    expect(second).toBe("Iniciar sesión");
    expect(translate).toHaveBeenCalledTimes(1);
  });

  it("preserves placeholders by default", async () => {
    const { provider, translate } = createMockProvider();
    translate.mockResolvedValue("Bienvenido {name}");

    const translator = new TranslatorService(provider);
    const result = await translator.translateText("Welcome {name}", "es");

    const call = translate.mock.calls[0];
    expect(call[3].preserveFormatting).toBe(true);
    expect(result).toContain("{name}");
  });

  it("translates batch in original order and deduplicates identical texts", async () => {
    const { provider, translate } = createMockProvider();
    translate.mockImplementation(async (text: string, _source: string, target: string) => {
      if (text === "Login") {
        return `Acceso-${target}`;
      }
      return `Registro-${target}`;
    });

    const translator = new TranslatorService(provider);
    const result = await translator.translateBatch(["Login", "SignUp", "Login"], "es");

    expect(result).toEqual(["Acceso-es", "Registro-es", "Acceso-es"]);
    expect(translate).toHaveBeenCalledTimes(2);
  });

  it("falls back to source text when provider fails", async () => {
    const { provider, translate } = createMockProvider();
    translate.mockRejectedValue(new Error("timeout"));

    const translator = new TranslatorService(provider);
    const result = await translator.translateText("Waiting for approval", "es", { timeoutMs: 1 });

    expect(result).toBe("Waiting for approval");
  });

  it("calls onError when provider fails", async () => {
    const { provider, translate } = createMockProvider();
    const onError = vi.fn();
    translate.mockRejectedValue(new Error("provider unavailable"));

    const translator = new TranslatorService(provider, { onError });
    const result = await translator.translateText("Please change the password", "es");

    expect(result).toBe("Please change the password");
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][1]).toEqual({
      text: "Please change the password",
      targetLang: "es",
    });
  });

  it("supports language aliases and rejects unsupported language codes", async () => {
    const { provider, translate } = createMockProvider();
    translate.mockResolvedValue("Iniciar sesión");

    const translator = new TranslatorService(provider);

    await expect(translator.translateText("Login", "Spanish")).resolves.toBe("Iniciar sesión");
    await expect(translator.translateText("Login", "xx")).rejects.toThrow(
      "target language 'xx' is not supported",
    );
  });

  it("deduplicates in-flight concurrent requests", async () => {
    const { provider, translate } = createMockProvider();

    let release: ((value: string) => void) | undefined;
    const pending = new Promise<string>((resolve) => {
      release = resolve;
    });
    translate.mockReturnValue(pending);

    const translator = new TranslatorService(provider);

    const firstRequest = translator.translateText("Login", "es");
    const secondRequest = translator.translateText("Login", "es");

    expect(translate).toHaveBeenCalledTimes(1);

    release?.("Iniciar sesión");

    await expect(firstRequest).resolves.toBe("Iniciar sesión");
    await expect(secondRequest).resolves.toBe("Iniciar sesión");
    expect(translate).toHaveBeenCalledTimes(1);
  });
});
