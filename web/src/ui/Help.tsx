import { PageHeader } from './common';

export function Help() {
  return (
    <div className="page">
      <PageHeader title="Help" />

      <section className="card" aria-labelledby="help-overview">
        <div className="card-title-text" id="help-overview">Overview</div>
        <p>This app has only three building blocks: <strong>Plan (Soll)</strong> — the monthly sum of your recurring entries, nothing else; <strong>Check (Prüfung)</strong> — whether a few truly predictable, one-sided payments actually happened, informational only; and <strong>Balance (Ist)</strong> — your account balance over time. In one sentence: the plan says what you intend, the check says whether fixed payments arrived, and the balance curve shows what is left.</p>
      </section>

      <section className="card" aria-labelledby="help-step1">
        <div className="card-title-text" id="help-step1">Step 1: Plan your budget</div>
        <p>Add recurring entries in <strong>Budget</strong> with the designed input fields (no TOML needed). The monthly planned total is always just the sum of these entries — individual bookings never change it. Use <code>description</code> only for entries you want checked; leave it empty for plan-only entries. The optional <code>purpose</code> (Verwendungszweck) field is finer than the description: when the same person has several transactions, only bookings containing that purpose match the entry. The <code>category</code> field is only a grouping label inside the budget, not a transaction category.</p>
        <p>Already have an old <code>financials.toml</code>? Use <strong>Import old TOML file</strong> on the Budget page (or drop the file there) — it is parsed and written directly into the form fields. The raw TOML stays available under the <strong>TOML</strong> tab for power users.</p>
        <pre>{`description = "Salary"        # verifiable: checked against bookings
purpose = "Monthly salary"  # optional: finer than description
amount = 2500.00
recurrence_months = 1

# plan-only: never checked, never alerted
description = ""            # leave empty
amount = -300.00            # e.g. your household share
category = "Household"`}</pre>
      </section>

      <section className="card" aria-labelledby="help-step2">
        <div className="card-title-text" id="help-step2">Step 2: Import CSV</div>
        <p>Import your bank CSV under <strong>Transactions → Import CSV</strong>. Imported transactions are needed only to reconstruct the balance (Ist) and to run the check (Prüfung). They do not change the planned total. In the bank format settings (<strong>Transactions → Bank Formats</strong>) you can map a <code>purpose_column</code> (Verwendungszweck) so transactions from the same person with different purposes are stored and matched separately.</p>
      </section>

      <section className="card" aria-labelledby="help-step3">
        <div className="card-title-text" id="help-step3">Step 3: Check whether payments happened</div>
        <p>Only entries <strong>with a description</strong> are checked. There are three groups:</p>
        <table className="ledger-table">
          <thead><tr><th>Group</th><th>Example</th><th>Has description?</th><th>Checked?</th></tr></thead>
          <tbody>
            <tr><td><strong>1. Fixed + one-sided</strong></td><td>Salary, rent, your own direct debits</td><td>Yes</td><td>Yes</td></tr>
            <tr><td><strong>2. Lump-sum payment</strong></td><td>Your partner&apos;s share of Spotify + electricity as one credit — one entry &quot;Lump-sum payment partner&quot; with the fixed total</td><td>Yes (without any individual item names)</td><td>Yes, as one item (the total)</td></tr>
            <tr><td><strong>3. Plan-only</strong></td><td>Household share, anything with a changing payer</td><td>No</td><td>No — no alerts</td></tr>
          </tbody>
        </table>
        <p><strong>Lump-sum example:</strong> one entry <code>description = "Lump-sum payment partner"</code>, <code>amount = 45.00</code> — do not put &quot;Spotify&quot; or &quot;electricity&quot; in the description. The check verifies the total, with no item breakdown.</p>
        <p className="error" role="note">Warning: only check fixed amounts. Variable amounts should only be planned, never checked — otherwise you will get false &quot;amount differs&quot; warnings.</p>
      </section>

      <section className="card" aria-labelledby="help-not">
        <div className="card-title-text" id="help-not">What this app deliberately does NOT do</div>
        <ul>
          <li>No transaction categories.</li>
          <li>No Splitwise reconciliation.</li>
          <li>No shared household bookkeeping.</li>
          <li>No remaining budget (no &quot;safe to spend&quot; figure).</li>
        </ul>
      </section>

      <section className="card" aria-labelledby="help-curve">
        <div className="card-title-text" id="help-curve">Reading the balance curve</div>
        <p>The balance curve on Insights shows your account balance over time. Is it rising or falling as planned? The monthly <strong>balance change (delta)</strong> — the difference to the previous month — is the real result: positive means the balance grew, negative means it shrank.</p>
      </section>

      <section className="card" aria-labelledby="help-faq">
        <div className="card-title-text" id="help-faq">FAQ</div>
        <dl className="detail">
          <dt>Why does an entry report &quot;missing&quot;?</dt>
          <dd>An entry with a description is expected every month (or in its payment months) and no matching booking was found — e.g. the payment has not arrived yet, or its description does not contain the entry&apos;s description text.</dd>
          <dt>Why does it say &quot;amount differs&quot;?</dt>
          <dd>A booking matched the description but not the planned amount. Only check fixed amounts; variable amounts should be plan-only (no description).</dd>
          <dt>Why does my household share never appear as a booking?</dt>
          <dd>Plan-only entries (no description) are never matched and never appear in the health check. They only count toward the planned total — that is intentional, because the payer changes in a shared household.</dd>
        </dl>
      </section>
    </div>
  );
}
