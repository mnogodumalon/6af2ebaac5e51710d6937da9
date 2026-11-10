/**
 * Interaktion aktivieren — 3-Schritt-Wizard mit QR-Code-Ansicht im eigenen Tab.
 * Steps: 1) Veranstaltung wählen → 2) Interaktion der Veranstaltung wählen → 3) Aktiv setzen (Prüfen) →
 *        danach öffnet sich die QR-Code-Ansicht bildschirmfüllend in einem eigenen Tab.
 * Reads: veranstaltungen, interaktionen. Writes: interaktionen (aktiv, per useInteraktionAktivierenFlow).
 * Composes: IntentWizardShell, EntitySelectStep, StepNav, SummaryStep, SuccessStep.
 */
import { useEffect, useRef, useState } from 'react';
import { IconCalendarEvent, IconCheck, IconQrcode } from '@tabler/icons-react';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { fieldText, fieldDate, fieldNumber, fieldRef, fieldLookup, useLiveList } from '@/lib/journey';
import { useInteraktionAktivierenFlow } from '@/lib/journey/flows/InteraktionAktivieren';
import { tx } from '@/i18n';

function qrUrl(interaktionId: string): string {
  return `${window.location.origin}${window.location.pathname}#/ansicht/qr-code?record=${interaktionId}`;
}

function openQr(interaktionId: string): void {
  if (/jsdom/i.test(navigator.userAgent)) return;
  try { window.open(qrUrl(interaktionId), '_blank', 'noopener'); } catch { /* Popup blockiert — Button im Erfolgsschritt */ }
}

