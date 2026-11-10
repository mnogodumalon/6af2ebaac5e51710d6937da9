import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PublicShell } from '@/components/PublicShell';
import {
  loadPublicPagesConfig,
  PageUnavailableError,
  prepareChallenge,
  type PublicPagesConfig,
  type PublicPageConfig,
} from '@/lib/publicClient';
import {
  fieldText,
  useJourneySubmit,
  useLiveList,
  useStepForm,
  useVisitorKey,
} from '@/lib/journey';
import { createPublicPort } from '@/lib/journey/publicPort';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { Bound } from '@/components/blocks/Bound';
import { Field } from '@/components/blocks/Field';
import { LoadProblem } from '@/components/blocks/LoadProblem';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { tx } from '@/i18n';

const SLUG = 'abschlussbewertung';

export default function Abschlussbewertung() {
  const [cfg, setCfg] = useState<PublicPagesConfig | null>(null);
  const [page, setPage] = useState<PublicPageConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    loadPublicPagesConfig(SLUG)
      .then(c => {
        setCfg(c);
        setPage(c?.pages[SLUG] ?? null);
        setLoading(false);
      })
      .catch(e => {
        if (e instanceof PageUnavailableError) setUnavailable(true);
        setLoading(false);
      });
  }, []);

  if (loading || unavailable || !cfg || !page) {
    return <PublicShell loading={loading} unavailable={!loading} />;
  }
  return <Inner cfg={cfg} page={page} />;
}

function Inner({ cfg, page }: { cfg: PublicPagesConfig; page: PublicPageConfig }) {
  const [params] = useSearchParams();
  const veranstaltungId = params.get('veranstaltung');
  const port = useMemo(() => createPublicPort(cfg, page), [cfg, page]);
  const live = useLiveList(port, 'veranstaltungen', { intervalMs: 0 });
  const kuerzel = useVisitorKey();
  const [step, setStep] = useState(1);

  const f = useStepForm('abschlussbewertungen', {
    fields: ['veranstaltung', 'besonders_toll', 'verbesserung', 'referenzstatement', 'email', 'einwilligung'],
    required: {
      veranstaltung: true,
      besonders_toll: false,
      verbesserung: false,
      referenzstatement: false,
      email: false,
      einwilligung: false,
    },
    steps: { besonders_toll: 1, verbesserung: 1, referenzstatement: 1, email: 2, einwilligung: 2 },
    initial: veranstaltungId ? { veranstaltung: veranstaltungId } : undefined,
    autoComplete: true,
  });

  const draftKey = `abschlussbewertung-${veranstaltungId ?? 'none'}`;
  const submit = useJourneySubmit(
    port,
    [{ key: 'bewertung', entity: 'abschlussbewertungen', form: f, primary: true, values: { kuerzel: kuerzel } }],
    { draftKey },
  );

  const record = live.records.find(r => r.id === veranstaltungId) ?? null;

  if (!veranstaltungId) {
    return (
      <PublicShell title={page.title} description={page.description}>
        <p className="text-sm text-muted-foreground">
          {tx('Dieser Link ist unvollständig. Scanne bitte den QR-Code noch einmal.')}
        </p>
      </PublicShell>
    );
  }
  if (!live.loaded && live.error) {
    return (
      <PublicShell title={page.title} description={page.description}>
        <LoadProblem onRetry={live.reload} />
      </PublicShell>
    );
  }
  if (!live.loaded) {
    return <PublicShell loading />;
  }
  if (!record) {
    return (
      <PublicShell title={page.title} description={page.description}>
        <p className="text-sm text-muted-foreground">
          {tx('Dieser Link passt zu keiner Veranstaltung. Scanne bitte den QR-Code noch einmal.')}
        </p>
      </PublicShell>
    );
  }

  const titel = fieldText(record, 'titel');
  const datum = fieldText(record, 'datum');
  const hasConsentFlag = f.get('einwilligung') === true;

  const checkTexts = () => {
    const any = ['besonders_toll', 'verbesserung', 'referenzstatement'].some(
      k => String(f.get(k) ?? '').trim() !== '',
    );
    return any ? true : tx('Schreib bitte mindestens zu einer der drei Fragen etwas.');
  };

  const checkEmail = () => {
    const mail = String(f.get('email') ?? '').trim();
    if (!mail) return f.validate(['email']);
    if (!hasConsentFlag) {
      // no consent, no storage: the address is dropped and the visitor goes on
      f.set('email', '');
      return true;
    }
    return f.validate(['email']);
  };

  const skipEmail = () => {
    f.set('email', '');
    f.set('einwilligung', false);
    setStep(3);
  };

  return (
    <PublicShell title={page.title} description={page.description}>
      <p className="mb-4 text-sm text-muted-foreground">
        {datum ? `${titel} · ${datum}` : titel}
      </p>
      <IntentWizardShell
        steps={[
          { label: tx('Rückmeldung') },
          { label: tx('E-Mail (freiwillig)') },
          { label: tx('Prüfen') },
        ]}
        currentStep={step}
        onStepChange={setStep}
        back={false}
        forms={[f]}
        draftKey={draftKey}
      >
        {step === 1 && (
          <div className="space-y-5" onFocus={() => prepareChallenge(cfg, page, 'POST', `/apps/${page.endpoints?.find(e => e.op === 'create')?.app_id}/records`)}>
            <Bound form={f} name="besonders_toll" rows={4} />
            <Bound form={f} name="verbesserung" rows={4} />
            <Bound form={f} name="referenzstatement" rows={4} />
            <StepNav hideBack onNext={checkTexts} nextStepLabel={tx('E-Mail')} />
          </div>
        )}
        {step === 2 && (
          <div className="space-y-5">
            <p className="text-sm text-muted-foreground">
              {tx('Wenn du möchtest, hinterlege deine E-Mail-Adresse für eine persönliche Auswertung. Du kannst das auch überspringen.')}
            </p>
            <Bound form={f} name="email" />
            <Field form={f} name="einwilligung" hideLabel>
              <label className="flex items-start gap-2 text-sm">
                <Checkbox {...f.checkbox('einwilligung')} />
                <span>{tx('Ich willige ein, dass meine E-Mail-Adresse für eine persönliche Auswertung gespeichert wird.')}</span>
              </label>
            </Field>
            <StepNav onBack={() => setStep(1)} onNext={checkEmail} nextStepLabel={tx('Prüfen')}>
              <Button type="button" variant="ghost" onClick={skipEmail}>
                {tx('Nein, danke')}
              </Button>
            </StepNav>
          </div>
        )}
        {step === 3 && !submit.done && (
          <SummaryStep
            forms={[f]}
            submit={submit}
            whatHappensNext={tx('Dein Beitrag wird unter deinem Kürzel gespeichert.')}
          />
        )}
        {submit.result && (
          <SuccessStep
            result={submit.result}
            forms={[f]}
            title={tx('Danke für deine Bewertung!')}
            whatHappensNext={tx`Dein Kürzel für diese Veranstaltung: ${kuerzel}`}
            next={[
              {
                label: tx('Weiter zum Feedback zur aktiven Interaktion'),
                href: `#/public/feedback?veranstaltung=${veranstaltungId}`,
              },
            ]}
          />
        )}
      </IntentWizardShell>
    </PublicShell>
  );
}
