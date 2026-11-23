import { useEffect, useRef, useState } from 'react';
import { useSession, type SaveResult } from '../state/session';
import { DEFAULT_SETTINGS, parseSettings, serializeSettings, type ImportFormat, type Settings } from '../domain/config';
import { SAMPLE_SETTINGS } from '../domain/sample';
import { centsToDecimal, parseDecimalToCents } from '../domain/money';
import { todayIso, type IsoDate } from '../domain/dates';
import { Card, InfoButton } from './common';

const DELIMITERS = [
  { value: ',', label: 'Comma (,)' },
  { value: ';', label: 'Semicolon (;)' },
  { value: '\t', label: 'Tab' },
  { value: '|', label: 'Pipe (|)' },
];
const THOUSANDS = [
  { value: '', label: 'None' },
  { value: ',', label: 'Comma (,)' },
  { value: '.', label: 'Period (.)' },
  { value: ' ', label: 'Space' },
  { value: "'", label: "Apostrophe (')" },
];
const DATE_FORMATS = [
  { value: '%Y-%m-%d', label: 'Year-month-day (2025-03-17)' },
  { value: '%m/%d/%Y', label: 'Month/day/year (03/17/2025)' },
  { value: '%d/%m/%Y', label: 'Day/month/year (17/03/2025)' },
  { value: '%d-%m-%Y', label: 'Day-month-year (17-03-2025)' },
  { value: '%Y/%m/%d', label: 'Year/month/day (2025/03/17)' },
  { value: '%Y.%m.%d', label: 'Year.month.day (2025.03.17)' },
  { value: '%d.%m.%Y', label: 'Day.month.year (17.03.2025)' },
  { value: '%b %d, %Y', label: 'Month name day, year (Mar 17, 2025)' },
  { value: '%d/%m/%y', label: 'Day/month/two-digit year (17/03/25)' },
];
const CUSTOM_DATE_FORMAT = '__custom__';

function readSettings(text: string): Settings {
  const parsed = parseSettings(text);
  return parsed.ok ? parsed.value : DEFAULT_SETTINGS;
}

