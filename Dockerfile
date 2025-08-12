# Node 20 + Python 3
FROM node:20-bookworm-slim

# System deps (add more if your Python libs need them)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-venv build-essential \
  && rm -rf /var/lib/apt/lists/*

# Single venv for all Python jobs; put it on PATH
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:${PATH}" \
    PYTHONUNBUFFERED=1 \
    NODE_ENV=production \
    PORT=3000

WORKDIR /app

# --- Install Node deps first for better caching
COPY alpha_beta_command_center/package*.json ./alpha_beta_command_center/
RUN cd alpha_beta_command_center && npm ci --omit=dev

# --- Install Python deps if requirements files exist
COPY alpha_beta_command_center/requirements.txt ./alpha_beta_command_center/requirements.txt
COPY list_gen_v2/requirements.txt ./list_gen_v2/requirements.txt
RUN if [ -f alpha_beta_command_center/requirements.txt ]; then pip install -r alpha_beta_command_center/requirements.txt; fi && \
    if [ -f list_gen_v2/requirements.txt ]; then pip install -r list_gen_v2/requirements.txt; fi

# --- Copy application code
COPY alpha_beta_command_center ./alpha_beta_command_center
COPY list_gen_v2 ./list_gen_v2

# Expose and run on port 3000
EXPOSE 3000
WORKDIR /app/alpha_beta_command_center
CMD ["npm","start"]
