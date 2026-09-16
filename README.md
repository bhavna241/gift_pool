# Gift Pool Management and Settlement System

A web applicatiosn for managing shared expenses and fairly settling contributions for a group.

The application allows an organiser to create a pool with a target budget, add participants, record their contributions, view individual balances, and generate a simple settlement list showing who should pay whom.

The system is generic and can be used for farewell gifts, group events, trips, shared purchases, or any other situation where multiple people contribute toward a common target.

## Features

- Create a gift/expense pool with a name and budget
- Add participants to the pool
- Remove participants
- Calculate equal fair share automatically
- Record multiple payments from the same participant
- View total amount collected
- View remaining amount when the target has not been reached
- View surplus when contributions exceed the target
- View each participant's:
  - Total paid
  - Fair share
  - Balance
  - Payment status
- Generate a simple settlement list
- Validate pool, participant, and payment data
- Handle partial contributions, full contributions, extra contributions, and unpaid participants
- Store monetary values safely using paise internally

## Technology Stack

### Frontend
- HTML
- CSS
- Vanilla JavaScript
- Fetch API

### Backend
- Node.js
- Express.js
- REST API

### Database
- MongoDB
- Mongoose

### Development
- Git
- GitHub
- GitHub Codespaces

## Project Structure

```text
gift_pool/
│
├── models/
│   ├── Pool.js
│   ├── Participant.js
│   └── Payment.js
│
├── routes/
│   └── poolRoutes.js
│
├── public/
│   ├── index.html
│   ├── app.js
│   └── styles.css
│
├── server.js
├── package.json
├── package-lock.json
├── .env.example
├── README.md
├── REASONING.md
└── AI_LOGS.md