/** Import formats editor with the same autosave behaviour as the settings form. Lives on the Transactions screen, where the formats are used. */
export function ImportFormatsSection() {
  const session = useSession();
  const { snapshot, isSample, drafts, setDraft, saveSettings } = session;
  const savedText = snapshot?.settingsToml ?? '';
  const originalText = isSample ? SAMPLE_SETTINGS : savedText;
  const baseText = drafts.settings ?? originalText;
  const [form, setForm] = useState<Settings>(() => readSettings(baseText));
  const [customDateFormats, setCustomDateFormats] = useState<Record<number, boolean>>({});
  const [openFormats, setOpenFormats] = useState<Record<number, boolean>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // The text this form last wrote to the session draft. Anything else means an outside change (discard, reload).
  const pushed = useRef(baseText);
  const initialText = useRef(serializeSettings(readSettings(baseText)));
  const saveSettingsRef = useRef(saveSettings);
  saveSettingsRef.current = saveSettings;

  useEffect(() => {
    if (baseText !== pushed.current) {
      pushed.current = baseText;
      setForm(readSettings(baseText));
      setCustomDateFormats({});
    }
  }, [baseText]);

  const stored = parseSettings(savedText);
  const issues = formIssues(form);
  const pageIssues = issues.filter((message) => !/^Format .*: (?:name|date_column|amount_column) is required$|^Format .*: description_column or reference_column is required$/.test(message));
  const requiredFieldsValid = form.formats.every((format) =>
    format.name.trim() && format.dateColumn.trim() && format.amountColumn.trim() && (format.descriptionColumn?.trim() || format.referenceColumn?.trim()),
  );
  const valid = issues.length === 0 && requiredFieldsValid;
  const text = serializeSettings(form);
  // Autosave as soon as the user changes anything (skip the untouched initial value).
  const dirty = text !== initialText.current && text !== serializeSettings(readSettings(savedText));

  const update = (next: Settings) => {
    setForm(next);
    setNotice(null);
    const nextText = serializeSettings(next);
    if (parseSettings(nextText).ok && next.currencySymbol.trim()) {
      pushed.current = nextText;
      setDraft('settings', nextText);
    }
  };

  // Auto-save: no manual Save/Apply button. Debounced so typing does not spam writes.
  useEffect(() => {
    if (!valid || !dirty) return;
    setSaving(true);
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const result: SaveResult = await saveSettingsRef.current(text);
          setNotice(result.ok ? 'Saved automatically.' : 'Not saved. Fix the errors to save.');
        } catch {
          setNotice('Not saved. Fix the errors to save.');
        } finally {
          setSaving(false);
        }
      })();
    }, 400);
    return () => window.clearTimeout(timer);
  }, [text, valid, dirty]);

  const patchFormat = (index: number, patch: Partial<ImportFormat>) =>
    update({ ...form, formats: form.formats.map((f, i) => (i === index ? { ...f, ...patch } : f)) });

  const addFormat = () => {
    const index = form.formats.length;
    update({
      ...form,
      formats: [...form.formats, { name: `Format ${form.formats.length + 1}`, dateColumn: '', amountColumn: '', descriptionColumn: '', delimiter: ',', decimalSeparator: '.', thousandsSeparator: '' }],
    });
    setOpenFormats((prev) => ({ ...prev, [index]: true }));
  };

  const removeFormat = (index: number) => {
    update({ ...form, formats: form.formats.filter((_, i) => i !== index) });
    setCustomDateFormats({});
    setOpenFormats((prev) => Object.fromEntries(Object.entries(prev).filter(([i]) => Number(i) !== index).map(([i, v]) => [Number(i) > index ? Number(i) - 1 : i, v])));
  };

  return (
    <div className="settings-form">
      {!stored.ok && !isSample && <p className="warn">The saved settings could not be read ({stored.issues[0]?.message}). Showing defaults until you save.</p>}
      {pageIssues.length > 0 && (
        <div className="error-banner" role="alert">
          <ul>{pageIssues.map((message) => <li key={message}>{message}</li>)}</ul>
        </div>
      )}

      <Card title="Import formats" info="Each format describes the columns and number/date conventions used by a bank CSV export. Add one format for each bank export layout you import.">
        <p className="muted small">Describe how bank CSV exports are read. Each format is matched when you import a file.</p>
        {form.formats.length === 0 && (
          <div className="format-empty">
            <div className="format-empty-copy">
              <span className="format-empty-icon" aria-hidden="true">CSV</span>
              <div>
                <strong>No import formats configured</strong>
                <p className="muted small">Add a format to map your bank's CSV columns before importing transactions.</p>
              </div>
            </div>
            <button type="button" className="primary" onClick={addFormat}>Add format</button>
          </div>
        )}
        {form.formats.map((format, index) => {
          const delimiters = DELIMITERS.some((d) => d.value === format.delimiter) ? DELIMITERS : [...DELIMITERS, { value: format.delimiter, label: `Custom (${format.delimiter})` }];
          const isKnownDateFormat = DATE_FORMATS.some((dateFormat) => dateFormat.value === format.dateFormat);
          const isCustomDateFormat = customDateFormats[index] || Boolean(format.dateFormat && !isKnownDateFormat);
          const errors = {
            name: format.name.trim() ? '' : 'Format name is required.',
            dateColumn: format.dateColumn.trim() ? '' : 'Date column is required.',
            amountColumn: format.amountColumn.trim() ? '' : 'Amount column is required.',
            descriptionOrReference: format.descriptionColumn?.trim() || format.referenceColumn?.trim() ? '' : 'Enter a description or reference column.',
          };
          const descriptionOrReferenceErrorId = `format-${index}-description-or-reference-error`;
          const complete = !errors.name && !errors.dateColumn && !errors.amountColumn && !errors.descriptionOrReference;
          return (
            <details
              className="format-card"
              key={index}
              aria-label={`Format ${index + 1}`}
              open={openFormats[index] ?? false}
              onToggle={(e) => {
                const el = e.target as HTMLDetailsElement | null;
                if (el) setOpenFormats((prev) => ({ ...prev, [index]: el.open }));
              }}
            >
              <summary className="format-summary">
                <span className="format-summary-title">{format.name.trim() || `Format ${index + 1}`}</span>
                <span className="format-summary-meta">
                  <span className={`format-summary-status ${complete ? 'is-done' : 'is-incomplete'}`}>{complete ? 'Complete' : 'Incomplete'}</span>
                  <span className="format-toggle"><span className="format-expand">Expand</span><span className="format-collapse">Collapse</span><span className="format-chevron" aria-hidden="true">⌄</span></span>
                </span>
              </summary>
              <div className="settings-grid">
                <label><span className="setting-label">Name<InfoButton label="Format name" text="A short name to identify this bank export format when importing a CSV." /></span>
                  <input value={format.name} aria-invalid={!format.name.trim()} aria-describedby={errors.name ? `format-${index}-name-error` : undefined} onChange={(e) => patchFormat(index, { name: e.target.value })} />
                  {errors.name && <span className="field-error" id={`format-${index}-name-error`}>{errors.name}</span>}
                </label>
                <label><span className="setting-label">Date column<InfoButton label="Date column" text="Enter the CSV header containing each transaction date." /></span>
                  <input value={format.dateColumn} aria-invalid={!format.dateColumn.trim()} aria-describedby={errors.dateColumn ? `format-${index}-date-column-error` : undefined} onChange={(e) => patchFormat(index, { dateColumn: e.target.value })} />
                  {errors.dateColumn && <span className="field-error" id={`format-${index}-date-column-error`}>{errors.dateColumn}</span>}
                </label>
                <label><span className="setting-label">Amount column<InfoButton label="Amount column" text="Enter the CSV header containing the transaction amount. Use one amount column for income and expenses." /></span>
                  <input value={format.amountColumn} aria-invalid={!format.amountColumn.trim()} aria-describedby={errors.amountColumn ? `format-${index}-amount-column-error` : undefined} onChange={(e) => patchFormat(index, { amountColumn: e.target.value })} />
                  {errors.amountColumn && <span className="field-error" id={`format-${index}-amount-column-error`}>{errors.amountColumn}</span>}
                </label>
                <label><span className="setting-label">Description column<InfoButton label="Description column" text="Optional CSV header containing the transaction description or payee." /></span>
                  <input value={format.descriptionColumn ?? ''} aria-invalid={Boolean(errors.descriptionOrReference)} aria-describedby={errors.descriptionOrReference ? descriptionOrReferenceErrorId : undefined} onChange={(e) => patchFormat(index, { descriptionColumn: e.target.value || undefined })} />
                  {errors.descriptionOrReference && <span className="field-error" id={descriptionOrReferenceErrorId}>{errors.descriptionOrReference}</span>}
                </label>
                <label><span className="setting-label">Reference column<InfoButton label="Reference column" text="Optional CSV header containing a bank reference or transaction identifier." /></span>
                  <input value={format.referenceColumn ?? ''} aria-invalid={Boolean(errors.descriptionOrReference)} aria-describedby={errors.descriptionOrReference ? descriptionOrReferenceErrorId : undefined} onChange={(e) => patchFormat(index, { referenceColumn: e.target.value || undefined })} />
                </label>
                <label><span className="setting-label">Purpose column (Verwendungszweck)<InfoButton label="Purpose column" text="Optional CSV header containing the purpose (Verwendungszweck). When the same person has several transactions, the purpose tells them apart for matching and duplicate detection." /></span>
                  <input value={format.purposeColumn ?? ''} placeholder="Optional, e.g. Verwendungszweck" onChange={(e) => patchFormat(index, { purposeColumn: e.target.value || undefined })} />
                </label>
                <label><span className="setting-label">Date format<InfoButton label="Date format" text="Choose the date order used in this bank export. Automatic detection is recommended unless dates are ambiguous." /></span>
                  <select
                    value={isCustomDateFormat ? CUSTOM_DATE_FORMAT : format.dateFormat ?? ''}
                    onChange={(e) => {
                      if (e.target.value === CUSTOM_DATE_FORMAT) setCustomDateFormats({ ...customDateFormats, [index]: true });
                      else {
                        setCustomDateFormats({ ...customDateFormats, [index]: false });
                        patchFormat(index, { dateFormat: e.target.value || undefined });
                      }
                    }}
                  >
                    <option value="">Automatic detection</option>
                    {DATE_FORMATS.map((dateFormat) => <option key={dateFormat.value} value={dateFormat.value}>{dateFormat.label}</option>)}
                    <option value={CUSTOM_DATE_FORMAT}>Other format (advanced)</option>
                  </select>
                  {isCustomDateFormat && <input aria-label="Custom date format" value={format.dateFormat ?? ''} placeholder="e.g. %Y-%m-%d" onChange={(e) => patchFormat(index, { dateFormat: e.target.value || undefined })} />}
                </label>
                <label><span className="setting-label">Delimiter<InfoButton label="Delimiter" text="Select the character that separates fields in each CSV row. Choose Custom when the bank uses another delimiter." /></span>
                  <select value={format.delimiter} onChange={(e) => patchFormat(index, { delimiter: e.target.value })}>
                    {delimiters.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                  </select>
                </label>
                <label><span className="setting-label">Decimal separator<InfoButton label="Decimal separator" text="Choose the character used between whole currency units and cents in the amount column." /></span>
                  <select value={format.decimalSeparator} onChange={(e) => patchFormat(index, { decimalSeparator: e.target.value })}>
                    <option value=".">Period (.)</option>
                    <option value=",">Comma (,)</option>
                  </select>
                </label>
                <label><span className="setting-label">Thousands separator<InfoButton label="Thousands separator" text="Choose the character used to group thousands in the amount column, or None if amounts are not grouped." /></span>
                  <select value={format.thousandsSeparator} onChange={(e) => patchFormat(index, { thousandsSeparator: e.target.value })}>
                    {THOUSANDS.filter((t) => t.value !== format.decimalSeparator).map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </label>
              </div>

              <div className="settings-grid">
                <label className="check">
                  <input
                    type="checkbox"
                    checked={format.balanceSnapshot !== undefined}
                    onChange={(e) => patchFormat(index, e.target.checked
                      ? { balanceSnapshot: 0, balanceSnapshotDate: todayIso(new Date()) }
                      : { balanceSnapshot: undefined, balanceSnapshotDate: undefined })}
                  />
                  <span className="setting-label">Set an opening balance from this export<InfoButton label="Opening balance" text="Use this CSV's balance snapshot to establish the account balance at the selected date." /></span>
                </label>
                {format.balanceSnapshot !== undefined && format.balanceSnapshotDate && (
                  <>
                    <label><span className="setting-label">Balance<InfoButton label="Opening balance amount" text="Enter the account balance represented by the imported statement." /></span>
                      <BalanceAmountInput value={format.balanceSnapshot} onChange={(balanceSnapshot) => patchFormat(index, { balanceSnapshot })} />
                    </label>
                    <label><span className="setting-label">Balance date<InfoButton label="Opening balance date" text="Set the date the opening balance applies to." /></span>
                      <input type="date" value={format.balanceSnapshotDate} onChange={(e) => { if (e.target.value) patchFormat(index, { balanceSnapshotDate: e.target.value as IsoDate }); }} />
                    </label>
                  </>
                )}
              </div>

              <div className="format-actions">
                <button type="button" onClick={() => removeFormat(index)}>Remove format</button>
              </div>
            </details>
          );
        })}
        {form.formats.length > 0 && <div className="format-add"><button type="button" onClick={addFormat}>Add format</button></div>}
      </Card>

      <footer className="settings-actions">
        <span className="muted" role="status">{saving ? 'Saving…' : notice ?? (valid ? 'Import formats are saved automatically.' : 'Fix the errors above to save.')}</span>
      </footer>
    </div>
  );
}

/** Messages that block saving: the form's own rules plus whatever the stored-format parser rejects. */
function formIssues(form: Settings): string[] {
  const messages: string[] = [];
  if (!form.currencySymbol.trim()) messages.push('Currency symbol is required.');
  const parsed = parseSettings(serializeSettings(form));
  if (!parsed.ok) messages.push(...parsed.issues.map((issue) => issue.message));
  return messages;
}

function BalanceAmountInput({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const [draft, setDraft] = useState(() => centsToDecimal(value));
  useEffect(() => setDraft(centsToDecimal(value)), [value]);

  return (
    <input
      type="text"
      inputMode="decimal"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const normalized = draft.trim().replace(',', '.').replace(/\.$/, '.0');
        try {
          const cents = parseDecimalToCents(normalized);
          onChange(cents);
          setDraft(centsToDecimal(cents));
        } catch {
          setDraft(centsToDecimal(value));
        }
      }}
    />
  );
}
