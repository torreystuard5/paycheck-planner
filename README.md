# PayDrift

Budgeting SaaS for paycheck-based financial planning. Allocate every dollar of your paycheck to bills, debts, and savings goals before you get paid.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for Conventional Commits, changelog policy, and local tooling (`npm run changelog`, `npm run commitlint`).

## Tech Stack

- **Backend:** Python 3.11+, FastAPI, SQLAlchemy 2.0 (async), Alembic
- **Database:** PostgreSQL (asyncpg)
- **Auth:** JWT (python-jose) + bcrypt (passlib)
- **Deployment:** Render (Docker)

## Local Setup

### 1. Clone & enter the project

```bash
git clone https://github.com/torreystuard5/paycheck-planner.git
cd paycheck-planner/backend
```

### 2. Create a virtual environment

```bash
python -m venv venv
source venv/bin/activate   # Linux/macOS
venv\Scripts\activate      # Windows
```

### 3. Install dependencies

```bash
pip install -r requirements.txt
```

### 4. Configure environment

```bash
cp ../.env.example .env
# Edit .env with your local PostgreSQL credentials and a secret key
```

### 5. Run database migrations

```bash
alembic upgrade head
```

### 6. Start the server

```bash
uvicorn app.main:app --reload
```

The API will be available at `http://localhost:8000`. Interactive docs at `http://localhost:8000/docs`.

## API Endpoints

| Method | Endpoint              | Description         | Auth     |
|--------|-----------------------|---------------------|----------|
| GET    | `/health`             | Health check        | Public   |
| POST   | `/api/v1/auth/register` | Create account    | Public   |
| POST   | `/api/v1/auth/login`    | Sign in           | Public   |
| POST   | `/api/v1/auth/refresh`  | Refresh token     | Public   |
| POST   | `/api/v1/auth/logout`   | Sign out          | Public   |
| GET    | `/api/v1/auth/me`       | Current user info | Bearer   |

## Database Schema

9 tables: `users`, `households`, `income_sources`, `bills`, `debts`, `savings_goals`, `savings_contributions`, `payments`, `support_tickets`.

## Deployment

This project includes a `render.yaml` for one-click deployment to Render. Connect your GitHub repo in the Render dashboard and it will auto-detect the blueprint.
