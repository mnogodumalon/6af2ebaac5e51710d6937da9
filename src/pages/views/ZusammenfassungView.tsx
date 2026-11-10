/**
 * src/pages/views/ZusammenfassungView.tsx — Ansicht „Zusammenfassung“ (Beamer).
 * Route #/ansicht/zusammenfassung?record=<interaktion-id>. Zeigt Frage + Erläuterung,
 * den bearbeitbaren Gesamttext und das Feld für die KI-Antwort der Interaktion.
 */
import { useLiveRecords } from '@/hooks/useLiveRecords';
import { tx } from '@/i18n';
import { LivingAppsService, extractRecordId } from '@/services/livingAppsService';
import { ViewTextEditor } from '@/components/blocks/ViewTextEditor';

const TEXT = { fontSize: 'clamp(1.5rem, 2.8vh, 3rem)' } as const;

export default function ZusammenfassungView() {
  const pinned = (new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('record') ?? '').replace(/["\\]/g, '');
  const interaktionen = useLiveRecords('interaktionen', { intervalMs: 0 });
  const feedbacks = useLiveRecords('feedbacks', { intervalMs: 0 });
  const zusammenfassungen = useLiveRecords('zusammenfassungen', { intervalMs: 0 });
  // `?record=` names the summary this view shows; its interaction supplies question and sources
  const edit = zusammenfassungen.records.find(z => z.record_id === pinned) ?? null;
  const interaktionId = edit ? extractRecordId(edit.fields.interaktion) : null;
  const interaktion = interaktionen.records.find(r => r.record_id === interaktionId) ?? null;
  const loaded = !interaktionen.error && !feedbacks.error && !zusammenfassungen.error
    && interaktionen.lastSync !== null && feedbacks.lastSync !== null && zusammenfassungen.lastSync !== null;

  const composeText = (): string | null => {
    if (!interaktion || !loaded) return null;
    const fb = feedbacks.records
      .filter(f => extractRecordId(f.fields.interaktion) === interaktionId)
      .sort((a, b) => (a.createdat ?? '').localeCompare(b.createdat ?? ''))
      .map(f => `${f.fields.kuerzel ?? '—'}: ${f.fields.feedback_text ?? ''}`);
    return [interaktion.fields.vorprompt, ...fb, interaktion.fields.endprompt]
      .filter(x => x && x.trim() !== '').join('\n\n');
  };

  const blocked = [interaktionen, feedbacks, zusammenfassungen].some(x => x.error)
    ? tx('Die Daten konnten nicht geladen werden — es wird nichts zusammengeführt oder gespeichert.') : null;

  return (
    <main className="min-h-dvh space-y-6 bg-background p-6 text-foreground sm:p-10">
      {!pinned && <p data-view-no-record style={TEXT}>{tx('Bitte über die Übersicht öffnen — diese Ansicht zeigt einen bestimmten Datensatz.')}</p>}
      {interaktion && (
        <header className="space-y-2">
          <h1 className="font-semibold" style={{ fontSize: 'clamp(2rem, 4.5vh, 4.5rem)' }}>{interaktion.fields.frage}</h1>
          {interaktion.fields.erlaeuterung && (
            <p className="whitespace-pre-line text-muted-foreground" style={TEXT}>{interaktion.fields.erlaeuterung}</p>
          )}
        </header>
      )}
      {edit && (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="min-w-0 space-y-2">
            <h2 className="font-medium" style={TEXT}>{tx('Text für den Chatbot')}</h2>
            <ViewTextEditor
              field="zusammenfassung_text"
              recordId={edit.record_id}
              value={String((edit.fields as Record<string, unknown>)['zusammenfassung_text'] ?? '')}
              save={async text => {
                await LivingAppsService.updateZusammenfassungenEntry(edit.record_id, { zusammenfassung_text: text });
                zusammenfassungen.apply(edit.record_id, { zusammenfassung_text: text });
              }}
              compose={composeText}
              blocked={blocked}
            />
          </section>
          <section className="min-w-0 space-y-2">
            <h2 className="font-medium" style={TEXT}>{tx('Antwort der KI')}</h2>
            <p className="whitespace-pre-wrap rounded-xl border bg-card p-4" style={TEXT}>
              {String((edit.fields as Record<string, unknown>)['ki_antwort'] ?? '') || tx('Noch keine Antwort — trage sie in der Übersicht ein.')}
            </p>
          </section>
        </div>
      )}
      {[interaktionen, feedbacks, zusammenfassungen].some(x => x.error && x.records.length === 0) && (
        <p role="alert" data-live-error className="text-destructive" style={TEXT}>
          {interaktionen.unauthorized ? tx('Bitte melde dich an, um diese Ansicht zu sehen.') : tx('Die Daten konnten nicht geladen werden.')}
        </p>
      )}
    </main>
  );
}
