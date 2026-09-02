FROM node:22

ARG TZ
ENV TZ="$TZ"

# --- React Native / Expo notes -----------------------------------------------
# There is no headless RN runtime to install here (the app itself only runs on
# a device/emulator). Claude verifies its work with the project's own tooling
# via npx/node_modules, so nothing Expo-specific needs to be baked into the
# image:
#   npm run typecheck       (tsc --noEmit)
#   npx eslint .            (if configured)
#   npx jest                (jest-expo runs component tests headlessly in Node)
#   npm run export:check    (expo export --platform web = bundle-health check)
# node:22 matches CI. Expo SDK 54 requires "Node.js (LTS)"; Node 20 went EOL
# 2026-04-30, Node 22 (Jod) is supported through 2027-04-30.
# -----------------------------------------------------------------------------

ARG CLAUDE_CODE_VERSION=latest

# Install basic development tools and iptables/ipset
RUN apt-get update && apt-get install -y --no-install-recommends \
  less \
  git \
  procps \
  sudo \
  fzf \
  zsh \
  man-db \
  unzip \
  gnupg2 \
  gh \
  iptables \
  ipset \
  iproute2 \
  dnsutils \
  aggregate \
  jq \
  nano \
  vim \
  ripgrep \
  && apt-get clean && rm -rf /var/lib/apt/lists/*

# Ensure default node user has access to /usr/local/share
RUN mkdir -p /usr/local/share/npm-global && \
  chown -R node:node /usr/local/share

ARG USERNAME=node

# Persist bash history.
RUN SNIPPET="export PROMPT_COMMAND='history -a' && export HISTFILE=/commandhistory/.bash_history" \
  && mkdir /commandhistory \
  && touch /commandhistory/.bash_history \
  && chown -R $USERNAME /commandhistory

# Set `DEVCONTAINER` environment variable to help with orientation
ENV DEVCONTAINER=true

# Quality-of-life for Expo CLI inside a sandbox: no telemetry, no update nags
ENV EXPO_NO_TELEMETRY=1

# better-sqlite3@13 bundles prebuilt binaries, but npm 10 still runs a no-op
# `node-gyp rebuild` at install (npm/cli#9837: `gypfile: false` is dropped from
# the registry manifest). node-gyp's configure step then fetches Node headers
# from nodejs.org, which the firewall blocks. Point it at the headers this image
# already ships so `npm ci` no longer needs nodejs.org. Remove once the fix
# (npm/cli#9859) ships in the npm that node:22 bundles; until then this line is
# a silent no-op-preserver, nothing will fail to prompt its removal.
ENV npm_config_nodedir=/usr/local

# Create workspace and config directories and set permissions
RUN mkdir -p /workspace /home/node/.claude && \
  chown -R node:node /workspace /home/node/.claude

WORKDIR /workspace

ARG GIT_DELTA_VERSION=0.18.2
RUN ARCH=$(dpkg --print-architecture) && \
  wget "https://github.com/dandavison/delta/releases/download/${GIT_DELTA_VERSION}/git-delta_${GIT_DELTA_VERSION}_${ARCH}.deb" && \
  sudo dpkg -i "git-delta_${GIT_DELTA_VERSION}_${ARCH}.deb" && \
  rm "git-delta_${GIT_DELTA_VERSION}_${ARCH}.deb"

# Set up non-root user
USER node

# Install global packages
ENV NPM_CONFIG_PREFIX=/usr/local/share/npm-global
ENV PATH=$PATH:/usr/local/share/npm-global/bin

# Set the default shell to zsh rather than sh
ENV SHELL=/bin/zsh

# Set the default editor and visual
ENV EDITOR=nano
ENV VISUAL=nano

# Default powerline10k theme
ARG ZSH_IN_DOCKER_VERSION=1.2.0
RUN sh -c "$(wget -O- https://github.com/deluan/zsh-in-docker/releases/download/v${ZSH_IN_DOCKER_VERSION}/zsh-in-docker.sh)" -- \
  -p git \
  -p fzf \
  -a "source /usr/share/doc/fzf/examples/key-bindings.zsh" \
  -a "source /usr/share/doc/fzf/examples/completion.zsh" \
  -a "export PROMPT_COMMAND='history -a' && export HISTFILE=/commandhistory/.bash_history" \
  -x

# Install Claude
RUN npm install -g @anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}


# Copy and set up firewall script
COPY init-firewall.sh /usr/local/bin/
USER root
RUN chmod +x /usr/local/bin/init-firewall.sh && \
  echo "node ALL=(root) NOPASSWD: /usr/local/bin/init-firewall.sh" > /etc/sudoers.d/node-firewall && \
  chmod 0440 /etc/sudoers.d/node-firewall
USER node