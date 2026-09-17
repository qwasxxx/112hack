from sys112_tts.app import app
from sys112_tts.config import TTS_HOST, TTS_PORT

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=TTS_HOST, port=TTS_PORT)
