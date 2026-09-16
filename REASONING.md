# Implementation Reasoning

## Problem Interpretation

The application tracks a generic shared gift pool. An organiser sets a target budget, adds participants, records contributions, sees who is ahead or behind an equal share, and receives a simple list of participant-to-participant payments when the pool is fully funded. The Twist adds historical CSV data that may contain messy names, formats, duplicates, and invalid rows.

## MVP Scope

The implementation focuses on one organiser workflow: pool setup, participant management, payment tracking, summary, settlement, and CSV import. Authentication, user accounts, payment gateways, unequal shares, multiple currencies, exports, and persistent import-history screens were excluded because they are outside the core assessment workflow and the 2.5-hour constraint.

## Architecture

The browser uses the static files in `public/` and calls the Express REST API with `fetch()`. Express serves the dashboard, validates requests, and delegates persistence to Mongoose models. MongoDB stores pools, participants, and payments. The route layer contains the calculation and import logic to keep the project small and easy to inspect.

## Data Models

- `Pool`: name, budget, currency, and timestamps.
- `Participant`: name, `poolId`, and timestamps.
- `Payment`: `poolId`, `participantId`, integer paise amount, optional note, optional `importKey`, and timestamps.

`fairShare`, balances, collection status, and settlement transactions are derived at request time rather than stored, because they change when participants or payments change.

## Fair Share and Balances

For budget $B$ and participant count $N$:

$$
\text{fairShare} = \frac{B}{N}
$$

For participant payment total $P_i$:

$$
\text{balance}_i = P_i - \text{fairShare}
$$

Negative values mean the participant owes money; positive values mean the participant should receive money; zero means the participant is settled.

## Monetary Precision

Payment values are converted to integer paise before storage. For example, ₹2000.50 becomes `200050` paise. Summaries and settlements aggregate paise and convert to rupees for API/UI output. This avoids storing payment amounts as binary floating-point rupees. Pool budgets remain in the existing rupee-facing model and are converted to paise for summary and settlement comparisons.

## Collection Status vs Settlement

Collection status answers whether the pool target has been funded, while participant balances answer whether contributions are fair. A pool can be fully funded while one participant owes another. Settlement transactions are generated only when total collected exactly equals the budget. Under-collection returns the missing amount and no participant transfers; surplus returns the excess and no invented transfers.

## Greedy Settlement Algorithm

1. Aggregate payment totals for every participant.
2. Calculate each participant balance.
3. Put negative balances into a debtor list using their absolute owed amount.
4. Put positive balances into a creditor list using their amount due.
5. Match the current debtor and creditor.
6. Transfer the smaller outstanding amount.
7. Reduce both entries and advance a list when its amount reaches zero.
8. Continue until one list is exhausted.

This is simple, deterministic, and produces a practical list with no zero-value transactions. It is not intended to optimize globally for the mathematically fewest possible transfers.

## CSV Import Design

The importer accepts a multipart CSV upload at `POST /api/pools/:poolId/import`. `multer` keeps the file in memory with a 1 MiB limit, and `csv-parse` parses header-based rows. The importer uses the existing `Payment` model rather than introducing a second contribution system. Newly discovered valid names create participants in the current pool before their payments are stored.

## Amount Parsing

The parser trims the value, removes comma separators, removes an optional rupee symbol or `Rs`/`Rs.` prefix, accepts up to two decimal places, converts the result directly to paise, and rejects empty, malformed, zero, negative, or unsafe values. CSV values containing commas must be quoted so the CSV parser treats them as one field.

## Conservative Name Matching

Names are first trimmed, internal whitespace is collapsed, and comparison is case-insensitive. An exact normalized match is preferred. For obvious spelling variations, the importer calculates edit distance and merges only when the names are at least four characters and exactly one existing participant is within distance one. Ambiguous or more distant names are not merged; a valid unmatched name becomes a new participant. Every merge is included in the report.

## Duplicate Strategy and Re-imports

An imported row key is:

```text
normalized participant identity + normalized amount in paise + normalized note
```

The participant ID is used after name matching, so name variations that merge into one participant share the same identity. Keys are checked both against rows already seen in the current file and imported payments already stored for the pool. A repeated key is skipped. This makes re-importing the same file idempotent while allowing two same-amount contributions when their notes distinguish them. The tradeoff is deliberate: two truly separate same-amount rows with the same participant and same note are treated as duplicates.

## Invalid-Row Handling

Each invalid row is skipped without creating a payment. The report records its CSV row number, name when available, and a reason such as missing participant name or invalid positive amount. A malformed whole CSV is rejected as a request-level parsing error. Valid rows in the same file still import independently of rejected rows.

## Edge Cases

The API handles missing or invalid IDs, nonexistent pools, participants from another pool, empty participant lists, partial collection, surplus collection, all participants settled, duplicate imports, ambiguous names, and invalid monetary values. Database connection configuration is externalized through `MONGODB_URI`; database-backed operations require a reachable MongoDB instance.

## Phased Development

1. Foundation: Express server, Mongoose connection, environment template, health endpoint, and error handling.
2. Pool and participant management: models, CRUD endpoints, and response-time fair share.
3. Payment tracking: payment model, summary endpoint, paise storage, and participant balances.
4. Settlement: collection-aware greedy debtor/creditor matching.
5. Frontend: responsive dashboard, forms, loading/error states, summary table, and settlement view.
6. The Twist: multipart CSV import, amount cleaning, conservative name merging, duplicate protection, rejected-row reporting, and dashboard refresh.