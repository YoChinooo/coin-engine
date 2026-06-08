from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routes import market

app = FastAPI(
    title="Market Intelligence & Crypto Signal Engine",
    description="AI-powered market analysis platform. All outputs are probabilistic and not financial advice.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(market.router, prefix="/api")


@app.get("/")
async def root():
    return {
        "name": "Market Intelligence & Crypto Signal Engine",
        "version": "0.1.0",
        "docs": "/docs",
    }


@app.get("/health")
async def health():
    return {"status": "ok"}
