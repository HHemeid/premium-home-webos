#!/bin/zsh
# Double-click to open the Premium Home preview in your browser.
# Serves the app folder on this Mac only (127.0.0.1). Nothing connects to the TV.
cd "$(dirname "$0")"
URL="http://127.0.0.1:8642/"

if curl -s -o /dev/null "$URL"; then
  echo "Preview already running at $URL"
  open "$URL"
  exit 0
fi

echo "Premium Home preview: $URL"
echo "Close this window (or press Ctrl+C) to stop it."
(sleep 1; open "$URL") &
exec python3 tools/serve.py 8642
