.PHONY: help test test-full shell setup-buildx build clean rebuild release node

IMAGE_NAME ?= gcr.io/distru-core-services/github/octokit

help:
	@echo "$(IMAGE_NAME):latest"
	@perl -nle'print $& if m{^[a-zA-Z_-]+:.*?## .*$$}' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-30s\033[0m %s\n", $$1, $$2}'

test: ## Run a mock test
	docker run --rm --env-file test/mock.env -v $$(pwd)/test:/opt/github/event -it $(IMAGE_NAME):latest github-script /opt/github/event/mock.js

test-full: ## Test a test against the real GitHub API
	@if [ ! -f test/full.env ]; then \
		echo "Missing test/full.env, create it first"; \
		exit 1; \
	fi
	docker run --rm --env-file test/full.env -v $$(pwd)/test:/opt/github/event -it $(IMAGE_NAME):latest github-script /opt/github/event/full.js

node: ## Get a Node.js shell
	docker run --rm -it $(IMAGE_NAME):latest node

shell: ## Get a Bash shell
	docker run --rm -it $(IMAGE_NAME):latest bash

setup-buildx: ## Setup a Buildx builder
	docker buildx create --append --name buildx-builder --driver docker-container --use
	docker buildx inspect --bootstrap --builder buildx-builder

build: ## Build the Docker image
	docker buildx build --load --platform linux/amd64 -t $(IMAGE_NAME):latest .

clean: ## Clean up generated images
	@docker rmi --force $(IMAGE_NAME):latest

rebuild: clean build ## Rebuild the Docker image

release: ## Build and release the Docker image to Docker Hub
	docker buildx build --push --platform linux/amd64 -t $(IMAGE_NAME):latest .
