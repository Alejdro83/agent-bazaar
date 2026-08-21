#!/bin/bash
# Stop Agent Bazaar bot
pkill -f "node dist/bot/index.js" 2>/dev/null && echo "Bot stopped" || echo "Bot not running"
