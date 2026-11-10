/**
 * src/pages/views/ZusammenfassungView.tsx — Ansicht „Zusammenfassung“ (Beamer).
 * Route #/ansicht/zusammenfassung?interaktion=<interaktion-id> (oder ?record=<zusammenfassung-id>).
 * Führt Vorprompt, Feedbacks mit Kürzel und Endprompt zu einem bearbeitbaren Text zusammen
 * (automatisch gespeichert, kopierbar) und speichert darunter die Antwort der KI.
 * Eine vorhandene Zusammenfassung wird nur nach ausdrücklicher Bestätigung ersetzt.
 */
import { useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { useLiveRecords } from '@/hooks/useLiveRecords';
import { tx } from '@/i18n';
import { LivingAppsService, extractRecordId, createRecordUrl } from '@/services/livingAppsService';
import { APP_IDS } from '@/types/app';
import { ViewTextEditor } from '@/components/blocks/ViewTextEditor';

const TEXT = { fontSize: 'clamp(1.5rem, 2.8vh, 3rem)' } as const;

export default function ZusammenfassungView() {
  const params = new URLSearchParams(window.location.hash.split('?')[1] ?? '');
  const pinned = (params.get('record') ?? '').replace(/["\\]/g, '');
  const pinnedInteraktion = (params.get('interaktion') ?? '').replace(/["\\]/g, '');
  const interaktionen = useLiveRecords('interaktionen', { intervalMs: 0 });
  const feedbacks = useLiveRecords('feedbacks', { intervalMs: 0 });
  const zusammenfassungen = useLiveRecords('zusammenfassungen', { intervalMs: 0 });
  const [createFailed, setCreateFailed] = useState(false);
  const creating = useRef<string | null>(null);

  const loaded = !interaktionen.error && !feedbacks.error && !zusammenfassungen.error
    && interaktionen.lastSync !== null && feedbacks.lastSync !== null && zusammenfassungen.lastSync !== null;

  // `?record=` names a summary; `?interaktion=` takes that interaction's newest summary
  const byRecord = zusammenfassungen.records.find(z => z.record_id === pinned) ?? null;
  const interaktionId = byRecord ? extractRecordId(byRecord.fields.interaktion) : pinnedInteraktion || null;
  const edit = byRecord ?? (pinnedInteraktion
    ? [...zusammenfassungen.records]
        .filter(z => extractRecordId(z.fields.interaktion) === pinnedInteraktion)
        .sort((a, b) => (b.createdat ?? '').localeCompare(a.createdat ?? ''))[0] ?? null
    : null);
  const interaktion = interaktionen.records.find(r => r.record_id === interaktionId) ?? null;

  // first „Zusammenfassen“ of a question: the summary record is created once, the editor fills it
  useEffect(() => {
    if (!loaded || edit || !pinnedInteraktion || !interaktion || creating.current === pinnedInteraktion) return;
    creating.current = pinnedInteraktion;
    LivingAppsService.createZusammenfassungenEntry({
      interaktion: createRecordUrl(APP_IDS.INTERAKTIONEN, pinnedInteraktion),
      zeitpunkt: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
    })
      .then(() => zusammenfassungen.reload())
      .catch(err => { console.error('[ZusammenfassungView] create:', err); setCreateFailed(true); });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per interaction, when its sources are ready
  }, [loaded, edit, pinnedInteraktion, interaktion]);

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
      {!pinned && !pinnedInteraktion && <p data-view-no-record style={TEXT}>{tx('Bitte über die Übersicht öffnen — diese Ansicht zeigt einen bestimmten Datensatz.')}</p>}
      {interaktion && (
        <header className="space-y-2">
          <h1 className="font-semibold" style={{ fontSize: 'clamp(2rem, 4.5vh, 4.5rem)' }}>{interaktion.fields.frage}</h1>
          {interaktion.fields.erlaeuterung && (
            <p className="whitespace-pre-line text-muted-foreground" style={TEXT}>{interaktion.fields.erlaeuterung}</p>
          )}
        </header>
      )}
      {edit && (
        <div className="space-y-8">
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
              minHeight="40vh"
            />
          </section>
          <section className="min-w-0 space-y-2">
            <h2 className="font-medium" style={TEXT}>{tx('Antwort der KI')}</h2>
            <ViewTextEditor
              field="ki_antwort"
              recordId={edit.record_id}
              value={String((edit.fields as Record<string, unknown>)['ki_antwort'] ?? '')}
              save={async text => {
                await LivingAppsService.updateZusammenfassungenEntry(edit.record_id, { ki_antwort: text });
                zusammenfassungen.apply(edit.record_id, { ki_antwort: text });
              }}
              blocked={blocked}
              minHeight="30vh"
            />
          </section>
        </div>
      )}
      {createFailed && (
        <p role="alert" className="text-destructive" style={TEXT}>{tx('Die Zusammenfassung konnte nicht angelegt werden — bitte Seite neu laden.')}</p>
      )}
      {[interaktionen, feedbacks, zusammenfassungen].some(x => x.error && x.records.length === 0) && (
        <p role="alert" data-live-error className="text-destructive" style={TEXT}>
          {interaktionen.unauthorized ? tx('Bitte melde dich an, um diese Ansicht zu sehen.') : tx('Die Daten konnten nicht geladen werden.')}
        </p>
      )}
    </main>
  );
}
