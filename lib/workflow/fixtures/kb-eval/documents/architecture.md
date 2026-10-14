# Workflow Engine Architecture

## Directed Acyclic Graph Execution
The workflow execution engine represents every workflow as a Directed Acyclic Graph (DAG). Nodes are executed according to their topological order. If two nodes have no dependencies on each other, they are evaluated independently. When a node encounters a failure, downstream dependent nodes are marked as CANCELLED.

## Condition Evaluation and Branching
Condition nodes evaluate incoming values against configured rules such as `contains`, `equals`, and `length_gt`. When a condition matches, only the active outgoing branch emits a value. Unselected branches emit a SKIPPED signal. The `else` branch activates if no prior condition branch matches.

## Merge Node Logic
A merge node brings multiple execution branches back together. It supports three modes: `first_active`, `join_strings`, and `concat_documents`. The `first_active` mode takes the first incoming input that was not SKIPPED. The `join_strings` mode joins all active string inputs with a configurable delimiter.

## Observability and Langfuse Tracing
Every workflow execution initiates a Langfuse root trace named `workflow-run`. Each node creates a dedicated span or generation observation. LLM nodes record prompt tokens, completion tokens, model name, and execution duration. RAG nodes record retrieved chunk IDs, similarity scores, and document metadata.
