#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
rustup target add wasm32-unknown-unknown
if ! command -v wasm-bindgen >/dev/null || [[ "$(wasm-bindgen --version)" != 'wasm-bindgen 0.2.128' ]]; then
  cargo install wasm-bindgen-cli --version 0.2.128 --locked
fi
cargo build --manifest-path engine/Cargo.toml --release --target wasm32-unknown-unknown --locked
wasm-bindgen engine/target/wasm32-unknown-unknown/release/openstep_dwg.wasm --target web --out-dir engine/pkg --out-name dwg
node scripts/engine-provenance.mjs
