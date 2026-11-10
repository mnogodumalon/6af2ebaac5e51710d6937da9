import type { Zusammenfassungen, Interaktionen } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';
import {
  RecordSection, RecordField, RecordRelation, RecordAttachments,
} from '@/components/widgets/RecordView';
import { t, appLabel, fieldLabel } from '@/i18n';
import { usePermissions } from '@/lib/permissions';

export interface ZusammenfassungenDetailsProps {
  /** Der Record — enriched oder roh; alle Felder werden hier gerendert. */
  record: Zusammenfassungen;
  /** N:1-Ziel „Interaktionen": volle Liste (Hook-Array) — der Block löst Name + Schlüsselfelder selbst auf. */
  interaktionenList: Interaktionen[];
  /** Klick auf die Interaktionen-Relation → overlay.push auf dessen Detail. */
  onOpenInteraktionen?: (record: Interaktionen) => void;
}

export function ZusammenfassungenDetails({
  record,
  interaktionenList,
  onOpenInteraktionen,
}: ZusammenfassungenDetailsProps) {
  // attachments are a write to this record — read-only without the platform right
  const perms = usePermissions();
  const interaktionTarget = interaktionenList.find(r => r.record_id === extractRecordId(record.fields.interaktion));
  return (
    <>
      <RecordSection title={t('details')} cols={2}>
        <RecordField label={fieldLabel('zusammenfassungen', 'zeitpunkt')} value={record.fields.zeitpunkt} format="datetime" />
        <RecordField label={fieldLabel('zusammenfassungen', 'zusammenfassung_text')} value={record.fields.zusammenfassung_text} format="longtext" className="md:col-span-2" />
        <RecordField label={fieldLabel('zusammenfassungen', 'ki_antwort')} value={record.fields.ki_antwort} format="longtext" className="md:col-span-2" />
      </RecordSection>

      {/* N:1 — verknüpfte Records: IMMER klickbar, nie eine Text-Sackgasse. */}
      <RecordSection title={t('relations')} cols={1}>
        <RecordRelation
          label={fieldLabel('zusammenfassungen', 'interaktion')}
          name={interaktionTarget?.fields.frage ?? '—'}
          meta={undefined}
          onClick={interaktionTarget && onOpenInteraktionen ? () => onOpenInteraktionen!(interaktionTarget!) : undefined}
        />
      </RecordSection>

      <RecordAttachments appId={APP_IDS.ZUSAMMENFASSUNGEN} recordId={record.record_id} readOnly={!perms.canWrite('zusammenfassungen')} />
    </>
  );
}
