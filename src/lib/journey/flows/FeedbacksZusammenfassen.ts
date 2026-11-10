/**
 * useFeedbacksZusammenfassenFlow — the plumbing of the flow « Feedbacks zusammenfassen », generated from the plan.
 *
 * Writes `zusammenfassungen`: asks `interaktion`; sets `zeitpunkt` itself.
 * The hook OWNS: the form(s) with exactly these fields and the plan's required
 * ingredients, one record search per picked field (columns and filter from
 * the plan), and the submit plan with its fixed and derived values. A page
 * that only calls `flow.submit.run()` cannot write a field the plan does not
 * know — there is no way to spell it.
 *
 * YOU decide what a person notices, through the options:
 *   steps     which wizard step asks which field (default: one step per pick,
 *             then one for the typed fields, then "Prüfen" = step 2)
 *   items     how a search hit is displayed per pick (title, subtitle, status …)
 *   initial   prefills for typed fields
 *   messages  the sentence for an empty required field, per field
 *   compute   REQUIRED — the plan says these values are computed in the flow
 *             but leaves the rule to you: `zusammenfassung_text` (derived:computed:Vorprompt der Interaktion, dann jedes Feedback der Interaktion der Reihe nach mit seinem Kürzel, zuletzt der Endprompt) *
 *   const flow = useFeedbacksZusammenfassenFlow({
 *     steps: { interaktion: 1 },
 *     items: { interaktion: r => ({ id: r.id, title: fieldText(r, 'frage') }) },
 *     compute: { zusammenfassung_text: forms => null },
 *   });
 *   <IntentWizardShell forms={flow.forms} draftKey={flow.draftKey} …>
 *     <EntitySelectStep {...flow.picks.interaktion.select} {...flow.pick('interaktion')} />
 *     <StepNav onNext={() => flow.validateStep(n)} />
 *     {!flow.submit.done && <SummaryStep forms={flow.formList} submit={flow.submit} />}
 *     {flow.submit.result && <SuccessStep result={flow.submit.result} forms={flow.formList} submit={flow.submit} />}
 *   </IntentWizardShell>
 */
import { useEffect, useRef, useState } from 'react';
import { readJourneyExtra, writeJourneyExtra } from '@/lib/journey/draft';
import { nounOne } from '@/config/plan';
import {
  useStepForm, useJourneySubmit, useRecordSearch,
  fieldText, fieldLookup, fieldLookups, fieldNumber, fieldDate, fieldRef,
  todayIso, nowIso, isEmptyValue, policyFixedValue, withPickPolicy, usePolicyVersion,  type StepForm, type JourneyRecord, type RefContext, type SelectItemLike, type FormValues, type PlanStep,} from '@/lib/journey';
import { servicePort } from '@/services/journeyPort';
import { pickHint, whereSentence, type PickWhere } from '@/lib/journey/policy';
import { labelOf, optionsOf, type EntityKey } from '@/lib/journey/rules';
import { entityLabel } from '@/lib/journey/rules';

export type FeedbacksZusammenfassenFieldKey = 'interaktion';

export interface FeedbacksZusammenfassenForms {
  zusammenfassungen: StepForm<'zusammenfassungen'>;
}

// Alias so the option generics stay readable.
type Key = FeedbacksZusammenfassenFieldKey;

export interface FeedbacksZusammenfassenFlowOptions {
  /** field → wizard step that asks it; drives „Ändern“ links and answer chips. */
  steps?: Partial<Record<Key, number>>;
  initial?: Partial<Record<Key, unknown>>;
  messages?: Partial<Record<Key, string>>;
  /** How a search hit reads — the card's title/subtitle/status per pick. */
  items?: {
    interaktion?: (record: JourneyRecord, ctx: RefContext) => SelectItemLike;
  };
  /** A page-side narrowing per pick, on top of the plan's filter (J-3): the
   *  questions of the picked event, the open ones — `r => fieldRef(r, 'veranstaltung') === eventId`. */
  where?: {
    interaktion?: (record: JourneyRecord) => boolean;
  };
  /** The plan computes these in the flow but leaves the rule to the page. */
  compute: {
    zusammenfassung_text: (forms: FeedbacksZusammenfassenForms) => unknown;   // derived:computed:Vorprompt der Interaktion, dann jedes Feedback der Interaktion der Reihe nach mit seinem Kürzel, zuletzt der Endprompt
  };
}

