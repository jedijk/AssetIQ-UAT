import { createTranslator } from "../../../lib/i18n/translate";
import en from "../../../lib/i18n/en";
import nl from "../../../lib/i18n/nl";
import de from "../../../lib/i18n/de";
import { getProgressTourScenes } from "../progressTourSceneConfig";

const translations = { en, nl, de };

function flattenStrings(obj, prefix = "") {
  const entries = [];
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      entries.push(...flattenStrings(value, path));
    } else {
      entries.push([path, value]);
    }
  }
  return entries;
}

describe("progressObservationTour i18n", () => {
  test("nl and de include every progressObservationTour string key from en", () => {
    const enKeys = flattenStrings(en.progressObservationTour).map(([path]) => path);
    for (const locale of ["nl", "de"]) {
      const localeKeys = flattenStrings(translations[locale].progressObservationTour).map(
        ([path]) => path
      );
      expect(localeKeys.sort()).toEqual(enKeys.sort());
    }
  });

  test("getProgressTourScenes resolves localized copy for en, nl, and de", () => {
    for (const locale of ["en", "nl", "de"]) {
      const t = createTranslator(translations, locale);
      const scenes = getProgressTourScenes(t);

      expect(scenes).toHaveLength(12);
      scenes.forEach((scene) => {
        expect(scene.title).toEqual(expect.any(String));
        expect(scene.title.length).toBeGreaterThan(0);
        expect(scene.title).not.toMatch(/^progressObservationTour\./);

        expect(scene.narration).toEqual(expect.any(String));
        expect(scene.narration.length).toBeGreaterThan(0);
        expect(scene.narration).not.toMatch(/^progressObservationTour\./);

        expect(scene.actionHint).toEqual(expect.any(String));
        expect(scene.chapter).toEqual(expect.any(String));
      });

      expect(scenes[0].title).not.toBe(scenes[1].title);
      if (locale === "en") {
        expect(scenes[0].title).toBe("Open an Observation");
      }
      if (locale === "nl") {
        expect(scenes[0].title).toBe("Open een observatie");
      }
      if (locale === "de") {
        expect(scenes[0].title).toBe("Beobachtung öffnen");
      }
    }
  });
});
