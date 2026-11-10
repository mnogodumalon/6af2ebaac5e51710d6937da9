import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PublicShell } from '@/components/PublicShell';
import { Button } from '@/components/ui/button';
import { Bound } from '@/components/blocks/Bound';
import { FieldErrorSummary } from '@/components/blocks/FieldErrorSummary';
import { LoadProblem } from '@/components/blocks/LoadProblem';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import {
  loadPublicPagesConfig,
  type PublicPagesConfig,
  type PublicPageConfig,
} from '@/lib/publicClient';
import { createPublicPort } from '@/lib/journey/publicPort';
import {
  fieldRef,
  fieldText,
  freshRef,
  useJourneySubmit,
  useLiveList,
  useStepForm,
  useVisitorKey,
} from '@/lib/journey';
import { tx } from '@/i18n';

const SLUG = 'feedback';

function newSendKey(): string {
  const c = typeof crypto !== 'undefined' ? crypto : undefined;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export default function Feedback() {
  const [cfg, setCfg] = useState<PublicPagesConfig | null>(null);
  const [page, setPage] = useState<PublicPageConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPublicPagesConfig(SLUG).then(c => {
      setCfg(c);
      setPage(c?.pages[SLUG] ?? null);
      setLoading(false);
    });
  }, []);

  if (loading || !cfg || !page) {
    return <PublicShell loading={loading} unavailable={!loading} />;
  }
  return <FeedbackInner cfg={cfg} page={page} />;
}

function FeedbackInner({ cfg, page }: { cfg: PublicPagesConfig; page: PublicPageConfig }) {
  const [params] = useSearchParams();
  const linkedId = params.get('veranstaltung');
  const port = useMemo(() => createPublicPort(cfg, page), [cfg, page]);
  const visitorKey = useVisitorKey();

  const events = useLiveList(port, 'veranstaltungen', { intervalMs: 0, enabled: !!linkedId });
  const live = useLiveList(port, 'interaktionen', { intervalMs: 20000, enabled: !!linkedId });

  const event = linkedId ? events.records.find(r => r.id === linkedId) : undefined;
  const active = useMemo(
    () => live.records.find(r => fieldRef(r, 'veranstaltung') === linkedId),
    [live.records, linkedId],
  );
  const activeId = active?.id ?? null;

  const activeRef = useRef<string | null>(null);
  activeRef.current = activeId;
  const sendKey = useRef<string>(newSendKey());

  const form = useStepForm('feedbacks', {
    fields: ['feedback_text'],
    required: { feedback_text: true },
    autoComplete: true,
  });

  const submit = useJourneySubmit(
    port,
    [
      {
        key: 'feedback',
        entity: 'feedbacks',
        form,
        primary: true,
        values: () => ({
          interaktion: activeRef.current ?? '',
          kuerzel: visitorKey,
          absende_kennung: sendKey.current,
        }),
      },
    ],
    {
      draftKey: `feedback-${linkedId ?? 'none'}`,
      check: async () => {
        const id = activeRef.current;
        if (!id || !linkedId) return tx('Inzwischen ist eine andere Frage dran.');
        // 'aktiv' is not part of the public read (scope r.v_aktiv == True): an inactive record is not served at all
        const ev = await freshRef(port, 'interaktionen', id, 'veranstaltung');
        return ev === linkedId ? null : tx('Inzwischen ist eine andere Frage dran.');
      },
      onSuccess: () => {
        sendKey.current = newSendKey();
      },
    },
  );

  if (!linkedId) {
    return (
      <PublicShell title={tx('Feedback')}>
        <p className="text-sm text-muted-foreground">
          {tx('Bitte öffne diese Seite über den QR-Code oder den Link deiner Veranstaltung.')}
        </p>
      </PublicShell>
    );
  }
  if (!events.loaded && events.error) {
    return (
      <PublicShell title={tx('Feedback')}>
        <LoadProblem onRetry={events.reload} />
      </PublicShell>
    );
  }
  if (!events.loaded) return <PublicShell loading />;
  if (!event) {
    return (
      <PublicShell title={tx('Feedback')}>
        <p className="text-sm text-muted-foreground">
          {tx('Dieser Link passt zu keiner Veranstaltung. Scanne bitte den QR-Code noch einmal.')}
        </p>
      </PublicShell>
    );
  }
  if (!live.loaded && live.error) {
    return (
      <PublicShell title={fieldText(event, 'titel')}>
        <LoadProblem onRetry={live.reload} />
      </PublicShell>
    );
  }

  const send = async () => {
    if (!form.validate()) return;
    await submit.run();
  };

  return (
    <PublicShell title={fieldText(event, 'titel')} description={tx('Dein Feedback zur aktuellen Frage')}>
      {submit.result ? (
        <SuccessStep
          result={submit.result}
          forms={[form]}
          submit={submit}
          title={tx('Danke für dein Feedback')}
          restartLabel={tx('Weiteres Feedback senden')}
          actions={{ copy: false, print: false }}
        >
          <div className="space-y-4 text-center">
            <div>
              <p className="text-sm text-muted-foreground">{tx('Dein Kürzel')}</p>
              <p className="text-3xl font-mono font-semibold tracking-widest">{visitorKey}</p>
            </div>
            <Link
              to={`/public/abschlussbewertung?veranstaltung=${linkedId}`}
              className="inline-block text-sm underline text-primary"
            >
              {tx('Zur Abschlussbewertung')}
            </Link>
          </div>
        </SuccessStep>
      ) : !active ? (
        <p className="text-sm text-muted-foreground">
          {tx('Gerade ist keine Frage geöffnet. Diese Seite aktualisiert sich von selbst.')}
        </p>
      ) : (
        <form
          className="space-y-5"
          onSubmit={e => {
            e.preventDefault();
            void send();
          }}
        >
          <div className="space-y-2">
            <h2 className="text-lg font-semibold whitespace-pre-wrap">{fieldText(active, 'frage')}</h2>
            {fieldText(active, 'erlaeuterung') && (
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {fieldText(active, 'erlaeuterung')}
              </p>
            )}
          </div>
          <Bound form={form} name="feedback_text" rows={5} />
          <FieldErrorSummary forms={[form]} />
          {submit.offline && (
            <p className="text-sm text-muted-foreground">
              {tx('Keine Verbindung — deine Eingaben sind gesichert.')}
            </p>
          )}
          {submit.error && !submit.offline && (
            <p className="text-sm text-destructive">{submit.error.message}</p>
          )}
          <Button type="submit" className="w-full" disabled={submit.submitting}>
            {submit.submitting ? tx('Wird gesendet …') : tx('Absenden')}
          </Button>
        </form>
      )}
    </PublicShell>
  );
}
