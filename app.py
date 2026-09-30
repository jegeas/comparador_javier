import os
import json
import pathlib
import traceback
from flask import Flask, request, jsonify, send_from_directory
from google import genai
from google.genai import types

# ── Configuración ─────────────────────────────────────────────────────────────
GEMINI_API_KEY = os.environ["GEMINI_API_KEY"]          # Obligatorio via variable de entorno
BASE_DIR     = pathlib.Path(__file__).parent
PDF_NUEVO    = BASE_DIR / "nuevo reglamento del agua.pdf"
PDF_VIEJO    = BASE_DIR / "viejo reglamento agua.pdf"
PDF_CORDOBA  = BASE_DIR / "Ordenanza_25_Definitivo CORDOBA.pdf"
PDF_SAGUNTO  = BASE_DIR / "reglamento-regulador-del-servicio-de-abastecimiento-de-agua Sagunto.pdf"

client = genai.Client(api_key=GEMINI_API_KEY)
MODEL  = "gemini-3.8-flash"

app = Flask(__name__, static_folder="static", static_url_path="/static")

# ── Carga de PDFs a la Files API (una sola vez al arrancar) ───────────────────
print("Subiendo PDFs a Gemini Files API...")

with open(PDF_NUEVO, "rb") as f:
    file_nuevo = client.files.upload(
        file=f,
        config=types.UploadFileConfig(mime_type="application/pdf", display_name="Alcañiz - Nuevo Reglamento")
    )
with open(PDF_VIEJO, "rb") as f:
    file_viejo = client.files.upload(
        file=f,
        config=types.UploadFileConfig(mime_type="application/pdf", display_name="Alcañiz - Viejo Reglamento")
    )
with open(PDF_CORDOBA, "rb") as f:
    file_cordoba = client.files.upload(
        file=f,
        config=types.UploadFileConfig(mime_type="application/pdf", display_name="Córdoba - Reglamento")
    )
with open(PDF_SAGUNTO, "rb") as f:
    file_sagunto = client.files.upload(
        file=f,
        config=types.UploadFileConfig(mime_type="application/pdf", display_name="Sagunto - Reglamento")
    )

print(f"  [OK] Alcañiz Nuevo : {file_nuevo.name}")
print(f"  [OK] Alcañiz Viejo : {file_viejo.name}")
print(f"  [OK] Córdoba       : {file_cordoba.name}")
print(f"  [OK] Sagunto       : {file_sagunto.name}")
print("PDFs listos. Servidor iniciando...")


# ── Helpers ───────────────────────────────────────────────────────────────────

def file_part(uploaded_file):
    return types.Part.from_uri(file_uri=uploaded_file.uri, mime_type="application/pdf")


def clean_json(text: str) -> str:
    """Elimina bloques markdown que Gemini añade a veces."""
    text = text.strip()
    if text.startswith("```"):
        parts = text.split("```")
        text = parts[1] if len(parts) > 1 else text
        if text.startswith("json"):
            text = text[4:]
    return text.strip()


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return send_from_directory(BASE_DIR, "index.html")


@app.route("/ask", methods=["POST"])
def ask():
    """Responde una pregunta comparando la respuesta entre los 4 reglamentos."""
    body     = request.get_json()
    pregunta = body.get("pregunta", "").strip()
    if not pregunta:
        return jsonify({"ok": False, "error": "Pregunta vacia"}), 400

    prompt = f"""Eres un experto juridico en reglamentos del agua.

Se te proporcionan CUATRO reglamentos municipales del servicio de abastecimiento de agua:
  - ARCHIVO 1: Reglamento NUEVO de Alcañiz (vigente actual).
  - ARCHIVO 2: Reglamento VIEJO de Alcañiz (anterior, derogado).
  - ARCHIVO 3: Reglamento de Córdoba.
  - ARCHIVO 4: Reglamento de Sagunto.

El usuario pregunta: {pregunta}

IMPORTANTE: Si la pregunta NO puede responderse con el contenido de estos reglamentos (tema ajeno, pregunta general, etc.), devuelve EXCLUSIVAMENTE este JSON:
{{"fuera_ambito": true}}

Si la pregunta SI tiene respuesta en los reglamentos, devuelve EXCLUSIVAMENTE este JSON (sin texto extra, sin bloques markdown):
{{
  "fuera_ambito": false,
  "respuesta_nuevo":    "Respuesta detallada segun el NUEVO reglamento de Alcañiz (vigente). Cita articulos si es posible. Si no contempla el punto, indica 'No contemplado'.",
  "respuesta_viejo":    "Respuesta segun el VIEJO reglamento de Alcañiz. Si no contempla el punto, indica 'No contemplado'.",
  "respuesta_cordoba":  "Respuesta segun el reglamento de Córdoba. Si no contempla el punto, indica 'No contemplado'.",
  "respuesta_sagunto":  "Respuesta segun el reglamento de Sagunto. Si no contempla el punto, indica 'No contemplado'.",
  "diferencias":        "Breve resumen comparativo de las principales diferencias y similitudes entre los cuatro reglamentos en relacion a la pregunta."
}}"""

    try:
        response = client.models.generate_content(
            model=MODEL,
            contents=[
                file_part(file_nuevo),
                file_part(file_viejo),
                file_part(file_cordoba),
                file_part(file_sagunto),
                prompt
            ]
        )
        text = clean_json(response.text)
        data = json.loads(text)
        return jsonify({"ok": True, "data": data})
    except json.JSONDecodeError:
        return jsonify({"ok": True, "data": {"raw": response.text}})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"ok": False, "error": str(e)}), 500


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(debug=False, host="0.0.0.0", port=port)
