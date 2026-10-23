FROM node:24-bookworm

ARG TZ=Europe/Helsinki
ENV TZ="$TZ"
ARG CLAUDE_CODE_VERSION=latest

# Dev tools + what the firewall script needs (iptables, ipset, dig, aggregate, jq)
RUN apt-get update && apt-get install -y --no-install-recommends \
      git less procps sudo fzf nano vim man-db unzip gnupg2 gh \
      iptables ipset iproute2 dnsutils aggregate jq curl ca-certificates \
      poppler-utils \
  && apt-get clean && rm -rf /var/lib/apt/lists/*

# Persistent shell history and Claude config (backed by Docker volumes)
RUN mkdir -p /commandhistory /home/node/.claude /workspace /usr/local/share/npm-global \
  && touch /commandhistory/.bash_history \
  && chown -R node:node /commandhistory /home/node/.claude /workspace /usr/local/share/npm-global

ENV DEVCONTAINER=true \
    HISTFILE=/commandhistory/.bash_history \
    PROMPT_COMMAND="history -a" \
    NPM_CONFIG_PREFIX=/usr/local/share/npm-global \
    PATH=$PATH:/usr/local/share/npm-global/bin \
    DISABLE_AUTOUPDATER=1

WORKDIR /workspace

# Claude Code CLI, installed as the non-root user
USER node
RUN npm install -g @anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}

# pnpm via npm (corepack is no longer bundled from Node 25). Keep in sync with
# "packageManager" in package.json.
ARG PNPM_VERSION=12.10.1
RUN npm install -g pnpm@${PNPM_VERSION}

# Firewall script: root-owned, and the only thing node may run with sudo
#USER root
#COPY init-firewall.sh /usr/local/bin/init-firewall.sh
#RUN chmod 0755 /usr/local/bin/init-firewall.sh \
#  && echo "node ALL=(root) NOPASSWD: /usr/local/bin/init-firewall.sh" > /etc/sudoers.d/node-firewall \
#  && chmod 0440 /etc/sudoers.d/node-firewall

USER node
