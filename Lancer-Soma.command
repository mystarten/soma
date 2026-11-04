#!/bin/bash
cd "$(dirname "$0")"
if ! command -v node >/dev/null; then
  echo "Node.js n'est pas installé. Une page va s'ouvrir : installe la version LTS, puis relance ce fichier."
  open https://nodejs.org
  exit 1
fi
[ -d node_modules ] || npm install --no-audit --no-fund
(sleep 5; open http://localhost:5173/soma/) &
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
