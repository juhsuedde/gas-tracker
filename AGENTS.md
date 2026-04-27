# AGENTS.md

## Dev server
```bash
npm run dev
```
Build: `npm run build` | Preview: `npm run preview`

## Storage
`src/lib/storage.js` uses JSONBin.io as cloud backend with localforage fallback. Falls back to local-only cache when `VITE_JSONBIN_KEY` / `VITE_JSONBIN_BIN_ID` are not set.

Setup (optional):
1. Create account at https://jsonbin.io
2. Create a Bin with initial data:
   ```json
   { "state": { "chuveiro": null, "cozinha": null, "reserva": "vazio" }, "cycles": [], "purchases": [] }
   ```
3. Copy the Bin ID from the URL
4. Add to `.env`:
   ```
   VITE_JSONBIN_KEY=your_master_key
   VITE_JSONBIN_BIN_ID=your_bin_id
   ```

No lint or typecheck tooling is configured.