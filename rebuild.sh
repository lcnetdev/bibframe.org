#!/bin/bash
set -e
cd "$(dirname "$0")"
git pull
docker compose down
docker compose build --no-cache
docker compose up -d
