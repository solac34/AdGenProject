FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Set default port if not provided
ENV PORT=8080

# Use exec form and add gunicorn configuration
CMD exec functions-framework --target=cronjob --port=$PORT --debug
