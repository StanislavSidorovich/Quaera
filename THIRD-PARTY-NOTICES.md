# Third-party notices

Quaera's own code is Apache-2.0 (see `LICENSE`) and its own learning
content is CC BY-NC-SA 4.0 (see `LICENSE-CONTENT`). This file lists the
third-party software bundled into the app or shipped to the browser
(`public/`), as required by their licenses.

## Bundled in the app (via `dependencies`)

- **React** and **React DOM** — Copyright (c) Meta Platforms, Inc. and
  affiliates. MIT License.
  https://github.com/facebook/react/blob/main/LICENSE

## Vendored into `public/` (fetched by `npm run prepare:assets`, not built from source)

- **sql.js** — Copyright (c) 2017 sql.js authors. MIT License.
  WebAssembly build of SQLite, used to run SQL queries in-browser
  (`public/sqljs/`). https://github.com/sql-js/sql.js

- **Pyodide** — Copyright (c) 2018-2024 Pyodide contributors.
  Mozilla Public License 2.0. WebAssembly build of CPython used to run
  Python in-browser (`public/pyodide/pyodide.js`, `pyodide.asm.*`).
  https://github.com/pyodide/pyodide/blob/main/LICENSE
  Per MPL-2.0, no modifications were made to the Pyodide distribution
  files themselves; Quaera only calls into them from
  `public/python-worker.js`.

  Packages loaded through Pyodide's package index at runtime
  (`public/pyodide/*.whl`, `sqlite3-1.0.0.zip`):
  - **NumPy** — BSD 3-Clause License.
  - **pandas** — BSD 3-Clause License.
  - **python-dateutil** — dual-licensed Apache-2.0 / BSD 3-Clause.
  - **pytz** — MIT License.
  - **six** — MIT License.
  - **CPython standard library** (`python_stdlib.zip`, including the
    `sqlite3` module) — Python Software Foundation License.

None of the above authors endorse or are affiliated with Quaera.
