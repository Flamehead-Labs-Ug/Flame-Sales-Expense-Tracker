FROM python:3.12-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application
COPY . .

# Expose the default port Render will expect (or we can override via env)
EXPOSE 8123

# Run the langgraph development server on 0.0.0.0 so it is externally accessible
CMD ["langgraph", "dev", "--host", "0.0.0.0", "--port", "8123"]
