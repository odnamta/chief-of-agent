.PHONY: build test install clean dev setup

# Build everything
build: build-cli build-macos build-dashboard

build-cli:
	npm run build

build-macos:
	cd macos && swift build -c release

build-dashboard:
	cd dashboard && npm run build

# Run all tests
test: test-cli test-macos

test-cli:
	npm test

test-macos:
	cd macos && swift test

# Install macOS menu bar app to ~/Applications
install: build-macos
	bash scripts/install-macos.sh

# Install CLI hooks
setup:
	node dist/cli.js setup --auto

setup-dashboard:
	node dist/cli.js setup --dashboard --auto

setup-http:
	node dist/cli.js setup --http --auto

# Development
dev:
	npm run dev

dev-dashboard:
	cd dashboard && npm run dev

# Clean build artifacts
clean:
	rm -rf dist/
	cd macos && swift package clean
	cd dashboard && rm -rf .next/

# Full setup from scratch
fresh: clean
	npm install
	cd dashboard && npm install
	$(MAKE) build
	$(MAKE) test
	@echo "\n  All good! Run 'make install' to install the macOS app."
