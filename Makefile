.PHONY: setup infra-up infra-down consumer producer streamer frontend help py-venv

# Directory Variables
BACKEND_DIR = OnlineApps/Backend
FRONTEND_DIR = OnlineApps/Frontend/kafka-dashboard
KAFKA_DIR = OnlineApps/kafka-docker

# Executables
PYTHON_VENV = OnlineApps/Backend/.venv
PIP = $(BACKEND_DIR)/.venv/bin/pip

help:
	@echo "GO-TR Real-time Deviation Monitor - Makefile Commands"
	@echo "---------------------------------------------------"
	@echo "Setup:"
	@echo "  make setup        - Install backend (.venv) and frontend (npm) dependencies"
	@echo "  make py-venv      - Spawn subshell with Python venv active"
	@echo ""
	@echo "Infrastructure:"
	@echo "  make infra-up     - Start Kafka cluster via Docker Compose"
	@echo "  make infra-down   - Stop Kafka cluster"
	@echo ""
	@echo "Services (Run each in a separate terminal):"
	@echo "  make consumer     - Start the GO-TR Kafka Consumer (Port 8000)"
	@echo "  make producer     - Start the Webhook Producer (Port 8100)"
	@echo "  make frontend     - Start the React Dashboard (Port 5173)"
	@echo ""
	@echo "Simulation:"
	@echo "  make streamer     - Run the XES Streamer to simulate incoming events"

setup:
	@echo "==> Setting up Python virtual environment (Python 3.12)..."
	cd $(BACKEND_DIR) && python3.12 -m venv .venv
	@echo "==> Installing backend dependencies..."
	$(PIP) install -r requirements.txt
	@echo "==> Installing frontend dependencies..."
	cd $(FRONTEND_DIR) && npm install
	@echo "==> Setup complete!"

infra-up:
	@echo "==> Starting Kafka cluster..."
	cd $(KAFKA_DIR) && docker-compose up -d

infra-down:
	@echo "==> Stopping Kafka cluster..."
	cd $(KAFKA_DIR) && docker-compose down

consumer:
	@echo "==> Starting GO-TR Consumer (Port 8000)..."
	cd $(BACKEND_DIR) && PYTHONPATH=. .venv/bin/python KafkaConsumer/Main.py

producer:
	@echo "==> Starting Webhook Producer (Port 8100)..."
	cd $(BACKEND_DIR) && PYTHONPATH=. .venv/bin/python KafkaProducer/Producer.py

streamer:
	@echo "==> Starting XES Event Streamer..."
	cd $(BACKEND_DIR)/StreamerMachine && PYTHONPATH=.. ../.venv/bin/python Streamer.py

frontend:
	@echo "==> Starting React Frontend (Port 5173)..."
	cd $(FRONTEND_DIR) && npm run dev

py-venv:
	@echo "Note: Make executes commands in a subshell, so it cannot activate a venv in your current terminal directly."
	@echo "To activate in your current terminal, run:"
	@echo "  source $(PYTHON_VENV)/bin/activate"
	@echo ""
	@echo "==> Spawning a new shell with virtualenv active (type 'exit' to return)..."
	@VIRTUAL_ENV="$(CURDIR)/$(PYTHON_VENV)" PATH="$(CURDIR)/$(PYTHON_VENV)/bin:$$PATH" $${SHELL:-/bin/zsh} || true
