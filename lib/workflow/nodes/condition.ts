import { ELSE_BRANCH, type ConditionBranch } from "../dsl-types";
import type { NodeHandler } from "../dag-executor";

/** contains / equals ignore case (equals also ignores surrounding spaces); length_gt counts characters. */
export function matchesBranch(value: string, branch: ConditionBranch): boolean {
  switch (branch.operator) {
    case "contains":
      return value.toLowerCase().includes(branch.value.toLowerCase());
    case "equals":
      return value.trim().toLowerCase() === branch.value.trim().toLowerCase();
    case "length_gt":
      return value.length > Number(branch.value);
  }
}

// First matching branch wins; the value passes through unchanged
export const conditionHandler: NodeHandler<"condition"> = async (node, inputs) => {
  const value = inputs.value as string;
  const branch = node.config.branches.find((b) => matchesBranch(value, b));
  return { outputs: { [branch?.name ?? ELSE_BRANCH]: value } };
};
