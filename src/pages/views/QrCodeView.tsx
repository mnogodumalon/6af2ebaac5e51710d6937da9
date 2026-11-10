/**
 * src/pages/views/QrCodeView.tsx — Ansicht „QR-Code Feedback“ (Beamer).
 * Route #/ansicht/qr-code?record=<interaktion-id>, außerhalb des Dashboard-Chromes.
 * Zeigt Frage, Erläuterung und den QR-Code der aktiven Interaktion; live per useLiveRecords.
 */
import { useLiveRecords } from '@/hooks/useLiveRecords';
import { tx } from '@/i18n';
import { extractRecordId } from '@/services/livingAppsService';
import { countOf } from '@/config/plan';
import { PublicPageQr } from '@/components/widgets/PublicPageQr';

const TEXT = { fontSize: 'clamp(1.5rem, 2.8vh, 3rem)' } as const;
const SMALL = { fontSize: 'clamp(1.25rem, 2.2vh, 2.25rem)' } as const;

export default function QrCodeView() {
  const pinned = (new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('record') ?? '').replace(/["\\]/g, '');
  const interaktionen = useLiveRecords('interaktionen', { intervalMs: 10000, query: { filter: "r.v_aktiv == True and r.v_aktiv == True" } });
  const feedbacks = useLiveRecords('feedbacks', { intervalMs: 10000 });
  const aktiv = interaktionen.records.find(r => r.record_id === pinned) ?? null;
  const veranstaltungId = aktiv ? extractRecordId(aktiv.fields.veranstaltung) : null;
  const anzahl = aktiv ? feedbacks.records.filter(f => extractRecordId(f.fields.interaktion) === aktiv.record_id).length : 0;

  return (
    <main className="flex min-h-dvh flex-col items-center gap-6 bg-background p-6 text-center text-foreground sm:p-10">
      {!pinned && (
        <p data-view-no-record style={TEXT}>{tx('Bitte über die Übersicht öffnen — diese Ansicht zeigt einen bestimmten Datensatz.')}</p>
      )}
      {pinned && !aktiv && !interaktionen.error && (
        <p className="text-muted-foreground" style={TEXT}>{tx('Gerade keine aktive Interaktion')}</p>
      )}
      {aktiv && (
        <>
          <h1 className="max-w-5xl font-semibold" style={{ fontSize: 'clamp(2rem, 4.5vh, 4.5rem)' }}>{aktiv.fields.frage}</h1>
          {aktiv.fields.erlaeuterung && (
            <p className="max-w-4xl whitespace-pre-line text-muted-foreground" style={TEXT}>{aktiv.fields.erlaeuterung}</p>
          )}
          <PublicPageQr entity="veranstaltungen" recordId={veranstaltungId} page="feedback" size="46vh" linkClassName="text-muted-foreground" />
          <div className="flex items-center gap-4" style={SMALL}>
            {!interaktionen.stale && (
              <span className="inline-flex items-center gap-2 font-medium text-emerald-600">
                <span className="h-3 w-3 rounded-full bg-emerald-500" />{tx('Live')}
              </span>
            )}
            <span className="text-muted-foreground">{countOf('feedbacks', anzahl, 'Feedbacks')}</span>
          </div>
        </>
      )}
      {feedbacks.error && feedbacks.records.length === 0 && (
        <p role="alert" data-live-error className="text-destructive" style={TEXT}>{tx('Die Daten konnten nicht geladen werden.')}</p>
      )}
      {interaktionen.error && interaktionen.records.length === 0 && (
        <p role="alert" data-live-error className="text-destructive" style={TEXT}>
          {interaktionen.unauthorized ? tx('Bitte melde dich an, um diese Ansicht zu sehen.') : tx('Die Daten konnten nicht geladen werden.')}
        </p>
      )}
    </main>
  );
}
