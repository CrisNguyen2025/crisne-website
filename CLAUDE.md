# crisne-website — Claude Code

Nguồn chính là `AGENTS.md`, dùng chung cho mọi agent. Sửa rule ở đó, không sửa ở đây. File này chỉ chứa phần riêng của Claude Code.

@AGENTS.md

## GitNexus qua MCP

- Impact trước khi sửa: `gitnexus_impact({target: "symbolName", direction: "upstream"})`
- Trước khi commit: `gitnexus_detect_changes()`
- Khám phá: `gitnexus_query({query: "concept"})` · chi tiết một symbol: `gitnexus_context({name: "symbolName"})`
- Đổi tên: `gitnexus_rename`, không find-and-replace
- Resources: `gitnexus://repo/crisne-website/{context,clusters,processes,process/{name}}`
