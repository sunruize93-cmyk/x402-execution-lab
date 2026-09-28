# Licenses in the combined repository

| Component                                                                            | License                     | Notices                      |
| ------------------------------------------------------------------------------------ | --------------------------- | ---------------------------- |
| x402 payment checks, local driver, unified runner and documentation outside `bench/` | [MIT](LICENSE)              | [NOTICE](NOTICE)             |
| Arena Execution Bench, under `bench/`                                                | [Apache-2.0](bench/LICENSE) | [bench/NOTICE](bench/NOTICE) |

The benchmark was imported with its existing license and history. Moving it into
this repository does not relicense it as MIT. Retain the applicable license and
copyright notices when redistributing either component.

The npm package remains the MIT payment module; it does not distribute the Python
benchmark. The Python wheel distributes the Apache-2.0 benchmark. The combined
workflow is available from a repository checkout with both modules installed.
Dependencies retain their own licenses; see the component notices and package
metadata. This project is independently maintained.
