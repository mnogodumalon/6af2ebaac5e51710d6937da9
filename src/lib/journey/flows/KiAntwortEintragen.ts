/**
 * useKiAntwortEintragenFlow — the plumbing of the flow « KI-Antwort eintragen », generated from the plan.
 *
 * Changes `zusammenfassungen`: the record to change is picked (`flow.pick('zusammenfassungen')`), the form is prefilled with its values; asks `ki_antwort`.
 * The hook OWNS: the form(s) with exactly these fields and the plan's required
 * ingredients, one record search per picked field (columns and filter from
 * the plan), and the submit plan with its fixed and derived values. A page
 * that only calls `flow.submit.run()` cannot write a field the plan does not
 * know — there is no way to spell it.
 *
 * YOU decide what a person notices, through the options:
 *   steps     which wizard step asks which field (default: one step per pick,
 *             then one for the typed fields, then "Prüfen" = step 3)
 *   items     how a search hit is displayed per pick (title, subtitle, status …)
 *   initial   prefills for typed fields
 *   messages  the sentence for an empty required field, per field
 *
 *   const flow = useKiAntwortEintragenFlow({
 *     steps: { zusammenfassungen: 1, ki_antwort: 2 },
 *     items: { zusammenfassungen: r => ({ id: r.id, title: fieldText(r, 'zusammenfassung_text') }) },
 *   });
 *   <IntentWizardShell forms={flow.forms} draftKey={flow.draftKey} …>
 *     // the record this flow changes: <EntitySelectStep {...flow.picks.zusammenfassungen.select} {...flow.pick('zusammenfassungen')} />
 *     <Bound form={flow.forms.zusammenfassungen} name="ki_antwort" />
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
import { requestWizardStep } from '@/lib/journey/useStepForm';
import { reportReadFailure } from '@/lib/journey/readFailures';
import { pickHint, whereSentence, type PickWhere } from '@/lib/journey/policy';
import { labelOf, optionsOf, type EntityKey } from '@/lib/journey/rules';
import { entityLabel } from '@/lib/journey/rules';

export type KiAntwortEintragenFieldKey = 'ki_antwort' | 'zusammenfassungen';

export interface KiAntwortEintragenForms {
  zusammenfassungen: StepForm<'zusammenfassungen'>;
}

// Alias so the option generics stay readable.
type Key = KiAntwortEintragenFieldKey;

export interface KiAntwortEintragenFlowOptions {
  /** field → wizard step that asks it; drives „Ändern“ links and answer chips. */
  steps?: Partial<Record<Key, number>>;
  initial?: Partial<Record<Key, unknown>>;
  messages?: Partial<Record<Key, string>>;
  /** How a search hit reads — the card's title/subtitle/status per pick. */
  items?: {
    zusammenfassungen?: (record: JourneyRecord, ctx: RefContext) => SelectItemLike;
  };
  /** A page-side narrowing per pick, on top of the plan's filter (J-3): the
   *  questions of the picked event, the open ones — `r => fieldRef(r, 'veranstaltung') === eventId`. */
  where?: {
    zusammenfassungen?: (record: JourneyRecord) => boolean;
  };
}

