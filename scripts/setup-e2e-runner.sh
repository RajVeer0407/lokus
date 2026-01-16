#!/bin/bash
# Setup script for Lokus E2E self-hosted GitHub Actions runner
# Run this on a fresh Ubuntu 24.04 installation
#
# Usage: sudo ./setup-e2e-runner.sh <GITHUB_RUNNER_TOKEN>
#
# Get the token from: https://github.com/AugmentedMind/lokus/settings/actions/runners/new

set -e

RUNNER_TOKEN="${1:-}"
REPO_URL="https://github.com/AugmentedMind/lokus"
RUNNER_NAME="lokus-e2e-runner"
RUNNER_LABELS="self-hosted,linux,lokus-e2e"
RUNNER_USER="runner"
RUNNER_DIR="/home/${RUNNER_USER}/actions-runner"

echo "=========================================="
echo "Lokus E2E Runner Setup Script"
echo "=========================================="

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo "Error: Please run as root (sudo)"
  exit 1
fi

# Check for runner token
if [ -z "$RUNNER_TOKEN" ]; then
  echo ""
  echo "Warning: No GitHub Runner token provided."
  echo "You'll need to configure the runner manually later."
  echo ""
  echo "Get your token from:"
  echo "  ${REPO_URL}/settings/actions/runners/new"
  echo ""
fi

echo ""
echo "[1/8] Updating system packages..."
apt-get update
apt-get upgrade -y

echo ""
echo "[2/8] Installing system dependencies..."
apt-get install -y \
  curl \
  wget \
  git \
  build-essential \
  pkg-config \
  libssl-dev \
  libgtk-3-dev \
  libwebkit2gtk-4.1-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  patchelf \
  libgit2-dev \
  libsecret-1-dev \
  webkit2gtk-driver \
  xvfb \
  xauth \
  dbus-x11 \
  at-spi2-core \
  libatk1.0-0 \
  libatk-bridge2.0-0 \
  libcups2 \
  libdrm2 \
  libxkbcommon0 \
  libxcomposite1 \
  libxdamage1 \
  libxfixes3 \
  libxrandr2 \
  libgbm1 \
  libasound2 \
  jq

echo ""
echo "[3/8] Installing Node.js 22..."
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs

echo ""
echo "[4/8] Installing Rust..."
if [ ! -d "/home/${RUNNER_USER}" ]; then
  useradd -m -s /bin/bash ${RUNNER_USER}
fi

sudo -u ${RUNNER_USER} bash -c '
  curl --proto "=https" --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
  source ~/.cargo/env
  rustup default stable
'

echo ""
echo "[5/8] Installing tauri-driver..."
sudo -u ${RUNNER_USER} bash -c '
  source ~/.cargo/env
  cargo install tauri-driver
'

echo ""
echo "[6/8] Setting up GitHub Actions Runner..."
mkdir -p ${RUNNER_DIR}
chown ${RUNNER_USER}:${RUNNER_USER} ${RUNNER_DIR}

# Download latest runner
cd ${RUNNER_DIR}
RUNNER_VERSION=$(curl -s https://api.github.com/repos/actions/runner/releases/latest | grep -oP '"tag_name": "v\K[^"]+')
curl -o actions-runner-linux-x64.tar.gz -L "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz"
tar xzf actions-runner-linux-x64.tar.gz
rm actions-runner-linux-x64.tar.gz
chown -R ${RUNNER_USER}:${RUNNER_USER} ${RUNNER_DIR}

echo ""
echo "[7/8] Configuring runner..."
if [ -n "$RUNNER_TOKEN" ]; then
  sudo -u ${RUNNER_USER} bash -c "
    cd ${RUNNER_DIR}
    ./config.sh --url ${REPO_URL} --token ${RUNNER_TOKEN} --name ${RUNNER_NAME} --labels ${RUNNER_LABELS} --unattended --replace
  "

  # Install as service
  cd ${RUNNER_DIR}
  ./svc.sh install ${RUNNER_USER}
  ./svc.sh start

  echo ""
  echo "[8/8] Runner service started!"
else
  echo ""
  echo "[7/8] Skipping runner configuration (no token provided)"
  echo ""
  echo "To configure the runner manually, run:"
  echo "  sudo -u ${RUNNER_USER} bash"
  echo "  cd ${RUNNER_DIR}"
  echo "  ./config.sh --url ${REPO_URL} --token <YOUR_TOKEN> --name ${RUNNER_NAME} --labels ${RUNNER_LABELS}"
  echo ""
  echo "Then install as service:"
  echo "  sudo ./svc.sh install ${RUNNER_USER}"
  echo "  sudo ./svc.sh start"
fi

echo ""
echo "=========================================="
echo "Setup Complete!"
echo "=========================================="
echo ""
echo "Installed:"
echo "  - Node.js $(node --version)"
echo "  - npm $(npm --version)"
echo "  - Rust (check with: sudo -u ${RUNNER_USER} bash -c 'source ~/.cargo/env && rustc --version')"
echo "  - tauri-driver"
echo "  - Xvfb (virtual display)"
echo "  - WebKitGTK dependencies"
echo "  - GitHub Actions Runner"
echo ""
echo "Runner labels: ${RUNNER_LABELS}"
echo "Runner directory: ${RUNNER_DIR}"
echo ""
if [ -n "$RUNNER_TOKEN" ]; then
  echo "Runner status: Active"
  echo "Check status: sudo ./svc.sh status"
else
  echo "Runner status: Not configured (run config manually)"
fi
echo ""
