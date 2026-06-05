# devhome — a fully local Chrome new-tab extension (Vite). No backend.

FRONTEND_DIR := frontend

.DEFAULT_GOAL := help
.PHONY: help install dev build preview lint format optimize-images clean

help: ## Show available targets
	@grep -E '^[a-zA-Z_-]+:.*## ' $(MAKEFILE_LIST) | \
		awk -F':.*## ' '{ printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2 }'

install: ## Install frontend dependencies
	cd $(FRONTEND_DIR) && npm install

dev: ## Run the Vite dev server (http://localhost:5173)
	cd $(FRONTEND_DIR) && npm run dev

build: ## Build the extension into frontend/dist (load it unpacked)
	cd $(FRONTEND_DIR) && npm run build

preview: ## Preview the production build
	cd $(FRONTEND_DIR) && npm run preview

lint: ## Lint the frontend
	cd $(FRONTEND_DIR) && npm run lint

format: ## Format the frontend with Prettier
	cd $(FRONTEND_DIR) && npm run format

optimize-images: ## Downscale wallpaper images for performance
	bash scripts/optimize-images.sh

clean: ## Remove the built extension
	rm -rf $(FRONTEND_DIR)/dist