const DEFAULT_STEPS: Record<string, number> = {"ki_antwort": 2, "zusammenfassungen": 1};
export const KIANTWORTEINTRAGEN_REVIEW_STEP = 3;

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
// The picked record as `?record=<id>` in the address — a reload or a shared
// address opens the flow on the same record (J-8). replaceState: no navigation.
function mirrorRecordParam(id: string | null): void {
  try {
    const [base, query = ''] = window.location.hash.split('?');
    const q = new URLSearchParams(query);
    if (id) q.set('record', id); else q.delete('record');
    const qs = q.toString();
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}${base}${qs ? `?${qs}` : ''}`);
  } catch {
    /* ignore */
  }
}

export function useKiAntwortEintragenFlow(options: KiAntwortEintragenFlowOptions = {}) {
  const steps = { ...DEFAULT_STEPS, ...(options.steps ?? {}) } as Record<string, number>;
  const [zusammenfassungenTargetId, setZusammenfassungenTargetId] = useState<string | null>(null);
  const zusammenfassungen = useStepForm('zusammenfassungen', {
    fields: ["ki_antwort"],
    steps: only(steps, ["ki_antwort"]) as Record<string, number>,
    initial: only(options.initial as FormValues | undefined, ["ki_antwort"]),
    messages: only(options.messages as Record<string, string> | undefined, ["ki_antwort"]),
  });
  const forms: KiAntwortEintragenForms = { zusammenfassungen };
  // the editor of a list is not a record of its own: the review and the success
  // page read the entries (PlanStep.review), never the half-filled editor
  const formList: StepForm[] = [zusammenfassungen];
  // The owner's rules after the build (intent-policies.json): a fixed value
  // for a field this flow sets itself, a narrower or wider pick — read at
  // render time, so a change works on the running application.
  usePolicyVersion();
  const searches = {
    zusammenfassungen: useRecordSearch(servicePort, 'zusammenfassungen', withPickPolicy('zusammenfassungen', {
      searchFields: ["zusammenfassung_text", "ki_antwort"] as never,
      where: options.where?.zusammenfassungen,
      toItem: options.items?.zusammenfassungen as never,
    })),
  };
  // Whether a pick offers „Neu anlegen“ is the plan's call: off for the record
  // this flow changes, for multi picks, for a catalogue entity and for an
  // entity with its own flow. The page spreads `.select` and writes no `create=`.
  // what the person sees under the search field: the rule that narrows the
  // pick (the owner's, else the plan's) — and the link that changes it
  const hintFor = (key: string, entity: EntityKey, planned: PickWhere | null) => pickHint(key, planned,
    w => whereSentence(w, f => labelOf(entity, f), (f, v) => optionsOf(entity, f).find(o => o.key === String(v))?.label ?? String(v)),
    `#/verwaltung/anwendung?line=intent:ki-antwort-eintragen:read:${entity}`);
  const picks = {
    zusammenfassungen: { ...searches.zusammenfassungen, select: { ...searches.zusammenfassungen.select, create: false as boolean, hint: hintFor('zusammenfassungen', 'zusammenfassungen', null as PickWhere | null) } },
  };

  const plan: PlanStep[] = [
    {
      key: 'zusammenfassungen', entity: 'zusammenfassungen', form: zusammenfassungen, label: nounOne('zusammenfassungen', entityLabel('zusammenfassungen')), primary: true,
      updates: () => zusammenfassungenTargetId ?? undefined,
      // the review names the record this step changes; "Ändern" leads back to its pick
      target: () => zusammenfassungenTargetId
        ? { key: 'target:zusammenfassungen', label: nounOne('zusammenfassungen', entityLabel('zusammenfassungen')), value: picks.zusammenfassungen.labelOf(zusammenfassungenTargetId) ?? zusammenfassungenTargetId, step: steps.zusammenfassungen }
        : undefined,    },
  ];

  const submit = useJourneySubmit(servicePort, plan, { draftKey: 'ki-antwort-eintragen' });

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
    { const v = linkedParams.get('ki_antwort'); if (v !== null && isEmptyValue(zusammenfassungen.get('ki_antwort'))) (zusammenfassungen.set as (k: string, v: unknown) => void)('ki_antwort', coerce(zusammenfassungen, 'ki_antwort', v)); }
    return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per link
  }, []);

  /** The record(s) this flow CHANGES: picked through {...flow.picks.<entity>.select} {...flow.pick('<entity>')};
   *  picking prefills the form with the record's current values, and the plan step updates that record. */
  const targets = {
    zusammenfassungen: {
      selectedId: zusammenfassungenTargetId,
      onSelect: (id: string) => {
        setZusammenfassungenTargetId(id);
        const rec = picks.zusammenfassungen.recordOf(id);
        if (rec) zusammenfassungen.reset({ ki_antwort: fieldText(rec, "ki_antwort"), });
        // survives a reload: in the draft's side data, and as `?record=` in the address (J-8)
        writeJourneyExtra('ki-antwort-eintragen', 'target:zusammenfassungen', id);
        mirrorRecordParam(id);
      },
      get record(): JourneyRecord | undefined { return zusammenfassungenTargetId ? picks.zusammenfassungen.recordOf(zusammenfassungenTargetId) : undefined; },
    },
  };
  // Opened for one record — `#/intents/ki-antwort-eintragen?record=<id>`, the dashboard's
  // flowActionFor(): that record is the one to change. Loaded, taken into the
  // pick and selected — when this flow may change it at all (the pick's rule).
  // After a reload the pick comes back the same way: from the address, else
  // from the draft's side data (J-8).
  const [linkedId] = useState(() => new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('record')
    ?? readJourneyExtra<string>('ki-antwort-eintragen', 'target:zusammenfassungen'));
  useEffect(() => {
    if (!linkedId) return;
    let on = true;
    void servicePort.get('zusammenfassungen', linkedId).then(rec => {
      if (!on || !rec) return;
      reportReadFailure('ki-antwort-eintragen:linked', null);
      picks.zusammenfassungen.adopt(rec);
      targets.zusammenfassungen.onSelect(rec.id);
      // the link named the record — start after the steps that pick it, without the start screen
      const after = Math.max(...Object.keys(targets).map(k => steps[k] ?? 1)) + 1;
      if (new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('record') === linkedId) requestWizardStep(after);
    }).catch(() => { if (on) reportReadFailure('ki-antwort-eintragen:linked', 'zusammenfassungen'); });
    return () => { on = false; reportReadFailure('ki-antwort-eintragen:linked', null); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per link
  }, [linkedId]);
  /** Props for a single-record pick step: {...flow.picks.x.select} {...flow.pick('x')} */
  const pick = (field: KiAntwortEintragenFieldKey) => {
    if (field in targets) {
      const t = targets[field as keyof typeof targets];
      return { selectedId: t.selectedId, onSelect: t.onSelect };
    }
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
  const pickMany = (field: KiAntwortEintragenFieldKey) => {
    const owner = formList.find(f => f.keys.includes(field)) ?? formList[0];
    const search = (picks as Record<string, { labelOf(id: string): string | undefined }>)[field];
    return owner.records(field, id => search?.labelOf(id));
  };
  /** Validate every field the wizard asks in step `n` — for StepNav.onNext. */
  const validateStep = (n: number): boolean =>
    formList.every(f => f.validate(f.keys.filter(k => steps[k] === n)))    && Object.entries(targets).every(([k, t]) => steps[k] !== n || !!t.selectedId);
  const reset = () => { submit.reset(); formList.forEach(f => f.reset()); setZusammenfassungenTargetId(null); writeJourneyExtra('ki-antwort-eintragen', 'target:zusammenfassungen', null); mirrorRecordParam(null); };

  return {
    slug: 'ki-antwort-eintragen' as const,
    draftKey: 'ki-antwort-eintragen' as const,    entity: 'zusammenfassungen' as const,
    form: zusammenfassungen,
    forms, formList, picks, submit, steps, targets,    reviewStep: KIANTWORTEINTRAGEN_REVIEW_STEP,
    pick, pickMany, validateStep, reset,    // the door the hook reads through — for what it does not own: availability
    // (useOccupancy(flow.port, …)), a count (useRecordCount(flow.port, …)). A page
    // importing servicePort next to the hook fails gate 3 (fewo 05.10.2026: the
    // gate taught useOccupancy(servicePort, …) and forbade servicePort at once)
    port: servicePort,
  };
}

export type KiAntwortEintragenFlow = ReturnType<typeof useKiAntwortEintragenFlow>;
