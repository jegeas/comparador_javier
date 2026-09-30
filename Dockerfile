# Usa una imagen Python oficial ligera
FROM python:3.11-slim

# Directorio de trabajo
WORKDIR /app

# Copiar e instalar dependencias primero (aprovecha la caché de Docker)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copiar el resto del código y los PDFs
COPY . .

# Puerto que expone Cloud Run (8080 por defecto)
ENV PORT=8080

# Arrancar con gunicorn (producción)
CMD exec gunicorn --bind "0.0.0.0:$PORT" --workers 1 --threads 8 --timeout 120 app:app
