import os
import sys
import time
import requests
import sounddevice as sd
from fastapi import FastAPI, BackgroundTasks
from pydantic import BaseModel

# Ensure eSpeak NG path on Windows
ESPEAK_PATH = r"C:\Program Files\eSpeak NG"
if os.path.exists(ESPEAK_PATH) and ESPEAK_PATH not in os.environ.get("PATH", ""):
    os.environ["PATH"] += os.pathsep + ESPEAK_PATH
    os.environ["PHONEMIZER_ESPEAK_PATH"] = ESPEAK_PATH

from kokoro import KPipeline

app = FastAPI(title="Conversational Indian English Agent")

# Switch lang_code to 'h' for Indian English / Hindi phonetic styling
tts_pipeline = KPipeline(lang_code='h')

is_speaking = False

class TriggerPayload(BaseModel):
    user: str
    confidence: float = 1.0

def generate_conversational_greeting(name: str) -> str:
    """Prompts Ollama for a casual, warm Indian-English conversational greeting."""
    hour = time.localtime().tm_hour
    time_context = "morning" if hour < 12 else "afternoon" if hour < 18 else "evening"

    prompt = (
        f"You are a friendly, warm roommate or colleague who lives in India. "
        f"{name} has just walked into the room. It is {time_context}. "
        f"Say a brief, warm, natural welcome in 1 short sentence (under 10 words). "
        f"Speak naturally in everyday conversational Indian English (like: 'Hey {name}, welcome back! Good to see you.' or 'Hey, how did your work go today?'). "
        f"NEVER say: 'I am an AI', 'how may I assist', 'systems nominal', or robotic jargon. "
        f"Output ONLY the spoken sentence. No quotes, no markdown, no emojis."
    )
    
    try:
        res = requests.post(
            "http://127.0.0.1:11434/api/generate",
            json={
                "model": "llama3.2:1b",
                "prompt": prompt,
                "stream": False,
                "options": {
                    "temperature": 0.7,   # Slightly higher temperature for natural variety
                    "num_predict": 20
                }
            },
            timeout=2.0
        )
        if res.status_code == 200:
            text = res.json().get("response", "").strip()
            # Clean any stray quotes
            text = text.replace('"', '').replace("'", "")
            if text:
                return text
    except Exception:
        pass

    # Natural offline fallback
    return f"Hey {name}, welcome back! Good to see you."

def speak_audio(text: str):
    """Synthesizes text using the Indian English voice profile."""
    global is_speaking
    is_speaking = True
    print(f"\n[SPEAKING]: \"{text}\"")

    try:
        # Use 'hm_omega' (Arjun) for male or 'hf_alpha' (Ananya) for female
        generator = tts_pipeline(text, voice='hm_omega', speed=1.05)
        for _, _, audio in generator:
            sd.play(audio, samplerate=24000)
            sd.wait()
    finally:
        is_speaking = False

@app.post("/trigger")
async def handle_trigger(payload: TriggerPayload, background_tasks: BackgroundTasks):
    global is_speaking
    if is_speaking:
        return {"status": "busy"}

    greeting_text = generate_conversational_greeting(payload.user)
    background_tasks.add_task(speak_audio, greeting_text)
    
    return {"status": "triggered", "line": greeting_text}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)