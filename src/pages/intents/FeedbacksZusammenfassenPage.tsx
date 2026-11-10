/**
 * Feedbacks zusammenfassen — 2-Schritt-Wizard.
 * Steps: 1) Interaktion wählen → 2) Prüfen & zusammenfassen (Vorprompt, Feedbacks mit Kürzel, Endprompt werden zu einem Text).
 * Reads: interaktionen, feedbacks. Writes: zusammenfassungen (createZusammenfassungenEntry via Flow-Hook).
 * Composes: IntentWizardShell, EntitySelectStep, SummaryStep, SuccessStep.
 */
import { useRef, useState } from 'react';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { StepNav } from '@/components/blocks/StepNav';
import { fieldText, fieldNumber, refFilter, useLiveList } from '@/lib/journey';
import { useFeedbacksZusammenfassenFlow } from '@/lib/journey/flows/FeedbacksZusammenfassen';
import { tx } from '@/i18n';

export default function FeedbacksZusammenfassenPage() {
  const [step, setStep] = useState(1);
  // The text is compiled from loaded records; compute reads the latest value at submit time.
  const textRef = useRef<string | null>(null);

  const flow = useFeedbacksZusammenfassenFlow({
    steps: { interaktion: 1 },
    items: {
      interaktion: r => ({
        id: r.id,
        title: fieldText(r, 'frage'),
        subtitle: tx`Reihenfolge ${fieldNumber(r, 'reihenfolge') ?? '–'}`,
      }),
    },
    where: { interaktion: r => r.fields.aktiv === true },
    compute: { zusammenfassung_text: () => textRef.current },
  });

  const interaktionId = (flow.forms.zusammenfassungen.get('interaktion') as string | null) || null;
  const interaktion = interaktionId ? flow.picks.interaktion.recordOf(interaktionId) : undefined;

  const feedbacks = useLiveList(flow.port, 'feedbacks', {
    intervalMs: 0,
    list: interaktionId ? { filter: refFilter('interaktion', interaktionId), limit: 500 } : undefined,
    enabled: Boolean(interaktionId),
  });

  const sorted = [...feedbacks.records].sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));
  const loaded = Boolean(interaktion) && feedbacks.loaded;

  if (loaded && interaktion) {
    const parts = [
      fieldText(interaktion, 'vorprompt'),
      ...sorted.map(f => `${fieldText(f, 'kuerzel')}: ${fieldText(f, 'feedback_text')}`),
      fieldText(interaktion, 'endprompt'),
    ].filter(p => p.trim() !== '');
    textRef.current = parts.join('\n\n');
  } else {
    textRef.current = null;
  }

  const noFeedbacks = loaded && sorted.length === 0;

  return (
    <IntentWizardShell
      title={tx('Feedbacks zusammenfassen')}
      currentStep={step}
      onStepChange={setStep}
      forms={flow.formList}
      draftKey={flow.draftKey}
      intro={{
        description: tx('Alle Feedbacks einer Interaktion zu einem Text für die KI zusammenführen.'),
        needs: [tx('Die Interaktion, deren Feedbacks du zusammenfassen willst')],
      }}
    >
      <WizardStep label={tx('Interaktion')} description={tx('Welche Interaktion soll zusammengefasst werden?')}>
        <EntitySelectStep
          {...flow.picks.interaktion.select}
          {...flow.pick('interaktion')}
          searchPlaceholder={tx('Frage suchen …')}
          avatar="none"
          emptyText={tx('Keine Interaktion ist aktiv. Setze zuerst eine Interaktion aktiv.')}
        />
      </WizardStep>
      <WizardStep label={tx('Zusammenfassen')} description={tx('Prüfe den Text und klicke auf Zusammenfassen.')} needs={['interaktion']}>
        {!flow.submit.done && (
          <SummaryStep
            forms={flow.formList}
            submit={flow.submit}
            confirmLabel={tx('Zusammenfassen')}
            items={[
              {
                key: 'feedback-anzahl',
                label: tx('Feedbacks'),
                value: !loaded ? '…' : String(sorted.length),
              },
            ]}
            whatHappensNext={tx('Vorprompt, alle Feedbacks mit Kürzel und Endprompt werden zu einem Text zusammengeführt.')}
          >
            {noFeedbacks && (
              <p className="text-sm text-muted-foreground">{tx('Zu dieser Interaktion gibt es noch keine Feedbacks.')}</p>
            )}
            {textRef.current && (
              <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-xl bg-secondary p-3 text-sm">
                {textRef.current}
              </pre>
            )}
          </SummaryStep>
        )}
        {flow.submit.done && <StepNav hideBack />}
      </WizardStep>
      {flow.submit.result && (
        <SuccessStep
          result={flow.submit.result}
          forms={flow.formList}
          submit={flow.submit}
          whatHappensNext={tx('Kopiere den Text in die KI und trage danach deren Antwort ein.')}
          next={[
            { label: tx('Noch eine Interaktion'), onClick: () => { flow.reset(); setStep(1); } },
            { label: tx('KI-Antwort eintragen'), href: '#/intents/ki-antwort-eintragen' },
            { label: tx('Zum Dashboard'), href: '#/' },
          ]}
        >
          {textRef.current && (
            <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-xl bg-secondary p-3 text-sm">
              {String(flow.submit.result.primary.fields.zusammenfassung_text ?? textRef.current)}
            </pre>
          )}
        </SuccessStep>
      )}
    </IntentWizardShell>
  );
}