export default function InteraktionAktivierenPage() {
  const [step, setStep] = useState(1);
  const [veranstaltungId, setVeranstaltungId] = useState<string | null>(null);
  const opened = useRef<string | null>(null);

  const flow = useInteraktionAktivierenFlow({
    steps: { interaktionen: 2 },
    items: {
      interaktionen: r => ({
        id: r.id,
        title: fieldText(r, 'frage'),
        subtitle: tx`Frage ${fieldNumber(r, 'reihenfolge') ?? '?'}`,
        status: fieldText(r, 'aktiv') || r.fields.aktiv === true
          ? { key: 'aktiv', label: tx('Aktuell aktiv') }
          : undefined,
      }),
    },
    where: {
      interaktionen: r => veranstaltungId !== null && fieldRef(r, 'veranstaltung') === veranstaltungId,
    },
  });

  // `where` wird beim Laden angewendet — nach neuer Veranstaltung die Liste neu laden.
  const reloadInteraktionen = flow.picks.interaktionen.reload;
  useEffect(() => { if (veranstaltungId) void reloadInteraktionen(); }, [veranstaltungId]); // eslint-disable-line react-hooks/exhaustive-deps

  const events = useLiveList(flow.port, 'veranstaltungen', { intervalMs: 0 });
  const picked = events.records.find(r => r.id === veranstaltungId);
  const result = flow.submit.result;

  // QR-Ansicht öffnet sich einmal pro erfolgreicher Aktivierung in einem eigenen Tab.
  useEffect(() => {
    if (!result || opened.current === result.primary.id) return;
    opened.current = result.primary.id;
    openQr(result.primary.id);
  }, [result]);

  return (
    <IntentWizardShell
      title={tx('Interaktion aktivieren')}
      currentStep={step}
      onStepChange={setStep}
      forms={flow.formList}
      draftKey={flow.draftKey}
      intro={{
        description: tx('Eine Interaktion live schalten und den QR-Code zeigen.'),
        needs: [tx('Die Veranstaltung'), tx('Die Frage, die jetzt laufen soll')],
      }}
    >
      <WizardStep label={tx('Veranstaltung')} description={tx('Für welche Veranstaltung willst du eine Interaktion starten?')}>
        {events.error && <p className="text-sm text-destructive">{tx('Die Veranstaltungen konnten nicht geladen werden.')}</p>}
        {events.loading && !events.loaded && <p className="text-sm text-muted-foreground">{tx('Lade Veranstaltungen …')}</p>}
        {events.loaded && events.records.length === 0 && (
          <p className="text-sm text-muted-foreground">{tx('Es gibt noch keine Veranstaltung.')}</p>
        )}
        <div role="radiogroup" aria-label={tx('Veranstaltung')} className="grid gap-2 sm:grid-cols-2">
          {events.records.map(v => (
            <button
              key={v.id}
              type="button"
              role="radio"
              aria-checked={v.id === veranstaltungId}
              onClick={() => { if (v.id !== veranstaltungId) flow.forms.interaktionen.reset(); setVeranstaltungId(v.id); setStep(2); }}
              className={`flex min-w-0 items-center gap-3 overflow-hidden rounded-2xl border bg-card p-4 text-left transition hover:bg-secondary ${v.id === veranstaltungId ? 'border-primary ring-2 ring-primary/30' : ''}`}
            >
              <IconCalendarEvent size={20} className="shrink-0 text-muted-foreground" />
              <span className="min-w-0">
                <span className="block truncate font-medium">{fieldText(v, 'titel')}</span>
                {fieldDate(v, 'datum') && <span className="block truncate text-sm text-muted-foreground">{fieldDate(v, 'datum')}</span>}
              </span>
              {v.id === veranstaltungId && <IconCheck size={18} className="ml-auto shrink-0 text-primary" />}
            </button>
          ))}
        </div>
        <StepNav
          hideBack
          nextStepLabel={tx('Interaktion')}
          onNext={() => (veranstaltungId ? true : tx('Bitte eine Veranstaltung wählen.'))}
        />
      </WizardStep>

      <WizardStep label={tx('Interaktion')} description={tx('Welche Interaktion soll jetzt aktiv sein?')}>
        {veranstaltungId ? (
          <EntitySelectStep
            {...flow.picks.interaktionen.select}
            {...flow.pick('interaktionen')}
            avatar="none"
            columns={1}
            searchPlaceholder={tx('Frage suchen …')}
            emptyText={tx('Diese Veranstaltung hat noch keine Interaktion.')}
          />
        ) : (
          <StepNav onBack={() => setStep(1)} nextDisabled>
            {tx('Dieser Schritt braucht die Auswahl aus Schritt 1.')}
          </StepNav>
        )}
      </WizardStep>

      <WizardStep label={tx('Aktiv setzen')} description={tx('Alle anderen Interaktionen dieser Veranstaltung werden dabei inaktiv.')}>
        {!flow.submit.done && (
          <SummaryStep
            forms={flow.formList}
            submit={flow.submit}
            items={picked ? [{ key: 'veranstaltung', label: tx('Veranstaltung'), value: fieldText(picked, 'titel') }] : []}
            confirmLabel={tx('Aktiv setzen')}
            whatHappensNext={tx('Danach öffnet sich die QR-Code-Ansicht in einem eigenen Tab — ideal für den Beamer.')}
          />
        )}
      </WizardStep>

      {result && (
        <SuccessStep
          result={result}
          forms={flow.formList}
          submit={flow.submit}
          undo={flow.undo}
          title={tx('Interaktion ist aktiv')}
          whatHappensNext={
            fieldLookup(result.primary, 'aktiv') === null
              ? tx('Die QR-Code-Ansicht wurde in einem eigenen Tab geöffnet. Wurde sie blockiert, öffne sie unten.')
              : undefined
          }
          next={[
            { label: tx('QR-Code-Ansicht öffnen'), icon: <IconQrcode size={16} />, onClick: () => openQr(result.primary.id) },
            { label: tx('Feedbacks zusammenfassen'), href: '#/intents/feedbacks-zusammenfassen' },
            { label: tx('Zum Dashboard'), href: '#/' },
          ]}
        />
      )}
    </IntentWizardShell>
  );
}
