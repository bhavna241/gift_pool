# Gift Pool Management and Settlement System

Gift Pool is a small organiser dashboard for tracking contributions toward a shared gift or expense. It works for farewell gifts, trips, group events, shared purchases, and similar pools.

## Features

- Create a pool with a name, budget, and INR currency default
- Add and remove participants
- Record multiple payments per participant, with optional notes
- Calculate equal fair shares and participant balances
- Show total collected, remaining amount, surplus, and collection status
- Generate participant-to-participant settlement transactions
- Import messy historical contributions from CSV
- Normalize obvious name variations and report merged names
- Skip deterministic duplicate imported rows
- Reject invalid imported rows with reasons
- Responsive vanilla HTML/CSS/JavaScript dashboard

## Technology Stack

- Node.js and Express.js
- MongoDB and Mongoose
- HTML, CSS, and vanilla JavaScript with the Fetch API
- `multer` for in-memory CSV upload handling
- `csv-parse` for CSV parsing

## Project Structure

```text
gift_pool/
├── models/
│   ├── Pool.js
│   ├── Participant.js
│   └── Payment.js
├── routes/
│   └── poolRoutes.js
├── public/
│   ├── index.html
│   ├── app.js
│   └── styles.css
├── server.js
├── package.json
├── package-lock.json
├── .env.example
├── README.md
├── REASONING.md
└── AI_LOGS.md
```

## Prerequisites

- Node.js 18 or newer
- npm
- MongoDB, either locally or through Docker

## Installation

```bash
npm install
cp .env.example .env
```

## MongoDB Configuration

Set `MONGODB_URI` in `.env`:

```env
PORT=3000
MONGODB_URI=mongodb://127.0.0.1:27017/gift_pool
```

For a temporary local MongoDB container:

```bash
docker run --rm -d --name gift-pool-mongo -p 27017:27017 mongo:8
```

The server logs a warning and can start without a URI, but database-backed requests require MongoDB and a valid `MONGODB_URI`.

## Running

```bash
npm start
```

Open <http://127.0.0.1:3000/> in a browser. The development command is:

```bash
npm run dev
```

## API Endpoints

### Health

```text
GET /api/health
```

### Pools and participants

```text
POST   /api/pools
GET    /api/pools/:poolId
POST   /api/pools/:poolId/participants
DELETE /api/pools/:poolId/participants/:participantId
```

### Payments and summaries

```text
POST   /api/pools/:poolId/payments
DELETE /api/pools/:poolId/payments/:paymentId
GET    /api/pools/:poolId/summary
GET    /api/pools/:poolId/settlements
```

### CSV import

```text
POST /api/pools/:poolId/import
```

Send a `multipart/form-data` request with the CSV in the `file` field. The upload is held in memory and limited to 1 MiB. CSV headers can be `name,amount,note`; `participant`/`participantName`, `payment`/`contribution`, and `description` are also accepted as aliases.

## Fair Share, Balance, and Collection Status

For a budget $B$ and $N$ participants:

$$
\\text{fairShare} = \\frac{B}{N}
$$

For participant $i$ with total paid amount $P_i$:

$$
\\text{balance}_i = P_i - \\text{fairShare}
$$

- Negative balance: the participant owes money.
- Zero balance: the participant is settled.
- Positive balance: the participant should receive money.

Collection status is independent of individual balances:

- `remaining` when total collected is below the budget
- `complete` when total collected equals the budget
- `surplus` when total collected exceeds the budget

Amounts are accepted by the API in rupees and stored as integer paise for payments. The API converts payment totals back to rupees in responses.

## Settlement Behavior

`GET /api/pools/:poolId/settlements` creates transactions only when collection status is `complete`. It places negative balances in a debtor list, positive balances in a creditor list, and greedily matches each debtor to each creditor for the smaller outstanding amount.

Under-collected pools report the remaining amount and return no participant settlement transactions. Over-collected pools report the surplus and also return no fabricated participant transactions. If everyone is settled, the transaction list is empty.

## Edge Cases

- Empty or invalid pool, participant, and payment identifiers are rejected.
- Pool names and participant names are required.
- Budgets and payments must be positive numbers.
- Participants must belong to the pool used for a payment.
- A payment can be recorded more than once for the same participant.
- A participant can have no payment, a partial payment, an exact payment, or an excess payment.
- Zero participants produce a zero fair share and no settlement transactions.
- A participant deletion only removes a participant belonging to the specified pool.
- Settlement is withheld until the target is fully collected.

## The Twist: CSV Import

The dashboard includes an **Import a CSV** section. Select a file and submit it after creating a pool. The dashboard displays the import report and refreshes participants, balances, summary cards, and settlement information.

### Accepted amount formats

The importer accepts positive values such as:

```text
2000
2000.50
₹2000
₹2,000
Rs 2,000
Rs. 2000
2,000
```

Amounts containing commas must be quoted according to CSV rules.

### Name normalization and merging

Names are trimmed, repeated whitespace is collapsed, and comparisons are case-insensitive. Exact normalized matches use an existing participant. A conservative edit-distance match of at most one character is used only when there is exactly one eligible existing participant and both names have at least four characters. Otherwise, a valid unmatched name creates a new participant.

### Duplicate detection

Each imported payment receives an `importKey` made from the matched participant ID, normalized amount in paise, and normalized note. A repeated key in the same file or a later import is skipped, so it is not double-counted. Separate same-amount contributions should use different notes when they represent distinct rows.

### Invalid rows and import report

Rows with a missing name, missing/invalid amount, zero amount, negative amount, or unusable amount format are rejected. The response and dashboard report include:

- Total rows processed
- Successfully imported rows
- Duplicate rows skipped
- Merged-name count and original-to-matched names
- Rejected-row count and row-level reasons

Valid imported rows become normal `Payment` documents, so existing summaries and settlements include them immediately.

### Valid CSV example

Comma-containing amounts must be quoted:

```csv
name,amount,note
Alice,2000,initial
Alice,"₹2,000",second contribution
Alic,1000,bonus
Bob,"Rs 1,000",first
Charlie,"2,000",upi
Grace,2000.50,decimal contribution
```