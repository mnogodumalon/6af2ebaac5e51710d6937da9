/**
 * KI-Antwort eintragen — 3-Schritt-Wizard.
 * Steps: 1) Zusammenfassung wählen → 2) Antwort der KI einfügen → 3) Prüfen & speichern.
 * Reads: zusammenfassungen. Writes: zusammenfassungen.ki_antwort (update of the picked record).
 * Composes: IntentWizardShell, EntitySelectStep, Bound, StepNav, SummaryStep, SuccessStep.
 */
import { useState } from 'react';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { Bound } from '@/components/blocks/Bound';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { fieldText } from '@/lib/journey';
import { useKiAntwortEintragenFlow } from '@/lib/journey/flows/KiAntwortEintragen';
import { tx } from '@/i18n';

export default function KiAntwortEintragenPage() {
  const [step, setStep] = useState(1);
  const flow = useKiAntwortEintragenFlow({
    steps: { zusammenfassungen: 1, ki_antwort: 2 },
    items: {
      zusammenfassungen: (r, ctx) => {
        const text = fieldText(r, 'zusammenfassung_text').trim();
        const hasAnswer = fieldText(r, 'ki_antwort').trim().length > 0;
        return {
          id: r.id,
          title: ctx.ref('interaktion') ?? tx('Ohne Interaktion'),
          subtitle: text.length > 140 ? `${text.slice(0, 140)}…` : text,
          status: hasAnswer
            ? { key: 'beantwortet', label: tx('KI-Antwort vorhanden') }
            : { key: 'offen', label: tx('Noch ohne KI-Antwort') },
        };
      },
    },
  });

  return (
    <IntentWizardShell
      title={tx('KI-Antwort eintragen')}
      currentStep={step}
      onStepChange={setStep}
      forms={flow.formList}
      draftKey={flow.draftKey}
      intro={{
        description: tx('Die Antwort des Chatbots bei der passenden Zusammenfassung ablegen.'),
        needs: [tx('Die kopierte Antwort der KI')],
      }}
    >
      <WizardStep label={tx('Zusammenfassung')} description={tx('Zu welcher Zusammenfassung gehört die Antwort?')}>
        <EntitySelectStep
          {...flow.picks.zusammenfassungen.select}
          {...flow.pick('zusammenfassungen')}
          searchPlaceholder={tx('Zusammenfassung suchen …')}
          avatar="none"
          columns={1}
        />
      </WizardStep>
      <WizardStep label={tx('KI-Antwort')} description={tx('Füge hier die Antwort des Chatbots ein.')}>
        <div className="space-y-4">
          <Bound form={flow.forms.zusammenfassungen} name="ki_antwort" rows={12} />
          <StepNav
            onBack={() => setStep(1)}
            onNext={() => flow.validateStep(2)}
            nextStepLabel={tx('Prüfen')}
          />
        </div>
      </WizardStep>
      <WizardStep label={tx('Prüfen')}>
        {!flow.submit.done && (
          <SummaryStep
            forms={flow.formList}
            submit={flow.submit}
            whatHappensNext={tx('Die Antwort wird bei der gewählten Zusammenfassung gespeichert.')}
          />
        )}
      </WizardStep>
      {flow.submit.result && (
        <SuccessStep
          result={flow.submit.result}
          forms={flow.formList}
          submit={flow.submit}
          next={[
            { label: tx('Noch eine Antwort eintragen'), onClick: () => { flow.reset(); setStep(1); } },
            { label: tx('Feedbacks zusammenfassen'), href: '#/intents/feedbacks-zusammenfassen' },
            { label: tx('Zum Dashboard'), href: '#/' },
          ]}
        />
      )}
    </IntentWizardShell>
  );
}
