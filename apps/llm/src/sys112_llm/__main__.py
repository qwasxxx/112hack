from sys112_llm.app import app
from sys112_llm.config import LLM_HOST, LLM_PORT

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=LLM_HOST, port=LLM_PORT)
