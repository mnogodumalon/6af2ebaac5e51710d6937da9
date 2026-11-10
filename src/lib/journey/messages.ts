/**
 * Required-field messages — WRITTEN BY THE BUILD AGENT, never by a heuristic.
 *
 * The layer knows two things about an empty required field: that it is
 * required and what its label is. Out of that it can only say „„Anreise" ist
 * ein Pflichtfeld". What the person should do instead („Bitte einen Gast
 * auswählen.") is meaning, and meaning is the agent's: the Phase-2 orchestrator
 * writes one short instruction per required field — what is needed, not why — to
 * `.intents-staging/messages.json`, the integration step validates it against
 * the app metadata and renders it into the block below. Scaffold updates keep
 * the block. Do not edit outside the markers.
 *
 * Every door reads this and nothing else: `useStepForm` (flows and public
 * pages), the generated {Entity}Dialog and the public form's server-error line.
 * A field without a sentence falls back to the label sentence — never to a
 * bare „Dieses Feld ist erforderlich".
 *
 * Required fields per entity (from the base view):
 *   - veranstaltungen: titel (Titel der Veranstaltung)
 *   - interaktionen: veranstaltung (Veranstaltung), reihenfolge (Reihenfolge), frage (Frage)
 *   - feedbacks: interaktion (Interaktion), kuerzel (Kürzel), feedback_text (Dein Feedback)
 *   - zusammenfassungen: interaktion (Interaktion)
 *   - abschlussbewertungen: veranstaltung (Veranstaltung), kuerzel (Kürzel)
 */
import { t, tx } from '@/i18n';
import { labelOf, type EntityKey } from './rules';

/** The writable fields of each entity — the keys a message may address (generated). */
export interface MessageFields {
  "veranstaltungen": "titel" | "datum" | "beschreibung";
  "interaktionen": "veranstaltung" | "reihenfolge" | "frage" | "erlaeuterung" | "vorprompt" | "endprompt" | "aktiv";
  "feedbacks": "interaktion" | "kuerzel" | "feedback_text" | "absende_kennung";
  "zusammenfassungen": "interaktion" | "zeitpunkt" | "zusammenfassung_text" | "ki_antwort";
  "abschlussbewertungen": "veranstaltung" | "kuerzel" | "besonders_toll" | "verbesserung" | "referenzstatement" | "email" | "einwilligung";
}
export type MessageFieldKey<E extends EntityKey> = E extends keyof MessageFields ? MessageFields[E] : never;

export const REQUIRED_MESSAGES: { [E in EntityKey]?: Partial<Record<MessageFieldKey<E>, string>> } = {
  // <custom:messages>
  veranstaltungen: { titel: "Bitte den Titel der Veranstaltung eingeben." },
  interaktionen: { veranstaltung: "Bitte eine Veranstaltung auswählen.", reihenfolge: "Bitte die Reihenfolge als Zahl eingeben.", frage: "Bitte die Frage eingeben." },
  feedbacks: { interaktion: "Bitte eine Interaktion auswählen.", kuerzel: "Bitte das Kürzel eingeben.", feedback_text: "Bitte dein Feedback eingeben." },
  zusammenfassungen: { interaktion: "Bitte eine Interaktion auswählen." },
  abschlussbewertungen: { veranstaltung: "Bitte eine Veranstaltung auswählen.", kuerzel: "Bitte das Kürzel eingeben." },
  // </custom:messages>
};

/** The sentence shown when `key` of `entity` is required and empty — the
 *  agent's own text (translated at runtime like every page string), else the
 *  label sentence. Call it while rendering, not at module scope. */
export function requiredMessage(entity: EntityKey, key: string): string {
  const own = (REQUIRED_MESSAGES as Record<string, Record<string, string | undefined> | undefined>)[entity]?.[key];
  if (own && own.trim()) return tx(own);
  return t('v_required', { label: labelOf(entity, key) });
}

/** True when the agent wrote a sentence for the field. */
export function hasOwnMessage(entity: EntityKey, key: string): boolean {
  const own = (REQUIRED_MESSAGES as Record<string, Record<string, string | undefined> | undefined>)[entity]?.[key];
  return Boolean(own && own.trim());
}
