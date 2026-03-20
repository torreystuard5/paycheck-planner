from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import auth

app = FastAPI(
    title="Paycheck Planner API",
    version="1.0.0",
    description="Budgeting SaaS for paycheck-based financial planning",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/v1")


@app.get("/health")
async def health_check():
    return {"status": "healthy"}
