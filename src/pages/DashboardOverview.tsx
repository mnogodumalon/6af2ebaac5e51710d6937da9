import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { IconPlus, IconPlayerPlay, IconQrcode, IconSparkles, IconMessage, IconStar, IconCalendarEvent, IconCheck } from '@tabler/icons-react';
import type { DashboardData } from '@/hooks/useDashboardData';
import { useEntityCrud } from '@/components/EntityCrud';
import { flowActionFor, viewHref, countOf } from '@/config/plan';
import type { Interaktionen } from '@/types/app';
import { extractRecordId, LivingAppsService } from '@/services/livingAppsService';
import { formatDate } from '@/lib/formatters';
import { tx, appLabel, dateFnsLocale } from '@/i18n';
import { useClock, gruss, undoToast } from '@/lib/polish';
import { DashboardGrid } from '@/components/DashboardGrid';
import { StatStrip, StatStripItem } from '@/components/StatCard';
import { WorkList } from '@/components/WorkList';
import { HeroBanner } from '@/components/HeroBanner';
import { Button } from '@/components/ui/button';

type Filter = 'all' | 'ohneFeedback' | 'ohneZusammenfassung';

export default function DashboardOverview({ data }: { data: DashboardData }) {
  const {
    veranstaltungen, interaktionen, feedbacks, zusammenfassungen, abschlussbewertungen,
    setInteraktionen, fetchAll,
  } = data;
  const crud = useEntityCrud(data, {
    footer: (top) => top.type === 'interaktionen' && !top.record.fields.aktiv
      ? { label: tx('Aktiv setzen & QR-Code zeigen'), onClick: () => activate(top.record) }
      : undefined,
  });
  const enrichedInteraktionen = crud.enriched.interaktionen;
  const enrichedZusammenfassungen = crud.enriched.zusammenfassungen;
  const enrichedAbschlussbewertungen = crud.enriched.abschlussbewertungen;
  const clock = useClock();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [message, setMessage] = useState<string | null>(null);

  const sortedEvents = useMemo(
    () => [...veranstaltungen].sort((a, b) => (b.fields.datum ?? '').localeCompare(a.fields.datum ?? '')),
    [veranstaltungen],
  );
  const withActive = (vid: string) => interaktionen.find(i => i.fields.aktiv && extractRecordId(i.fields.veranstaltung) === vid);
  const current = sortedEvents.find(v => v.record_id === selectedId)
    ?? sortedEvents.find(v => withActive(v.record_id))
    ?? sortedEvents[0] ?? null;

  const feedbackCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of feedbacks) {
      const id = extractRecordId(f.fields.interaktion);
      if (id) m.set(id, (m.get(id) ?? 0) + 1);
    }
    return m;
  }, [feedbacks]);
  const summaryCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const z of zusammenfassungen) {
      const id = extractRecordId(z.fields.interaktion);
      if (id) m.set(id, (m.get(id) ?? 0) + 1);
    }
    return m;
  }, [zusammenfassungen]);

  // newest summary per interaction — the view opens that record
  const latestSummary = useMemo(() => {
    const m = new Map<string, string>();
    for (const z of [...zusammenfassungen].sort((a, b) => (a.createdat ?? '').localeCompare(b.createdat ?? ''))) {
      const id = extractRecordId(z.fields.interaktion);
      if (id) m.set(id, z.record_id);
    }
    return m;
  }, [zusammenfassungen]);

  // Vorprompt, then every feedback in order with its Kürzel, then Endprompt
  const composeFor = (i: Interaktionen): string => {
    const fb = feedbacks
      .filter(f => extractRecordId(f.fields.interaktion) === i.record_id)
      .sort((a, b) => (a.createdat ?? '').localeCompare(b.createdat ?? ''))
      .map(f => `${f.fields.kuerzel ?? '—'}: ${f.fields.feedback_text ?? ''}`);
    return [i.fields.vorprompt, ...fb, i.fields.endprompt].filter(x => x && x.trim() !== '').join('\n\n');
  };

  const mine = current
    ? enrichedInteraktionen
        .filter(i => extractRecordId(i.fields.veranstaltung) === current.record_id)
        .sort((a, b) => (a.fields.reihenfolge ?? 0) - (b.fields.reihenfolge ?? 0))
    : [];
  const activeOfCurrent = mine.find(i => i.fields.aktiv) ?? null;
  const ohneFeedback = mine.filter(i => !(feedbackCount.get(i.record_id) ?? 0));
  const ohneZusammenfassung = mine.filter(i => (feedbackCount.get(i.record_id) ?? 0) > 0 && !(summaryCount.get(i.record_id) ?? 0));
  const shown = filter === 'ohneFeedback' ? ohneFeedback : filter === 'ohneZusammenfassung' ? ohneZusammenfassung : mine;
  const bewertungenCurrent = current
    ? abschlussbewertungen.filter(b => extractRecordId(b.fields.veranstaltung) === current.record_id).length
    : 0;

  // ONE write path: hero, cards and overlay footer all activate through here.
  // Exactly one interaction per event is active; the QR view opens in its own tab.
  function activate(rec: Interaktionen): string | undefined {
    const vid = extractRecordId(rec.fields.veranstaltung);
    // synchronous inside the click, so the browser does not block the tab
    window.open(viewHref('qr-code', rec.record_id), '_blank', 'noopener');
    if (rec.fields.aktiv) return;
    const before = interaktionen;
    const freed = interaktionen.filter(i => i.record_id !== rec.record_id && i.fields.aktiv && extractRecordId(i.fields.veranstaltung) === vid);
    setInteraktionen(prev => prev.map(i =>
      i.record_id === rec.record_id ? { ...i, fields: { ...i.fields, aktiv: true } }
        : freed.some(f => f.record_id === i.record_id) ? { ...i, fields: { ...i.fields, aktiv: false } } : i));
    setMessage(null);
    const write = async () => {
      for (const f of freed) await LivingAppsService.updateInteraktionenEntry(f.record_id, { aktiv: false });
      await LivingAppsService.updateInteraktionenEntry(rec.record_id, { aktiv: true });
    };
    write().catch(() => { setInteraktionen(before); setMessage(tx('Aktivieren fehlgeschlagen — bitte erneut versuchen.')); fetchAll(); });
    undoToast(tx`„${rec.fields.frage ?? ''}“ ist jetzt aktiv`, () => {
      setInteraktionen(before);
      void (async () => {
        await LivingAppsService.updateInteraktionenEntry(rec.record_id, { aktiv: false });
        for (const f of freed) await LivingAppsService.updateInteraktionenEntry(f.record_id, { aktiv: true });
      })().catch(() => fetchAll());
    });
    return undefined;
  }

  const firstStep = mine[0] ?? null;
  const noActive = !!current && mine.length > 0 && !activeOfCurrent;

  const offeneKi = enrichedZusammenfassungen
    .filter(z => !(z.fields.ki_antwort ?? '').trim())
    .sort((a, b) => (b.createdat ?? '').localeCompare(a.createdat ?? ''));
  const neueBewertungen = [...enrichedAbschlussbewertungen]
    .sort((a, b) => (b.createdat ?? '').localeCompare(a.createdat ?? ''));

  // context line — names things in every branch
  const lineName = current?.fields.titel ?? '';
  let context: string;
  if (!current) context = tx('Lege deine erste Veranstaltung an, dann kannst du Interaktionen vorbereiten.');
  else if (activeOfCurrent) {
    const n = feedbackCount.get(activeOfCurrent.record_id) ?? 0;
    context = tx`${lineName}: aktiv ist „${activeOfCurrent.fields.frage ?? ''}“ — ${countOf('feedbacks', n, appLabel('feedbacks'))} bisher.`;
  } else if (mine.length > 0) context = tx`${lineName}: noch keine Interaktion aktiv — starte mit „${mine[0].fields.frage ?? ''}“.`;
  else context = tx`${lineName} hat noch keine Interaktionen — lege den ersten Schritt an.`;

  const ago = (iso: string | undefined) => {
    if (!iso) return '';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : format(d, 'dd.MM. HH:mm', { locale: dateFnsLocale() });
  };

  const empty = veranstaltungen.length === 0;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{gruss(clock)}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{context}</p>
        </div>
        {crud.veranstaltungen.canWrite && (
          <Button className="h-11 w-full sm:w-auto" onClick={() => crud.veranstaltungen.openCreate({})}>
            <IconPlus size={16} className="shrink-0" />{tx('Neue Veranstaltung')}
          </Button>
        )}
      </header>

      {empty ? (
        <section className="flex flex-col items-center gap-3 rounded-[27px] bg-card p-10 text-center shadow-lg">
          <IconCalendarEvent size={48} className="text-muted-foreground" stroke={1.5} />
          <p className="max-w-md text-sm text-muted-foreground">{tx('Noch keine Veranstaltung. Lege eine an und bereite dann die Interaktionen für den Abend vor.')}</p>
          {crud.veranstaltungen.canWrite && (
            <Button className="h-12" onClick={() => crud.veranstaltungen.openCreate({})}>{tx('Erste Veranstaltung anlegen')}</Button>
          )}
        </section>
      ) : (
        <DashboardGrid
          variant="split"
          hero={noActive && firstStep && crud.interaktionen.canWrite ? (
            <HeroBanner
              icon={<IconQrcode size={18} />}
              action={{ label: tx('Ersten Schritt aktivieren'), onClick: () => activate(firstStep) }}
            >
              <b>{current?.fields.titel}</b> {tx('hat noch keine aktive Interaktion — die Teilnehmenden sehen derzeit kein Formular.')}
            </HeroBanner>
          ) : undefined}
          kpis={(
            <StatStrip>
              <StatStripItem
                title={tx('Ohne Feedback')}
                value={ohneFeedback.length}
                icon={<IconMessage size={16} className="text-muted-foreground" />}
                tone={ohneFeedback.length > 0 && activeOfCurrent && ohneFeedback.some(i => i.record_id === activeOfCurrent.record_id) ? 'warning' : 'default'}
                onClick={() => setFilter(f => f === 'ohneFeedback' ? 'all' : 'ohneFeedback')}
                active={filter === 'ohneFeedback'}
              />
              <StatStripItem
                title={tx('Noch nicht zusammengefasst')}
                value={ohneZusammenfassung.length}
                icon={<IconSparkles size={16} className="text-muted-foreground" />}
                tone={ohneZusammenfassung.length > 0 ? 'primary' : 'default'}
                onClick={() => setFilter(f => f === 'ohneZusammenfassung' ? 'all' : 'ohneZusammenfassung')}
                active={filter === 'ohneZusammenfassung'}
              />
              <StatStripItem
                title={tx('Abschlussbewertungen')}
                value={bewertungenCurrent}
                icon={<IconStar size={16} className="text-muted-foreground" />}
              />
            </StatStrip>
          )}
          primary={(
            // hand-built: no widget covers an ordered step list with activate/summarize actions
            // (KanbanWidget needs a status lookup; here „aktiv“ is exclusive and order is numeric)
            <section className="overflow-hidden rounded-[27px] bg-card p-5 shadow-lg">
              <div className="flex flex-wrap items-center gap-2">
                {sortedEvents.map(v => (
                  <button
                    key={v.record_id}
                    type="button"
                    onClick={() => { setSelectedId(v.record_id); setFilter('all'); }}
                    className={`max-w-full truncate rounded-full px-4 py-2 text-sm font-medium transition-colors ${v.record_id === current?.record_id ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground hover:bg-muted/70'}`}
                  >
                    {v.fields.titel}{v.fields.datum ? ` · ${formatDate(v.fields.datum)}` : ''}
                  </button>
                ))}
              </div>

              {message && <p role="alert" className="mt-3 text-sm text-destructive">{message}</p>}

              <div className="mt-4 space-y-3">
                {shown.map(i => {
                  const n = feedbackCount.get(i.record_id) ?? 0;
                  const z = summaryCount.get(i.record_id) ?? 0;
                  const isActive = !!i.fields.aktiv;
                  return (
                    <article key={i.record_id} className={`overflow-hidden rounded-2xl border p-4 ${isActive ? 'border-primary bg-primary/5' : 'border-border'}`}>
                      <button type="button" className="block w-full min-w-0 text-left" onClick={() => crud.interaktionen.openDetail(i)}>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span className="font-semibold">{tx('Schritt')} {i.fields.reihenfolge ?? '–'}</span>
                          {isActive && <span className="font-semibold text-primary">{tx('● Aktiv — Teilnehmende sehen diese Frage')}</span>}
                        </div>
                        <p className="mt-1 line-clamp-3 text-base font-medium">{i.fields.frage}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {countOf('feedbacks', n, appLabel('feedbacks'))} · {countOf('zusammenfassungen', z, appLabel('zusammenfassungen'))}
                        </p>
                      </button>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {crud.interaktionen.canWrite && (
                          <Button className="h-12 min-w-0 flex-1 sm:flex-none" variant={isActive ? 'outline' : 'default'} onClick={() => activate(i)}>
                            {isActive ? <IconQrcode size={18} className="shrink-0" /> : <IconPlayerPlay size={18} className="shrink-0" />}
                            <span className="truncate">{isActive ? tx('QR-Code zeigen') : tx('Aktiv setzen & QR-Code')}</span>
                          </Button>
                        )}
                        {latestSummary.get(i.record_id) ? (
                          <Button asChild className="h-12 min-w-0 flex-1 sm:flex-none" variant="secondary">
                            <a href={`#/ansicht/zusammenfassung?record=${latestSummary.get(i.record_id)}`} target="_blank" rel="noopener">
                              <IconSparkles size={18} className="shrink-0" />
                              <span className="truncate">{tx('Zusammenfassung öffnen')}</span>
                            </a>
                          </Button>
                        ) : crud.zusammenfassungen.canWrite && (
                          <Button className="h-12 min-w-0 flex-1 sm:flex-none" variant="secondary" onClick={() => crud.zusammenfassungen.openCreate({
                            interaktion: i.record_id,
                            zeitpunkt: format(clock, "yyyy-MM-dd'T'HH:mm"),
                            zusammenfassung_text: composeFor(i),
                          })}>
                            <IconSparkles size={18} className="shrink-0" />
                            <span className="truncate">{tx('Zusammenfassen')}</span>
                          </Button>
                        )}
                      </div>
                    </article>
                  );
                })}
                {shown.length === 0 && (
                  <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                    {filter !== 'all'
                      ? tx('Keine Interaktion in diesem Filter.')
                      : tx('Noch keine Interaktionen — lege den ersten Schritt dieser Veranstaltung an.')}
                    {filter === 'all' && current && crud.interaktionen.canWrite && (
                      <div className="mt-3">
                        <Button className="h-11" onClick={() => crud.interaktionen.openCreate({ veranstaltung: current.record_id, reihenfolge: mine.length + 1 })}>
                          <IconPlus size={16} className="shrink-0" />{tx('Interaktion anlegen')}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {current && mine.length > 0 && crud.interaktionen.canWrite && (
                <Button className="mt-4 h-11 w-full sm:w-auto" variant="outline" onClick={() => crud.interaktionen.openCreate({ veranstaltung: current.record_id, reihenfolge: mine.length + 1 })}>
                  <IconPlus size={16} className="shrink-0" />{tx('Weitere Interaktion')}
                </Button>
              )}
            </section>
          )}
          aside={(
            <>
              <WorkList
                title={tx('Antwort der KI eintragen')}
                icon={<IconSparkles size={14} />}
                items={offeneKi.map(z => {
                  const go = flowActionFor('zusammenfassungen', 'ki_antwort', z.record_id);
                  return {
                    id: z.record_id,
                    title: z.interaktionName || appLabel('zusammenfassungen'),
                    secondLine: <span className="text-muted-foreground"><span className="font-medium text-amber-600">{tx('Antwort fehlt')}</span> · {ago(z.fields.zeitpunkt)}</span>,
                    action: go ? { label: tx('Antwort eintragen'), onClick: go } : undefined,
                  };
                })}
                onItemClick={id => { const r = zusammenfassungen.find(z => z.record_id === id); if (r) crud.zusammenfassungen.openDetail(r); }}
                empty={{ text: tx('Alle Zusammenfassungen haben eine KI-Antwort.') }}
              />
              <WorkList
                title={tx('Neue Abschlussbewertungen')}
                icon={<IconCheck size={14} />}
                items={neueBewertungen.map(b => ({
                  id: b.record_id,
                  title: b.fields.kuerzel ? tx`Kürzel ${b.fields.kuerzel}` : appLabel('abschlussbewertungen'),
                  secondLine: <span className="text-muted-foreground">{b.veranstaltungName} · {(b.fields.referenzstatement || b.fields.besonders_toll || '').slice(0, 60)}</span>,
                }))}
                onItemClick={id => { const r = abschlussbewertungen.find(b => b.record_id === id); if (r) crud.abschlussbewertungen.openDetail(r); }}
                empty={{ text: tx('Noch keine Abschlussbewertung eingegangen.') }}
              />
            </>
          )}
        />
      )}
      {crud.surfaces}
    </div>
  );
}
