#!/bin/bash
# Start Agent Bazaar bot on b-max
# Usage: ./start-bot.sh

cd /home/dungeonmaster/.openclaw/workspace/agent-bazaar

# Build if needed
if [ ! -d "dist" ] || [ "src/bot/index.ts" -nt "dist/bot/index.js" ]; then
    echo "Building bot..."
    npm run bot:build
fi

# Load env
set -a
source .env
set +a

# Start bot
echo "Starting Agent Bazaar bot..."
node dist/bot/index.js