const DEFAULT_STEPS: Record<string, number> = {"interaktion": 1};
export const FEEDBACKSZUSAMMENFASSEN_REVIEW_STEP = 2;

function fromPick<T>(pick: { recordOf(id: string): JourneyRecord | undefined }, form: StepForm, field: string, read: (r: JourneyRecord) => T): T | undefined {
  const id = form.get(field);
  const rec = typeof id === 'string' && id ? pick.recordOf(id) : undefined;
  return rec ? read(rec) : undefined;
}
// local calendar day — the ISO-string of a Date is UTC and flips the date in the evening (J-7)
function isoDaysFromToday(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Returns T, not Partial<T>: a Record's index signature is already "maybe
// absent", and Partial<Record<string, string>> does not assign to the
// Record<string, string> useStepForm wants (tsc, live 23.09.2026 — eight
// errors, one per hook, caught only in the sandbox build).
function only<T extends Record<string, unknown>>(obj: T | undefined, keys: string[]): T | undefined {
  if (!obj) return undefined;
  const out: Record<string, unknown> = {};
  for (const k of keys) if (k in obj) out[k] = obj[k];
  return out as T;
}

function hasValues(form: StepForm): boolean {
  return form.keys.some(k => !isEmptyValue(form.values[k]));
}

export function useFeedbacksZusammenfassenFlow(options: FeedbacksZusammenfassenFlowOptions) {
  const steps = { ...DEFAULT_STEPS, ...(options.steps ?? {}) } as Record<string, number>;
  const zusammenfassungen = useStepForm('zusammenfassungen', {
    fields: ["interaktion"],
    steps: only(steps, ["interaktion"]) as Record<string, number>,
    // the plan builds a value from these — required here, whatever the app's base view says
    required: { interaktion: true },
    initial: only(options.initial as FormValues | undefined, ["interaktion"]),
    messages: only(options.messages as Record<string, string> | undefined, ["interaktion"]),
  });
  const forms: FeedbacksZusammenfassenForms = { zusammenfassungen };
  // the editor of a list is not a record of its own: the review and the success
  // page read the entries (PlanStep.review), never the half-filled editor
  const formList: StepForm[] = [zusammenfassungen];
  // The owner's rules after the build (intent-policies.json): a fixed value
  // for a field this flow sets itself, a narrower or wider pick — read at
  // render time, so a change works on the running application.
  usePolicyVersion();
  const searches = {
    interaktion: useRecordSearch(servicePort, 'interaktionen', withPickPolicy('interaktion', {
      searchFields: ["frage", "erlaeuterung", "vorprompt", "endprompt"] as never,
      where: options.where?.interaktion,
      toItem: options.items?.interaktion as never,
    })),
  };
  // Whether a pick offers „Neu anlegen“ is the plan's call: off for the record
  // this flow changes, for multi picks, for a catalogue entity and for an
  // entity with its own flow. The page spreads `.select` and writes no `create=`.
  // what the person sees under the search field: the rule that narrows the
  // pick (the owner's, else the plan's) — and the link that changes it
  const hintFor = (key: string, entity: EntityKey, planned: PickWhere | null) => pickHint(key, planned,
    w => whereSentence(w, f => labelOf(entity, f), (f, v) => optionsOf(entity, f).find(o => o.key === String(v))?.label ?? String(v)),
    `#/verwaltung/anwendung?line=intent:feedbacks-zusammenfassen:read:${entity}`);
  const picks = {
    interaktion: { ...searches.interaktion, select: { ...searches.interaktion.select, create: true as boolean, hint: hintFor('interaktion', 'interaktionen', null as PickWhere | null) } },
  };

  const plan: PlanStep[] = [
    {
      key: 'zusammenfassungen', entity: 'zusammenfassungen', form: zusammenfassungen, label: nounOne('zusammenfassungen', entityLabel('zusammenfassungen')), primary: true,
      values: (): FormValues => ({
        zeitpunkt: policyFixedValue('zusammenfassungen', 'zeitpunkt') ?? nowIso(),
        zusammenfassung_text: options.compute.zusammenfassung_text(forms),
      }),
    },
  ];

  const submit = useJourneySubmit(servicePort, plan, { draftKey: 'feedbacks-zusammenfassen' });

  // A typed field the plan prefills from the picked record (`user:from_pick`),
  // still the person's to change: filled once, only while empty (PV-12)
  const prefillFrom = (pickKey: string, rec: JourneyRecord) => {
    void pickKey; void rec;
  };

  // Opened with `?<field>=<value>` for a field this flow asks — a dashboard
  // link that pre-picks the event, a form that hands the question on (J-2):
  // a typed field takes the value while it is empty (a draft wins), a pick
  // loads the record, takes it into the pick and selects it WITH its name.
  // `initial` with a bare record id gets its name the same way.
  const [linkedParams] = useState(() => new URLSearchParams(window.location.hash.split('?')[1] ?? ''));
  useEffect(() => {
    let on = true;
    const coerce = (form: StepForm, key: string, raw: string): unknown => {
      const kind = form.rules[key]?.kind;
      if (kind === 'number') { const n = Number(raw); return Number.isFinite(n) ? n : raw; }
      if (kind === 'bool') return raw === 'true' || raw === '1' || raw === 'ja';
      return raw;
    };
    {
      const cur = forms.zusammenfassungen.get('interaktion');
      const fromLink = linkedParams.get('interaktion');
      const unnamed = typeof cur === 'string' && cur !== '' && !forms.zusammenfassungen.labels[cur] ? cur : null;
      const id = fromLink && isEmptyValue(cur) ? fromLink : unnamed;
      if (id) void servicePort.get('interaktionen', id).then(rec => {
        if (!on || !rec) return;
        picks.interaktion.adopt(rec);
        const name = picks.interaktion.labelOf(rec.id) ?? rec.id;
        (forms.zusammenfassungen.set as (k: string, v: unknown, l?: string) => void)('interaktion', rec.id, name);
        prefillFrom('interaktion', rec);
      }).catch(() => undefined);
    }
    return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per link
  }, []);

  /** Props for a single-record pick step: {...flow.picks.x.select} {...flow.pick('x')} */
  const pick = (field: FeedbacksZusammenfassenFieldKey) => {
    const owner = formList.find(f => f.keys.includes(field)) ?? formList[0];
    const search = (picks as Record<string, { labelOf(id: string): string | undefined; recordOf?(id: string): JourneyRecord | undefined }>)[field];
    return {
      selectedId: (typeof owner.get(field) === 'string' ? (owner.get(field) as string) : null) || null,
      // `field as never` collapsed the conditional SetArgs<E, never> to never and
      // no argument was assignable any more (tsc, live 23.09.2026); widen `set`
      // itself instead — the label stays a required third argument.
      onSelect: (id: string) => {
        (owner.set as (k: string, v: unknown, l?: string) => void)(field, id, search?.labelOf(id));
        const rec = search?.recordOf?.(id);
        if (rec) prefillFrom(field, rec);
      },
    };
  };
  /** Props for a multi-record pick step: {...flow.picks.x.select} {...flow.pickMany('x')} */
  const pickMany = (field: FeedbacksZusammenfassenFieldKey) => {
    const owner = formList.find(f => f.keys.includes(field)) ?? formList[0];
    const search = (picks as Record<string, { labelOf(id: string): string | undefined }>)[field];
    return owner.records(field, id => search?.labelOf(id));
  };
  /** Validate every field the wizard asks in step `n` — for StepNav.onNext. */
  const validateStep = (n: number): boolean =>
    formList.every(f => f.validate(f.keys.filter(k => steps[k] === n)));
  const reset = () => { submit.reset(); formList.forEach(f => f.reset()); };

  return {
    slug: 'feedbacks-zusammenfassen' as const,
    draftKey: 'feedbacks-zusammenfassen' as const,    entity: 'zusammenfassungen' as const,
    form: zusammenfassungen,
    forms, formList, picks, submit, steps,    reviewStep: FEEDBACKSZUSAMMENFASSEN_REVIEW_STEP,
    pick, pickMany, validateStep, reset,    // the door the hook reads through — for what it does not own: availability
    // (useOccupancy(flow.port, …)), a count (useRecordCount(flow.port, …)). A page
    // importing servicePort next to the hook fails gate 3 (fewo 05.10.2026: the
    // gate taught useOccupancy(servicePort, …) and forbade servicePort at once)
    port: servicePort,
  };
}

export type FeedbacksZusammenfassenFlow = ReturnType<typeof useFeedbacksZusammenfassenFlow>;
