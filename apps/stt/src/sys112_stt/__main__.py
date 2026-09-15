from sys112_stt.app import app
from sys112_stt.config import STT_HOST, STT_PORT

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=STT_HOST, port=STT_PORT)
