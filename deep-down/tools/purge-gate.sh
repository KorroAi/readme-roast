#!/usr/bin/env bash
# The creature purge gate (SPEC §13.1 U-PURGE): DEEP DOWN has no creatures, pets, companions or Wardens.
# Exits 1 on any hit outside the allow-list: lines that state the purge itself, or reference/ copies.
set -euo pipefail
cd "$(dirname "$0")/.."
hits=$(grep -rniE '\bcreatures?\b|bestiary|\bmoths?\b|luckyMoth|mothSwarm|mimic|treasureMole|\bmoles?\b|warden|golem|voidMaw|kindred' \
  src tests --include=*.ts | grep -viE 'purge|purged|no creatures|creature-free|Mother Cap' || true)
if [ -n "$hits" ]; then
  echo "$hits"
  echo "purge-gate: $(echo "$hits" | wc -l) hit(s)" >&2
  exit 1
fi
echo "purge-gate: clean"
