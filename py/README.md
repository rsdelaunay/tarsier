# Tarsier engine on the phone

The phone grades a company with the same Python code as the PC, run in the browser with Pyodide.

- `pyodide/` – Pyodide 314.0.8 runtime (Python 3.14 in WebAssembly), Mozilla Public License 2.0.
- `wheels/` – openpyxl 3.1.5 and et_xmlfile 2.0.0 (MIT), used by the engine.
- `engine.zip` – the PC's `engine` folder (no GUI files, no publish code, no config, no tokens).
  Entry point: `engine/phone_engine.py` → `grade(ticker, facts_json, submissions_json, price, time)`.

When the engine changes on the PC, rebuild `engine.zip` and update it here through a pull request,
so the phone and the PC keep giving the same grade.
